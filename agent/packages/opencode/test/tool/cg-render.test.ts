import { describe, expect, test } from "bun:test"
import { Effect, Layer, ManagedRuntime, Schema } from "effect"
import { Agent } from "@/agent/agent"
import { MessageID, SessionID } from "@/session/schema"
import { Truncate } from "@/tool/truncate"
import { makeCgRenderTool, Parameters as CgRenderParameters } from "@/tool/asset/cg-render"
import type { PythonRunner } from "@/tool/asset/python-runner"
import type { Tool } from "@/tool/tool"

const runtime = ManagedRuntime.make(Layer.mergeAll(Truncate.defaultLayer, Agent.defaultLayer))

// Minimal Tool.Context for tests. `agent`, `messages`, and the callbacks
// match the shape tool-define.test.ts uses (truncate path bypassed by
// `metadata.truncated: false` on every cg-render result).
const ctx = (): Tool.Context => ({
  sessionID: SessionID.descending(),
  messageID: MessageID.ascending(),
  abort: new AbortController().signal,
  callID: "call_test",
  agent: "build",
  messages: [],
  metadata() {
    return Effect.void
  },
  ask() {
    return Effect.void
  },
})

const okOutcomeStdout = JSON.stringify({
  outputs: [{ path: "/tmp/_cg_smoke/silver-moon-manor/cg/ep03_sylvia_glyph.webp", kind: "image" }],
  meta: {
    model: "gemini-3.1-flash-image-preview",
    latency_ms: 42,
    atomic_tool: "cg-render",
    mock: true,
  },
})

const stubRunner = (out: { stdout?: string; stderr?: string; exitCode?: number } = {}): PythonRunner =>
  async () => ({
    stdout: out.stdout ?? okOutcomeStdout,
    stderr: out.stderr ?? "",
    exitCode: out.exitCode ?? 0,
  })

const baseParams = {
  slug: "silver-moon-manor",
  cgName: "ep03_sylvia_glyph",
  prompt: "Sylvia raises hand; silver glyph ignites.",
  panelCount: 1,
  referenceImageUrls: ["https://oss.example.com/style.png", "https://oss.example.com/sprite.png"] as const,
  mock: true,
}

async function buildExec(runner: PythonRunner = stubRunner()) {
  const info = await runtime.runPromise(makeCgRenderTool({ runner }))
  const def = await Effect.runPromise(info.init())
  return def
}

describe("cg-render atomic tool", () => {
  test("dryRun=true returns the resolved Python invocation without calling the runner", async () => {
    let calls = 0
    const def = await buildExec(async () => {
      calls++
      return { stdout: "", stderr: "", exitCode: 0 }
    })
    const out = await runtime.runPromise(def.execute({ ...baseParams, dryRun: true }, ctx()))
    expect(calls).toBe(0)
    const parsed = JSON.parse(out.output)
    expect(parsed.tool).toBe("cg-render")
    expect(parsed.input.task.cg_name).toBe("ep03_sylvia_glyph")
    expect(parsed.input.task.reference_image_urls).toHaveLength(2)
    expect((out.metadata as { dryRun?: boolean }).dryRun).toBe(true)
  })

  test("happy path parses Python stdout JSON and returns localPath + meta", async () => {
    const def = await buildExec()
    const out = await runtime.runPromise(def.execute(baseParams, ctx()))
    expect(out.output).toBe("/tmp/_cg_smoke/silver-moon-manor/cg/ep03_sylvia_glyph.webp")
    const meta = out.metadata as {
      localPath?: string
      model?: string
      latencyMs?: number
      mock?: boolean
      cgName?: string
      refCount?: number
      error?: boolean
    }
    expect(meta.localPath).toBe("/tmp/_cg_smoke/silver-moon-manor/cg/ep03_sylvia_glyph.webp")
    expect(meta.model).toBe("gemini-3.1-flash-image-preview")
    expect(meta.latencyMs).toBe(42)
    expect(meta.mock).toBe(true)
    expect(meta.cgName).toBe("ep03_sylvia_glyph")
    expect(meta.refCount).toBe(2)
    expect(meta.error).toBeUndefined()
  })

  test("Python exit != 0 → error metadata, stderr surfaced", async () => {
    const def = await buildExec(
      stubRunner({
        stdout: "",
        stderr: '{"error":{"code":"INVALID_INPUT","message":"missing task"}}',
        exitCode: 2,
      }),
    )
    const out = await runtime.runPromise(def.execute(baseParams, ctx()))
    expect(out.title).toBe("cg-render failed")
    const meta = out.metadata as { error?: boolean; exitCode?: number; stderr?: string }
    expect(meta.error).toBe(true)
    expect(meta.exitCode).toBe(2)
    expect(meta.stderr).toContain("INVALID_INPUT")
  })

  test("non-JSON stdout from Python → parse error metadata", async () => {
    const def = await buildExec(stubRunner({ stdout: "definitely not json", exitCode: 0 }))
    const out = await runtime.runPromise(def.execute(baseParams, ctx()))
    expect(out.title).toBe("cg-render parse error")
    const meta = out.metadata as { error?: boolean; stdout?: string }
    expect(meta.error).toBe(true)
    expect(meta.stdout).toContain("definitely")
  })

  test("Python returns empty outputs[] → schema validation rejects (M1 regression)", async () => {
    const def = await buildExec(
      stubRunner({ stdout: JSON.stringify({ outputs: [], meta: {} }), exitCode: 0 }),
    )
    const out = await runtime.runPromise(def.execute(baseParams, ctx()))
    expect(out.title).toBe("cg-render failed")
    const meta = out.metadata as { error?: boolean; message?: string }
    expect(meta.error).toBe(true)
    expect(meta.message).toContain("schema")
  })

  test("Python returns null path → schema validation rejects (M1 regression)", async () => {
    const def = await buildExec(
      stubRunner({
        stdout: JSON.stringify({ outputs: [{ path: null, kind: "image" }], meta: {} }),
        exitCode: 0,
      }),
    )
    const out = await runtime.runPromise(def.execute(baseParams, ctx()))
    expect(out.title).toBe("cg-render failed")
    const meta = out.metadata as { error?: boolean; message?: string }
    expect(meta.error).toBe(true)
  })

  test("Python returns missing outputs key → schema validation rejects (M1 regression)", async () => {
    const def = await buildExec(
      stubRunner({ stdout: JSON.stringify({ meta: { model: "x" } }), exitCode: 0 }),
    )
    const out = await runtime.runPromise(def.execute(baseParams, ctx()))
    expect(out.title).toBe("cg-render failed")
    expect((out.metadata as { error?: boolean }).error).toBe(true)
  })

  test("runner throws → caught by Effect.catch and surfaced as error metadata", async () => {
    const def = await buildExec(async () => {
      throw new Error("spawn failed: ENOENT")
    })
    const out = await runtime.runPromise(def.execute(baseParams, ctx()))
    expect(out.title).toBe("cg-render failed")
    const meta = out.metadata as { error?: boolean; message?: string }
    expect(meta.error).toBe(true)
    expect(meta.message).toContain("spawn failed")
  })

  test("default model is the gemini preview when none is supplied", async () => {
    let receivedInput: any
    const def = await buildExec(async (opts) => {
      receivedInput = opts.input
      return { stdout: okOutcomeStdout, stderr: "", exitCode: 0 }
    })
    await runtime.runPromise(def.execute(baseParams, ctx()))
    expect(receivedInput?.task?.model).toBe("gemini-3.1-flash-image-preview")
  })

  test("explicit model is passed through to the runner input", async () => {
    let receivedInput: any
    const def = await buildExec(async (opts) => {
      receivedInput = opts.input
      return { stdout: okOutcomeStdout, stderr: "", exitCode: 0 }
    })
    await runtime.runPromise(def.execute({ ...baseParams, model: "gemini-2.5" }, ctx()))
    expect(receivedInput?.task?.model).toBe("gemini-2.5")
  })

  test("--mock CLI flag is added to extraArgs when mock=true", async () => {
    let receivedArgs: readonly string[] | undefined
    const def = await buildExec(async (opts) => {
      receivedArgs = opts.extraArgs
      return { stdout: okOutcomeStdout, stderr: "", exitCode: 0 }
    })
    await runtime.runPromise(def.execute(baseParams, ctx()))
    expect(receivedArgs).toContain("--mock")
  })

  test("schema rejects path-traversal slug (H1 regression)", () => {
    const decode = Schema.decodeUnknownEffect(CgRenderParameters)
    const tries = [
      { ...baseParams, slug: "../etc" },
      { ...baseParams, slug: "../../passwd" },
      { ...baseParams, slug: "a/b" },
      { ...baseParams, slug: ".hidden" },
      { ...baseParams, slug: "" },
    ]
    for (const t of tries) {
      const exit = Effect.runSyncExit(decode(t))
      expect(exit._tag).toBe("Failure")
    }
  })

  test("schema rejects path-traversal cgName (H1 regression)", () => {
    const decode = Schema.decodeUnknownEffect(CgRenderParameters)
    const exit = Effect.runSyncExit(decode({ ...baseParams, cgName: "../../etc/passwd" }))
    expect(exit._tag).toBe("Failure")
  })

  test("schema accepts well-formed identifiers", () => {
    const decode = Schema.decodeUnknownEffect(CgRenderParameters)
    const exit = Effect.runSyncExit(decode(baseParams))
    expect(exit._tag).toBe("Success")
  })

  test("--mock is NOT added when mock=false", async () => {
    let receivedArgs: readonly string[] | undefined
    const def = await buildExec(async (opts) => {
      receivedArgs = opts.extraArgs
      return { stdout: okOutcomeStdout, stderr: "", exitCode: 0 }
    })
    await runtime.runPromise(def.execute({ ...baseParams, mock: false }, ctx()))
    expect(receivedArgs).not.toContain("--mock")
  })
})
