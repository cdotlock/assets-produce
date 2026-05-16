import { describe, expect, test } from "bun:test"
import { Effect, Layer, ManagedRuntime } from "effect"
import { Agent } from "@/agent/agent"
import { MessageID, SessionID } from "@/session/schema"
import { Truncate } from "@/tool/truncate"
import { makeGreenSpillClearTool } from "@/tool/asset/green-spill-clear"
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
  output: { path: "/tmp/_green_spill_clear_smoke/out.png" },
  meta: {
    delta: 5,
    bright_sum: 400,
    latency_ms: 42,
    atomic_tool: "green-spill-clear",
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
  inputPath: "/tmp/_green_spill_clear_smoke/in.png",
  outputPath: "/tmp/_green_spill_clear_smoke/out.png",
  mock: true,
}

async function buildExec(runner: PythonRunner = stubRunner()) {
  const info = await runtime.runPromise(makeGreenSpillClearTool({ runner }))
  return Effect.runPromise(info.init())
}

describe("green-spill-clear atomic tool", () => {
  test("dryRun=true returns the resolved Python invocation without calling the runner", async () => {
    let calls = 0
    const def = await buildExec(async () => {
      calls++
      return { stdout: "", stderr: "", exitCode: 0 }
    })
    const out = await runtime.runPromise(def.execute({ ...baseParams, dryRun: true }, ctx()))
    expect(calls).toBe(0)
    const parsed = JSON.parse(out.output)
    expect(parsed.tool).toBe("green-spill-clear")
    expect(parsed.input.input_path).toBe("/tmp/_green_spill_clear_smoke/in.png")
    expect((out.metadata as { dryRun?: boolean }).dryRun).toBe(true)
  })

  test("happy path parses stdout JSON and returns output path + meta", async () => {
    const def = await buildExec()
    const out = await runtime.runPromise(def.execute(baseParams, ctx()))
    expect(out.output).toBe("/tmp/_green_spill_clear_smoke/out.png")
    const meta = out.metadata as { outputPath?: string; delta?: number; brightSum?: number; mock?: boolean }
    expect(meta.outputPath).toBe("/tmp/_green_spill_clear_smoke/out.png")
    expect(meta.delta).toBe(5)
    expect(meta.brightSum).toBe(400)
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
    expect(out.title).toBe("green-spill-clear failed")
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
    expect(out.title).toBe("green-spill-clear failed")
    expect((out.metadata as { error?: boolean; message?: string }).error).toBe(true)
  })

  test("Python returns missing output key -> schema validation rejects (M1 regression)", async () => {
    const def = await buildExec(
      stubRunner({ stdout: JSON.stringify({ meta: { delta: 5 } }), exitCode: 0 }),
    )
    const out = await runtime.runPromise(def.execute(baseParams, ctx()))
    expect(out.title).toBe("green-spill-clear failed")
    expect((out.metadata as { error?: boolean }).error).toBe(true)
  })

  test("non-JSON stdout -> parse error metadata", async () => {
    const def = await buildExec(stubRunner({ stdout: "not json", exitCode: 0 }))
    const out = await runtime.runPromise(def.execute(baseParams, ctx()))
    expect(out.title).toBe("green-spill-clear parse error")
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

  test("delta param passes through to Python input", async () => {
    let receivedInput: Record<string, unknown> | undefined
    const customStdout = JSON.stringify({
      output: { path: "/tmp/_green_spill_clear_smoke/out.png" },
      meta: { delta: 8, bright_sum: 400, latency_ms: 10, atomic_tool: "green-spill-clear", mock: true },
    })
    const def = await buildExec(async (opts) => {
      receivedInput = opts.input as Record<string, unknown>
      return { stdout: customStdout, stderr: "", exitCode: 0 }
    })
    await runtime.runPromise(def.execute({ ...baseParams, delta: 8 }, ctx()))
    expect(receivedInput?.delta).toBe(8)
  })

  test("brightSum param passes through to Python input as bright_sum", async () => {
    let receivedInput: Record<string, unknown> | undefined
    const def = await buildExec(async (opts) => {
      receivedInput = opts.input as Record<string, unknown>
      return { stdout: okStdout, stderr: "", exitCode: 0 }
    })
    await runtime.runPromise(def.execute({ ...baseParams, brightSum: 350 }, ctx()))
    expect(receivedInput?.bright_sum).toBe(350)
  })

  test("runner throws -> caught by Effect.catch and surfaced as error metadata", async () => {
    const def = await buildExec(async () => {
      throw new Error("ENOENT: no such file")
    })
    const out = await runtime.runPromise(def.execute(baseParams, ctx()))
    expect(out.title).toBe("green-spill-clear failed")
    const meta = out.metadata as { error?: boolean; message?: string }
    expect(meta.error).toBe(true)
    expect(meta.message).toContain("ENOENT")
  })
})
