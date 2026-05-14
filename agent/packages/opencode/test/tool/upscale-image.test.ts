import { describe, expect, test } from "bun:test"
import { Effect, Layer, ManagedRuntime } from "effect"
import { Agent } from "@/agent/agent"
import { MessageID, SessionID } from "@/session/schema"
import { Truncate } from "@/tool/truncate"
import { makeUpscaleImageTool } from "@/tool/asset/upscale-image"
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
  output: { path: "/tmp/_upscale_smoke/out_upscaled.png" },
  meta: {
    scale: 2,
    model: "realesrgan-x4plus-anime",
    latency_ms: 39120,
    atomic_tool: "upscale-image",
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
  inputPath: "/tmp/_upscale_smoke/in.png",
  outputPath: "/tmp/_upscale_smoke/out_upscaled.png",
  scale: 2,
  mock: true,
}

async function buildExec(runner: PythonRunner = stubRunner()) {
  const info = await runtime.runPromise(makeUpscaleImageTool({ runner }))
  return Effect.runPromise(info.init())
}

describe("upscale-image atomic tool", () => {
  test("dryRun=true returns the resolved Python invocation without calling the runner", async () => {
    let calls = 0
    const def = await buildExec(async () => {
      calls++
      return { stdout: "", stderr: "", exitCode: 0 }
    })
    const out = await runtime.runPromise(def.execute({ ...baseParams, dryRun: true }, ctx()))
    expect(calls).toBe(0)
    const parsed = JSON.parse(out.output)
    expect(parsed.tool).toBe("upscale-image")
    expect(parsed.input.input_path).toBe("/tmp/_upscale_smoke/in.png")
    expect(parsed.input.scale).toBe(2)
    expect((out.metadata as { dryRun?: boolean }).dryRun).toBe(true)
  })

  test("invalid scale → error metadata, runner not called", async () => {
    let calls = 0
    const def = await buildExec(async () => {
      calls++
      return { stdout: "", stderr: "", exitCode: 0 }
    })
    const out = await runtime.runPromise(def.execute({ ...baseParams, scale: 3 }, ctx()))
    expect(calls).toBe(0)
    expect((out.metadata as { error?: boolean; message?: string }).error).toBe(true)
    expect((out.metadata as { message?: string }).message).toContain("scale=3")
  })

  test("happy path parses stdout JSON and returns output path + meta", async () => {
    const def = await buildExec()
    const out = await runtime.runPromise(def.execute(baseParams, ctx()))
    expect(out.output).toBe("/tmp/_upscale_smoke/out_upscaled.png")
    const meta = out.metadata as { outputPath?: string; scale?: number; model?: string; mock?: boolean }
    expect(meta.outputPath).toBe("/tmp/_upscale_smoke/out_upscaled.png")
    expect(meta.scale).toBe(2)
    expect(meta.model).toBe("realesrgan-x4plus-anime")
    expect(meta.mock).toBe(true)
  })

  test("Python exit != 0 → error metadata, stderr surfaced", async () => {
    const def = await buildExec(
      stubRunner({
        stdout: "",
        stderr: '{"error":{"code":"ATOMIC_TOOL_FAILED","message":"binary missing"}}',
        exitCode: 4,
      }),
    )
    const out = await runtime.runPromise(def.execute(baseParams, ctx()))
    expect(out.title).toBe("upscale-image failed")
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
    expect(out.title).toBe("upscale-image failed")
    expect((out.metadata as { error?: boolean; message?: string }).error).toBe(true)
  })

  test("Python returns missing output key → schema validation rejects (M1 regression)", async () => {
    const def = await buildExec(
      stubRunner({ stdout: JSON.stringify({ meta: { scale: 2 } }), exitCode: 0 }),
    )
    const out = await runtime.runPromise(def.execute(baseParams, ctx()))
    expect(out.title).toBe("upscale-image failed")
    expect((out.metadata as { error?: boolean }).error).toBe(true)
  })

  test("non-JSON stdout → parse error metadata", async () => {
    const def = await buildExec(stubRunner({ stdout: "not json", exitCode: 0 }))
    const out = await runtime.runPromise(def.execute(baseParams, ctx()))
    expect(out.title).toBe("upscale-image parse error")
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

  test("scale=4 passes through to the Python input", async () => {
    let receivedInput: any
    const def = await buildExec(async (opts) => {
      receivedInput = opts.input
      return { stdout: okStdout, stderr: "", exitCode: 0 }
    })
    await runtime.runPromise(def.execute({ ...baseParams, scale: 4 }, ctx()))
    expect(receivedInput?.scale).toBe(4)
  })

  test("runner throws → caught by Effect.catch and surfaced as error metadata", async () => {
    const def = await buildExec(async () => {
      throw new Error("ENOENT: no such file")
    })
    const out = await runtime.runPromise(def.execute(baseParams, ctx()))
    expect(out.title).toBe("upscale-image failed")
    const meta = out.metadata as { error?: boolean; message?: string }
    expect(meta.error).toBe(true)
    expect(meta.message).toContain("ENOENT")
  })
})
