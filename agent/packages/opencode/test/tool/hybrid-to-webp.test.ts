import { describe, expect, test } from "bun:test"
import { Effect, Layer, ManagedRuntime } from "effect"
import { Agent } from "@/agent/agent"
import { MessageID, SessionID } from "@/session/schema"
import { Truncate } from "@/tool/truncate"
import { makeHybridToWebpTool } from "@/tool/asset/hybrid-to-webp"
import type { PythonRunner } from "@/tool/asset/python-runner"
import type { Tool } from "@/tool/tool"

const runtime = ManagedRuntime.make(Layer.mergeAll(Truncate.defaultLayer, Agent.defaultLayer))

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

const okStdout = JSON.stringify({
  output: { path: "/tmp/_hybrid_to_webp_smoke/out.webp" },
  meta: {
    quality: 90,
    method: 6,
    latency_ms: 42,
    atomic_tool: "hybrid-to-webp",
    mock: true,
  },
})

const stubRunner = (out: { stdout?: string; stderr?: string; exitCode?: number } = {}): PythonRunner =>
  async () => ({
    stdout: out.stdout ?? okStdout,
    stderr: out.stderr ?? "",
    exitCode: out.exitCode ?? 0,
  })

const baseParams = {
  inputPath: "/tmp/_hybrid_to_webp_smoke/in.png",
  outputPath: "/tmp/_hybrid_to_webp_smoke/out.webp",
  mock: true,
}

async function buildExec(runner: PythonRunner = stubRunner()) {
  const info = await runtime.runPromise(makeHybridToWebpTool({ runner }))
  return Effect.runPromise(info.init())
}

describe("hybrid-to-webp atomic tool", () => {
  test("dryRun=true returns the resolved Python invocation without calling the runner", async () => {
    let calls = 0
    const def = await buildExec(async () => {
      calls++
      return { stdout: "", stderr: "", exitCode: 0 }
    })
    const out = await runtime.runPromise(def.execute({ ...baseParams, dryRun: true }, ctx()))
    expect(calls).toBe(0)
    const parsed = JSON.parse(out.output)
    expect(parsed.tool).toBe("hybrid-to-webp")
    expect(parsed.input.input_path).toBe("/tmp/_hybrid_to_webp_smoke/in.png")
    expect((out.metadata as { dryRun?: boolean }).dryRun).toBe(true)
  })

  test("happy path parses stdout JSON and returns output path + meta", async () => {
    const def = await buildExec()
    const out = await runtime.runPromise(def.execute(baseParams, ctx()))
    expect(out.output).toBe("/tmp/_hybrid_to_webp_smoke/out.webp")
    const meta = out.metadata as { outputPath?: string; quality?: number; method?: number; mock?: boolean }
    expect(meta.outputPath).toBe("/tmp/_hybrid_to_webp_smoke/out.webp")
    expect(meta.quality).toBe(90)
    expect(meta.method).toBe(6)
    expect(meta.mock).toBe(true)
  })

  test("Python exit != 0 → error metadata, stderr surfaced", async () => {
    const def = await buildExec(
      stubRunner({
        stdout: "",
        stderr: '{"error":{"code":"ATOMIC_TOOL_FAILED","message":"Pillow encode failed"}}',
        exitCode: 4,
      }),
    )
    const out = await runtime.runPromise(def.execute(baseParams, ctx()))
    expect(out.title).toBe("hybrid-to-webp failed")
    const meta = out.metadata as { error?: boolean; exitCode?: number; stderr?: string }
    expect(meta.error).toBe(true)
    expect(meta.exitCode).toBe(4)
    expect(meta.stderr).toContain("ATOMIC_TOOL_FAILED")
  })

  test("Python returns null output path → schema validation rejects (M1 regression)", async () => {
    const def = await buildExec(
      stubRunner({
        stdout: JSON.stringify({ output: { path: null }, meta: {} }),
        exitCode: 0,
      }),
    )
    const out = await runtime.runPromise(def.execute(baseParams, ctx()))
    expect(out.title).toBe("hybrid-to-webp failed")
    expect((out.metadata as { error?: boolean; message?: string }).error).toBe(true)
  })

  test("Python returns missing output key → schema validation rejects (M1 regression)", async () => {
    const def = await buildExec(
      stubRunner({ stdout: JSON.stringify({ meta: { quality: 90 } }), exitCode: 0 }),
    )
    const out = await runtime.runPromise(def.execute(baseParams, ctx()))
    expect(out.title).toBe("hybrid-to-webp failed")
    expect((out.metadata as { error?: boolean }).error).toBe(true)
  })

  test("non-JSON stdout → parse error metadata", async () => {
    const def = await buildExec(stubRunner({ stdout: "not json", exitCode: 0 }))
    const out = await runtime.runPromise(def.execute(baseParams, ctx()))
    expect(out.title).toBe("hybrid-to-webp parse error")
    expect((out.metadata as { error?: boolean }).error).toBe(true)
  })

  test("--mock flag is appended when mock=true", async () => {
    let receivedArgs: readonly string[] | undefined
    const def = await buildExec(async (opts) => {
      receivedArgs = opts.extraArgs
      return { stdout: okStdout, stderr: "", exitCode: 0 }
    })
    await runtime.runPromise(def.execute(baseParams, ctx()))
    expect(receivedArgs).toContain("--mock")
  })

  test("quality param passes through to Python input", async () => {
    let receivedInput: Record<string, unknown> | undefined
    const customStdout = JSON.stringify({
      output: { path: "/tmp/_hybrid_to_webp_smoke/out.webp" },
      meta: { quality: 75, method: 6, latency_ms: 10, atomic_tool: "hybrid-to-webp", mock: true },
    })
    const def = await buildExec(async (opts) => {
      receivedInput = opts.input as Record<string, unknown>
      return { stdout: customStdout, stderr: "", exitCode: 0 }
    })
    await runtime.runPromise(def.execute({ ...baseParams, quality: 75 }, ctx()))
    expect(receivedInput?.quality).toBe(75)
  })

  test("method param passes through to Python input", async () => {
    let receivedInput: Record<string, unknown> | undefined
    const def = await buildExec(async (opts) => {
      receivedInput = opts.input as Record<string, unknown>
      return { stdout: okStdout, stderr: "", exitCode: 0 }
    })
    await runtime.runPromise(def.execute({ ...baseParams, method: 4 }, ctx()))
    expect(receivedInput?.method).toBe(4)
  })

  test("runner throws → caught by Effect.catch and surfaced as error metadata", async () => {
    const def = await buildExec(async () => {
      throw new Error("ENOENT: no such file")
    })
    const out = await runtime.runPromise(def.execute(baseParams, ctx()))
    expect(out.title).toBe("hybrid-to-webp failed")
    const meta = out.metadata as { error?: boolean; message?: string }
    expect(meta.error).toBe(true)
    expect(meta.message).toContain("ENOENT")
  })
})
