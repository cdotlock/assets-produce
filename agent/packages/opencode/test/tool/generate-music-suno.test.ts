import { describe, expect, test } from "bun:test"
import { Effect, Layer, ManagedRuntime, Schema } from "effect"
import { Agent } from "@/agent/agent"
import { MessageID, SessionID } from "@/session/schema"
import { Truncate } from "@/tool/truncate"
import {
  GenerateMusicSunoTool,
  PLACEHOLDER_MESSAGE,
  Parameters as MusicParameters,
} from "@/tool/asset/generate-music-suno"
import type { Tool } from "@/tool/tool"

const runtime = ManagedRuntime.make(Layer.mergeAll(Truncate.defaultLayer, Agent.defaultLayer))

// Minimal Tool.Context for tests — mirrors generate-sfx-elevenlabs.test.ts.
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

const baseParams = {
  prompt: "Upbeat lo-fi hip hop background track",
}

async function buildExec() {
  const info = await runtime.runPromise(GenerateMusicSunoTool)
  return Effect.runPromise(info.init())
}

describe("generate-music-suno atomic tool (deterministic placeholder, §15 r1.13)", () => {
  test("default path returns the deterministic placeholder — no fabricated URL", async () => {
    const def = await buildExec()
    const out = await runtime.runPromise(def.execute(baseParams, ctx()))

    expect(out.title).toBe("generate-music-suno (placeholder)")
    expect(out.output).toBe(PLACEHOLDER_MESSAGE)
    const meta = out.metadata as Record<string, unknown>
    expect(meta.placeholder).toBe(true)
    expect(meta.error).toBeUndefined()
    // The placeholder must be plainly identifiable — never a fabricated audio
    // bytes blob nor a (fake) OSS https URL.
    expect(out.output).not.toMatch(/^https:\/\//)
    expect(meta.ossUrl).toBeUndefined()
    expect(meta.url).toBeUndefined()
  })

  test("placeholder echoes resolved params for future real-wiring", async () => {
    const def = await buildExec()
    const out = await runtime.runPromise(
      def.execute(
        { prompt: "Cinematic orchestral swell", duration_seconds: 30, style: "epic", instrumental: true },
        ctx(),
      ),
    )
    const meta = out.metadata as Record<string, unknown>
    expect(meta.placeholder).toBe(true)
    expect(meta.prompt).toBe("Cinematic orchestral swell")
    expect(meta.duration_seconds).toBe(30)
    expect(meta.style).toBe("epic")
    expect(meta.instrumental).toBe(true)
    // No fabricated output even with full params.
    expect(meta.ossUrl).toBeUndefined()
  })

  test("dryRun path is byte-identical to the default path (no upstream to skip)", async () => {
    const def = await buildExec()
    const plain = await runtime.runPromise(def.execute(baseParams, ctx()))
    const dry = await runtime.runPromise(def.execute({ ...baseParams, dryRun: true }, ctx()))

    expect(dry.title).toBe(plain.title)
    expect(dry.output).toBe(plain.output)
    expect(dry.metadata).toEqual(plain.metadata)
  })

  test("determinism — same input called multiple times yields byte-identical output", async () => {
    const def = await buildExec()
    const params = { prompt: "Tense synthwave loop", duration_seconds: 12, style: "darksynth", instrumental: false }
    const a = await runtime.runPromise(def.execute(params, ctx()))
    const b = await runtime.runPromise(def.execute(params, ctx()))
    const c = await runtime.runPromise(def.execute(params, ctx()))

    expect(a.output).toBe(b.output)
    expect(b.output).toBe(c.output)
    expect(JSON.stringify(a.metadata)).toBe(JSON.stringify(b.metadata))
    expect(JSON.stringify(b.metadata)).toBe(JSON.stringify(c.metadata))
    expect(a.title).toBe(b.title)
  })

  test("schema rejects empty prompt", () => {
    const decode = Schema.decodeUnknownEffect(MusicParameters)
    const exit = Effect.runSyncExit(decode({ prompt: "" }))
    expect(exit._tag).toBe("Failure")
  })

  test("schema rejects oversized prompt", () => {
    const decode = Schema.decodeUnknownEffect(MusicParameters)
    const exit = Effect.runSyncExit(decode({ prompt: "x".repeat(1001) }))
    expect(exit._tag).toBe("Failure")
  })

  test("schema rejects duration_seconds out of range (too large)", () => {
    const decode = Schema.decodeUnknownEffect(MusicParameters)
    const exit = Effect.runSyncExit(decode({ ...baseParams, duration_seconds: 999 }))
    expect(exit._tag).toBe("Failure")
  })

  test("schema rejects duration_seconds out of range (non-positive)", () => {
    const decode = Schema.decodeUnknownEffect(MusicParameters)
    const exit = Effect.runSyncExit(decode({ ...baseParams, duration_seconds: 0 }))
    expect(exit._tag).toBe("Failure")
  })

  test("schema rejects missing required prompt", () => {
    const decode = Schema.decodeUnknownEffect(MusicParameters)
    const exit = Effect.runSyncExit(decode({ duration_seconds: 10 }))
    expect(exit._tag).toBe("Failure")
  })

  test("schema accepts a well-formed full request", () => {
    const decode = Schema.decodeUnknownEffect(MusicParameters)
    const exit = Effect.runSyncExit(
      decode({
        prompt: "Driving electronic dance track",
        duration_seconds: 60,
        style: "house",
        instrumental: true,
        dryRun: false,
      }),
    )
    expect(exit._tag).toBe("Success")
  })
})
