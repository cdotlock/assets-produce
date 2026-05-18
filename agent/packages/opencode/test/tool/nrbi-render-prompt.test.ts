import { afterEach, describe, expect, test } from "bun:test"
import { Effect, Layer, ManagedRuntime, Schema } from "effect"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { Agent } from "@/agent/agent"
import { MessageID, SessionID } from "@/session/schema"
import { Truncate } from "@/tool/truncate"
import { ToolRegistry } from "@/tool/registry"
import { makeNrbiRenderPromptTool, Parameters } from "@/tool/asset/nrbi-render-prompt"
import type { PythonRunner } from "@/tool/asset/python-runner"
import type { Tool } from "@/tool/tool"
import { Instance } from "../../src/project/instance"
import { provideTmpdirInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

const runtime = ManagedRuntime.make(Layer.mergeAll(Truncate.defaultLayer, Agent.defaultLayer))

// Minimal Tool.Context for tests — mirrors cg-render.test.ts exactly. The
// truncate path is bypassed because every nrbi-render-prompt result sets
// `metadata.truncated: false`.
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
  prompt: "ASSEMBLED",
  reference_image_urls: ["https://oss.example.com/ref.png"],
  model: "image-gpt",
  style_name: "YA_Impasto_character",
  category: "character series illustration",
  layer: "A",
  meta: { atomic_tool: "nrbi-render-prompt", mock: false },
})

const stubRunner = (o: { stdout?: string; stderr?: string; exitCode?: number } = {}): PythonRunner =>
  async () => ({
    stdout: o.stdout ?? okStdout,
    stderr: o.stderr ?? "",
    exitCode: o.exitCode ?? 0,
  })

async function buildExec(runner: PythonRunner = stubRunner()) {
  const info = await runtime.runPromise(makeNrbiRenderPromptTool({ runner }))
  const def = await Effect.runPromise(info.init())
  return def
}

describe("nrbi-render-prompt tool", () => {
  test("happy path returns the assembled prompt + decoded metadata", async () => {
    const def = await buildExec()
    const out = await runtime.runPromise(
      def.execute({ layer: "A", variable_text: { orig_prompt: "x" } }, ctx()),
    )
    const meta = out.metadata as { error?: boolean; model?: string }
    expect(meta.error).toBeUndefined()
    expect(out.output).toContain("ASSEMBLED")
    expect(meta.model).toBe("image-gpt")
  })

  test("dryRun does not call the runner", async () => {
    let called = false
    const def = await buildExec(async () => {
      called = true
      return { stdout: "", stderr: "", exitCode: 0 }
    })
    const out = await runtime.runPromise(
      def.execute({ layer: "A", variable_text: { orig_prompt: "x" }, dryRun: true }, ctx()),
    )
    expect(called).toBe(false)
    expect((out.metadata as { dryRun?: boolean }).dryRun).toBe(true)
  })

  test("non-zero exit surfaces as failure", async () => {
    const def = await buildExec(
      stubRunner({
        exitCode: 2,
        stderr: JSON.stringify({ error: { code: "INVALID_INPUT", message: "bad" } }),
      }),
    )
    const out = await runtime.runPromise(def.execute({ layer: "A", variable_text: {} }, ctx()))
    expect((out.metadata as { error?: boolean }).error).toBe(true)
    expect(out.title).toBe("nrbi-render-prompt failed")
  })

  test("malformed stdout JSON is a parse error, not a crash", async () => {
    const def = await buildExec(stubRunner({ stdout: "not json" }))
    const out = await runtime.runPromise(def.execute({ layer: "A", variable_text: {} }, ctx()))
    expect((out.metadata as { error?: boolean }).error).toBe(true)
  })

  test("Parameters rejects an unknown layer", () => {
    const decode = Schema.decodeUnknownEffect(Parameters)
    const exit = Effect.runSyncExit(decode({ layer: "Z", variable_text: {} }))
    expect(exit._tag).toBe("Failure")
  })

  test("valid JSON with wrong shape is rejected by the runtime decode (M1)", async () => {
    // `prompt` is a number — structurally valid JSON, but violates
    // NrbiResult's `prompt: Schema.String`. The wrapper must not crash:
    // the decode failure is mapped then caught by the Effect.catch tail.
    const def = await buildExec(
      stubRunner({
        stdout: JSON.stringify({
          prompt: 123,
          reference_image_urls: [],
          model: "m",
          style_name: "s",
          category: "c",
          layer: "A",
        }),
      }),
    )
    const out = await runtime.runPromise(def.execute({ layer: "A", variable_text: {} }, ctx()))
    expect((out.metadata as { error?: boolean }).error).toBe(true)
    expect(out.title).toBe("nrbi-render-prompt failed")
  })

  test("--mock CLI flag is added to extraArgs when mock=true", async () => {
    let receivedArgs: readonly string[] | undefined
    const def = await buildExec(async (opts) => {
      receivedArgs = opts.extraArgs
      return { stdout: okStdout, stderr: "", exitCode: 0 }
    })
    await runtime.runPromise(
      def.execute({ layer: "A", variable_text: { orig_prompt: "x" }, mock: true }, ctx()),
    )
    expect(receivedArgs).toContain("--mock")
  })

  test("--mock is NOT added when mock is absent", async () => {
    let receivedArgs: readonly string[] | undefined
    const def = await buildExec(async (opts) => {
      receivedArgs = opts.extraArgs
      return { stdout: okStdout, stderr: "", exitCode: 0 }
    })
    await runtime.runPromise(
      def.execute({ layer: "A", variable_text: { orig_prompt: "x" } }, ctx()),
    )
    expect(receivedArgs).not.toContain("--mock")
  })
})

// Mirrors test/tool/registry.test.ts exactly: the real builtin-id enumeration
// uses `ToolRegistry.Service` + `registry.ids()` (the plan's `Registry.tools()`
// accessor does not exist). `ids()` = `[...builtin, ...custom].map(t => t.id)`,
// and the registry needs an Instance context via `provideTmpdirInstance`.
const registryIt = testEffect(Layer.mergeAll(ToolRegistry.defaultLayer, CrossSpawnSpawner.defaultLayer))

afterEach(async () => {
  await Instance.disposeAll()
})

describe("nrbi-render-prompt registration", () => {
  registryIt.live("nrbi-render-prompt is registered as a builtin tool", () =>
    provideTmpdirInstance(() =>
      Effect.gen(function* () {
        const registry = yield* ToolRegistry.Service
        const ids = yield* registry.ids()
        expect(ids).toContain("nrbi-render-prompt")
      }),
    ),
  )
})
