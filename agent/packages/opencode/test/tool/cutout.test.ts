import { describe, expect, test } from "bun:test"
import { Effect, Layer, ManagedRuntime } from "effect"
import { Agent } from "@/agent/agent"
import { MessageID, SessionID } from "@/session/schema"
import { Truncate } from "@/tool/truncate"
import { makeCutoutTool } from "@/tool/asset/cutout"
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
  output: { path: "/tmp/_cutout_smoke/out.png" },
  meta: {
    hue_low: 80.0,
    hue_high: 160.0,
    sat_min: 0.3,
    val_min: 0.25,
    feather: 0.8,
    latency_ms: 42,
    atomic_tool: "cutout",
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
  inputPath: "/tmp/_cutout_smoke/in.png",
  outputPath: "/tmp/_cutout_smoke/out.png",
  mock: true,
}

async function buildExec(runner: PythonRunner = stubRunner()) {
  const info = await runtime.runPromise(makeCutoutTool({ runner }))
  return Effect.runPromise(info.init())
}

describe("cutout atomic tool", () => {
  test("dryRun=true returns the resolved Python invocation without calling the runner", async () => {
    let calls = 0
    const def = await buildExec(async () => {
      calls++
      return { stdout: "", stderr: "", exitCode: 0 }
    })
    const out = await runtime.runPromise(def.execute({ ...baseParams, dryRun: true }, ctx()))
    expect(calls).toBe(0)
    const parsed = JSON.parse(out.output)
    expect(parsed.tool).toBe("cutout")
    expect(parsed.input.input_path).toBe("/tmp/_cutout_smoke/in.png")
    expect((out.metadata as { dryRun?: boolean }).dryRun).toBe(true)
  })

  test("happy path parses stdout JSON and returns output path + meta", async () => {
    const def = await buildExec()
    const out = await runtime.runPromise(def.execute(baseParams, ctx()))
    expect(out.output).toBe("/tmp/_cutout_smoke/out.png")
    const meta = out.metadata as {
      outputPath?: string
      hueLow?: number
      hueHigh?: number
      satMin?: number
      valMin?: number
      feather?: number
      mock?: boolean
    }
    expect(meta.outputPath).toBe("/tmp/_cutout_smoke/out.png")
    expect(meta.hueLow).toBe(80.0)
    expect(meta.hueHigh).toBe(160.0)
    expect(meta.satMin).toBe(0.3)
    expect(meta.valMin).toBe(0.25)
    expect(meta.feather).toBe(0.8)
    expect(meta.mock).toBe(true)
  })

  test("Python exit != 0 -> error metadata, stderr surfaced", async () => {
    const def = await buildExec(
      stubRunner({
        stdout: "",
        stderr: '{"error":{"code":"ATOMIC_TOOL_FAILED","message":"Pillow decode failed"}}',
        exitCode: 4,
      }),
    )
    const out = await runtime.runPromise(def.execute(baseParams, ctx()))
    expect(out.title).toBe("cutout failed")
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
    expect(out.title).toBe("cutout failed")
    expect((out.metadata as { error?: boolean; message?: string }).error).toBe(true)
  })

  test("Python returns missing output key -> schema validation rejects (M1 regression)", async () => {
    const def = await buildExec(
      stubRunner({ stdout: JSON.stringify({ meta: { hue_low: 80 } }), exitCode: 0 }),
    )
    const out = await runtime.runPromise(def.execute(baseParams, ctx()))
    expect(out.title).toBe("cutout failed")
    expect((out.metadata as { error?: boolean }).error).toBe(true)
  })

  test("non-JSON stdout -> parse error metadata", async () => {
    const def = await buildExec(stubRunner({ stdout: "not json", exitCode: 0 }))
    const out = await runtime.runPromise(def.execute(baseParams, ctx()))
    expect(out.title).toBe("cutout parse error")
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
      output: { path: "/tmp/_cutout_smoke/out.png" },
      meta: {
        hue_low: 80,
        hue_high: 160,
        sat_min: 0.3,
        val_min: 0.25,
        feather: 0.8,
        latency_ms: 5,
        atomic_tool: "cutout",
        mock: false,
      },
    })
    let receivedArgs: readonly string[] | undefined
    const def = await buildExec(async (opts) => {
      receivedArgs = opts.extraArgs
      return { stdout: noMockStdout, stderr: "", exitCode: 0 }
    })
    await runtime.runPromise(def.execute({ ...baseParams, mock: false }, ctx()))
    expect(receivedArgs).not.toContain("--mock")
  })

  test("HSV params pass through to Python input with snake_case keys", async () => {
    let receivedInput: Record<string, unknown> | undefined
    const def = await buildExec(async (opts) => {
      receivedInput = opts.input as Record<string, unknown>
      return { stdout: okStdout, stderr: "", exitCode: 0 }
    })
    await runtime.runPromise(
      def.execute(
        { ...baseParams, hueLow: 90, hueHigh: 150, satMin: 0.4, valMin: 0.2, feather: 1.5 },
        ctx(),
      ),
    )
    expect(receivedInput?.hue_low).toBe(90)
    expect(receivedInput?.hue_high).toBe(150)
    expect(receivedInput?.sat_min).toBe(0.4)
    expect(receivedInput?.val_min).toBe(0.2)
    expect(receivedInput?.feather).toBe(1.5)
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
    expect(out.title).toBe("cutout failed")
    const meta = out.metadata as { error?: boolean; message?: string }
    expect(meta.error).toBe(true)
    expect(meta.message).toContain("ENOENT")
  })
})
