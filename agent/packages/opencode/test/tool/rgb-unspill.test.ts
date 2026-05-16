import { describe, expect, test } from "bun:test"
import { Effect, Layer, ManagedRuntime } from "effect"
import { Agent } from "@/agent/agent"
import { MessageID, SessionID } from "@/session/schema"
import { Truncate } from "@/tool/truncate"
import { makeRgbUnspillTool } from "@/tool/asset/rgb-unspill"
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
  output: { path: "/tmp/_rgb_unspill_smoke/out.png" },
  meta: {
    format: "png",
    latency_ms: 42,
    atomic_tool: "rgb-unspill",
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
  inputPath: "/tmp/_rgb_unspill_smoke/in.png",
  outputPath: "/tmp/_rgb_unspill_smoke/out.png",
  mock: true,
}

async function buildExec(runner: PythonRunner = stubRunner()) {
  const info = await runtime.runPromise(makeRgbUnspillTool({ runner }))
  return Effect.runPromise(info.init())
}

describe("rgb-unspill atomic tool", () => {
  test("dryRun=true returns the resolved Python invocation without calling the runner", async () => {
    let calls = 0
    const def = await buildExec(async () => {
      calls++
      return { stdout: "", stderr: "", exitCode: 0 }
    })
    const out = await runtime.runPromise(def.execute({ ...baseParams, dryRun: true }, ctx()))
    expect(calls).toBe(0)
    const parsed = JSON.parse(out.output)
    expect(parsed.tool).toBe("rgb-unspill")
    expect(parsed.input.input_path).toBe("/tmp/_rgb_unspill_smoke/in.png")
    expect((out.metadata as { dryRun?: boolean }).dryRun).toBe(true)
  })

  test("happy path parses stdout JSON and returns output path + meta", async () => {
    const def = await buildExec()
    const out = await runtime.runPromise(def.execute(baseParams, ctx()))
    expect(out.output).toBe("/tmp/_rgb_unspill_smoke/out.png")
    const meta = out.metadata as { outputPath?: string; format?: string; mock?: boolean }
    expect(meta.outputPath).toBe("/tmp/_rgb_unspill_smoke/out.png")
    expect(meta.format).toBe("png")
    expect(meta.mock).toBe(true)
  })

  test("Python exit != 0 -> error metadata, stderr surfaced", async () => {
    const def = await buildExec(
      stubRunner({
        stdout: "",
        stderr: '{"error":{"code":"ATOMIC_TOOL_FAILED","message":"numpy processing failed"}}',
        exitCode: 4,
      }),
    )
    const out = await runtime.runPromise(def.execute(baseParams, ctx()))
    expect(out.title).toBe("rgb-unspill failed")
    const meta = out.metadata as { error?: boolean; exitCode?: number; stderr?: string }
    expect(meta.error).toBe(true)
    expect(meta.exitCode).toBe(4)
    expect(meta.stderr).toContain("ATOMIC_TOOL_FAILED")
  })

  test("Python returns null output path -> schema validation rejects (M1 regression)", async () => {
    const def = await buildExec(
      stubRunner({
        stdout: JSON.stringify({ output: { path: null }, meta: {} }),
        exitCode: 0,
      }),
    )
    const out = await runtime.runPromise(def.execute(baseParams, ctx()))
    expect(out.title).toBe("rgb-unspill failed")
    expect((out.metadata as { error?: boolean; message?: string }).error).toBe(true)
  })

  test("Python returns missing output key -> schema validation rejects (M1 regression)", async () => {
    const def = await buildExec(
      stubRunner({ stdout: JSON.stringify({ meta: { format: "png" } }), exitCode: 0 }),
    )
    const out = await runtime.runPromise(def.execute(baseParams, ctx()))
    expect(out.title).toBe("rgb-unspill failed")
    expect((out.metadata as { error?: boolean }).error).toBe(true)
  })

  test("non-JSON stdout -> parse error metadata", async () => {
    const def = await buildExec(stubRunner({ stdout: "not json", exitCode: 0 }))
    const out = await runtime.runPromise(def.execute(baseParams, ctx()))
    expect(out.title).toBe("rgb-unspill parse error")
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

  test("--mock flag is NOT appended when mock=false", async () => {
    const noMockStdout = JSON.stringify({
      output: { path: "/tmp/_rgb_unspill_smoke/out.png" },
      meta: { format: "png", latency_ms: 5, atomic_tool: "rgb-unspill", mock: false },
    })
    let receivedArgs: readonly string[] | undefined
    const def = await buildExec(async (opts) => {
      receivedArgs = opts.extraArgs
      return { stdout: noMockStdout, stderr: "", exitCode: 0 }
    })
    await runtime.runPromise(def.execute({ ...baseParams, mock: false }, ctx()))
    expect(receivedArgs).not.toContain("--mock")
  })

  test("overwrite param passes through to Python input", async () => {
    let receivedInput: Record<string, unknown> | undefined
    const def = await buildExec(async (opts) => {
      receivedInput = opts.input as Record<string, unknown>
      return { stdout: okStdout, stderr: "", exitCode: 0 }
    })
    await runtime.runPromise(def.execute({ ...baseParams, overwrite: true }, ctx()))
    expect(receivedInput?.overwrite).toBe(true)
  })

  test("runner throws -> caught by Effect.catch and surfaced as error metadata", async () => {
    const def = await buildExec(async () => {
      throw new Error("ENOENT: no such file")
    })
    const out = await runtime.runPromise(def.execute(baseParams, ctx()))
    expect(out.title).toBe("rgb-unspill failed")
    const meta = out.metadata as { error?: boolean; message?: string }
    expect(meta.error).toBe(true)
    expect(meta.message).toContain("ENOENT")
  })
})
