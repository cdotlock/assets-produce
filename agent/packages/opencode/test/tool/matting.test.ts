import { describe, expect, test } from "bun:test"
import { Effect, Layer, ManagedRuntime } from "effect"
import { Agent } from "@/agent/agent"
import { MessageID, SessionID } from "@/session/schema"
import { Truncate } from "@/tool/truncate"
import { makeMattingTool } from "@/tool/asset/matting"
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
  output: { path: "/tmp/_matting_smoke/out_matted.webp" },
  meta: {
    format: "webp",
    device: "cpu",
    latency_ms: 1234,
    atomic_tool: "matting",
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
  inputPath: "/tmp/_matting_smoke/in.png",
  outputPath: "/tmp/_matting_smoke/out_matted.webp",
  format: "webp",
  mock: true,
}

async function buildExec(runner: PythonRunner = stubRunner()) {
  const info = await runtime.runPromise(makeMattingTool({ runner }))
  return Effect.runPromise(info.init())
}

describe("matting atomic tool", () => {
  test("dryRun=true returns the resolved Python invocation without calling the runner", async () => {
    let calls = 0
    const def = await buildExec(async () => {
      calls++
      return { stdout: "", stderr: "", exitCode: 0 }
    })
    const out = await runtime.runPromise(def.execute({ ...baseParams, dryRun: true }, ctx()))
    expect(calls).toBe(0)
    const parsed = JSON.parse(out.output)
    expect(parsed.tool).toBe("matting")
    expect(parsed.input.input_path).toBe("/tmp/_matting_smoke/in.png")
    expect(parsed.input.format).toBe("webp")
    expect((out.metadata as { dryRun?: boolean }).dryRun).toBe(true)
  })

  test("invalid format → error metadata, runner not called", async () => {
    let calls = 0
    const def = await buildExec(async () => {
      calls++
      return { stdout: "", stderr: "", exitCode: 0 }
    })
    const out = await runtime.runPromise(
      def.execute({ ...baseParams, format: "gif" }, ctx()),
    )
    expect(calls).toBe(0)
    expect((out.metadata as { error?: boolean; message?: string }).error).toBe(true)
    expect((out.metadata as { message?: string }).message).toContain("format=gif")
  })

  test("happy path parses stdout JSON and returns output path + meta", async () => {
    const def = await buildExec()
    const out = await runtime.runPromise(def.execute(baseParams, ctx()))
    expect(out.output).toBe("/tmp/_matting_smoke/out_matted.webp")
    const meta = out.metadata as { outputPath?: string; format?: string; device?: string; mock?: boolean }
    expect(meta.outputPath).toBe("/tmp/_matting_smoke/out_matted.webp")
    expect(meta.format).toBe("webp")
    expect(meta.device).toBe("cpu")
    expect(meta.mock).toBe(true)
  })

  test("Python exit != 0 → error metadata, stderr surfaced", async () => {
    const def = await buildExec(
      stubRunner({
        stdout: "",
        stderr: '{"error":{"code":"ATOMIC_TOOL_FAILED","message":"MODNet weights missing"}}',
        exitCode: 4,
      }),
    )
    const out = await runtime.runPromise(def.execute(baseParams, ctx()))
    expect(out.title).toBe("matting failed")
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
    expect(out.title).toBe("matting failed")
    expect((out.metadata as { error?: boolean; message?: string }).error).toBe(true)
  })

  test("Python returns missing output key → schema validation rejects (M1 regression)", async () => {
    const def = await buildExec(
      stubRunner({ stdout: JSON.stringify({ meta: { format: "webp" } }), exitCode: 0 }),
    )
    const out = await runtime.runPromise(def.execute(baseParams, ctx()))
    expect(out.title).toBe("matting failed")
    expect((out.metadata as { error?: boolean }).error).toBe(true)
  })

  test("non-JSON stdout → parse error metadata", async () => {
    const def = await buildExec(stubRunner({ stdout: "not json", exitCode: 0 }))
    const out = await runtime.runPromise(def.execute(baseParams, ctx()))
    expect(out.title).toBe("matting parse error")
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

  test("format=png passes through to the Python input", async () => {
    let receivedInput: Record<string, unknown> | undefined
    const pngStdout = JSON.stringify({
      output: { path: "/tmp/_matting_smoke/out_matted.png" },
      meta: { format: "png", device: "cpu", latency_ms: 999, atomic_tool: "matting", mock: true },
    })
    const def = await buildExec(async (opts) => {
      receivedInput = opts.input as Record<string, unknown>
      return { stdout: pngStdout, stderr: "", exitCode: 0 }
    })
    await runtime.runPromise(def.execute({ ...baseParams, format: "png" }, ctx()))
    expect(receivedInput?.format).toBe("png")
  })

  test("device passes through to the Python input when provided", async () => {
    let receivedInput: Record<string, unknown> | undefined
    const def = await buildExec(async (opts) => {
      receivedInput = opts.input as Record<string, unknown>
      return { stdout: okStdout, stderr: "", exitCode: 0 }
    })
    await runtime.runPromise(def.execute({ ...baseParams, device: "cuda" }, ctx()))
    expect(receivedInput?.device).toBe("cuda")
  })

  test("device is omitted from the Python input when the param is absent", async () => {
    let receivedInput: Record<string, unknown> | undefined
    const def = await buildExec(async (opts) => {
      receivedInput = opts.input as Record<string, unknown>
      return { stdout: okStdout, stderr: "", exitCode: 0 }
    })
    await runtime.runPromise(def.execute(baseParams, ctx()))
    expect(receivedInput && "device" in receivedInput).toBeFalsy()
  })

  test("runner throws → caught by Effect.catch and surfaced as error metadata", async () => {
    const def = await buildExec(async () => {
      throw new Error("ENOENT: no such file")
    })
    const out = await runtime.runPromise(def.execute(baseParams, ctx()))
    expect(out.title).toBe("matting failed")
    const meta = out.metadata as { error?: boolean; message?: string }
    expect(meta.error).toBe(true)
    expect(meta.message).toContain("ENOENT")
  })
})
