import { describe, expect, test } from "bun:test"
import { Effect, Layer, ManagedRuntime, Schema } from "effect"
import { Agent } from "@/agent/agent"
import { Truncate } from "@/tool/truncate"
import { makeMssValidateTool, Parameters } from "@/tool/asset/mss-validate"
import type { PythonRunner } from "@/tool/asset/python-runner"
import type { Tool } from "@/tool/tool"
import { MessageID, SessionID } from "@/session/schema"

// ─── Schema exported from the wrapper (for case-9 parity test) ─────────────
import { MssValidateResult } from "@/tool/asset/mss-validate"

const runtime = ManagedRuntime.make(Layer.mergeAll(Truncate.defaultLayer, Agent.defaultLayer))

// Minimal Tool.Context — mirrors nrbi-render-prompt.test.ts exactly.
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

// ─── Real bridge stdout samples (verbatim, verified by running the bridge with
//     --mock on 2026-05-19):
//   python3 tools/mss-validate/mss_validate.py --input - --mock \
//     <<< '{"script_path":"/tmp/test.mss","mock":true}'
//   → {"verdict": "PASS", "errors": [], "meta": {"atomic_tool": "mss-validate", "mock": true}}
//
//   python3 tools/mss-validate/mss_validate.py --input - --mock \
//     <<< '{"script_path":"/tmp/__MSS_MOCK_FAIL__","mock":true}'
//   → {"verdict": "FAIL", "errors": ["mock: injected failure"],
//      "raw": "mock: injected failure\n",
//      "meta": {"atomic_tool": "mss-validate", "mock": true}}
const REAL_PASS_STDOUT =
  '{"verdict": "PASS", "errors": [], "meta": {"atomic_tool": "mss-validate", "mock": true}}'
const REAL_FAIL_STDOUT =
  '{"verdict": "FAIL", "errors": ["mock: injected failure"], "raw": "mock: injected failure\\n", "meta": {"atomic_tool": "mss-validate", "mock": true}}'

// ─── Stub helpers ────────────────────────────────────────────────────────────
const okPassStdout = REAL_PASS_STDOUT
const okFailStdout = REAL_FAIL_STDOUT

const stubRunner =
  (o: { stdout?: string; stderr?: string; exitCode?: number } = {}): PythonRunner =>
  async () => ({
    stdout: o.stdout ?? okPassStdout,
    stderr: o.stderr ?? "",
    exitCode: o.exitCode ?? 0,
  })

async function buildExec(runner: PythonRunner = stubRunner()) {
  const info = await runtime.runPromise(makeMssValidateTool({ runner }))
  const def = await Effect.runPromise(info.init())
  return def
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("mss-validate tool", () => {
  // 1. Happy PASS: real-shape stdout (with meta) is decoded, metadata.error absent
  test("happy PASS — real bridge stdout decoded; metadata.error absent", async () => {
    const def = await buildExec(stubRunner({ stdout: okPassStdout }))
    const out = await runtime.runPromise(
      def.execute({ script_path: "/abs/path/ep01.mss" }, ctx()),
    )
    const meta = out.metadata as Record<string, unknown>
    expect(meta.error).toBeUndefined()
    expect(out.output).toContain("PASS")
    expect(out.output).toContain('"verdict"')
  })

  // 2. FAIL verdict: real-shape stdout (with raw + meta) is a NORMAL result, NOT error
  test("FAIL verdict — surfaced as normal result, metadata.error absent", async () => {
    const def = await buildExec(stubRunner({ stdout: okFailStdout }))
    const out = await runtime.runPromise(
      def.execute({ script_path: "/abs/path/ep01.mss" }, ctx()),
    )
    const meta = out.metadata as Record<string, unknown>
    // FAIL verdict is a successful judgement — metadata.error must be absent/falsy
    expect(meta.error).toBeFalsy()
    expect(out.output).toContain("FAIL")
    expect(out.output).toContain('"verdict"')
    // The output must contain the errors array
    expect(out.output).toContain("errors")
  })

  // 3. dryRun: runner is NOT called
  test("dryRun — runner is never called", async () => {
    let callCount = 0
    const def = await buildExec(async () => {
      callCount++
      return { stdout: "", stderr: "", exitCode: 0 }
    })
    const out = await runtime.runPromise(
      def.execute({ script_path: "/abs/path/ep01.mss", dryRun: true }, ctx()),
    )
    expect(callCount).toBe(0)
    expect((out.metadata as { dryRun?: boolean }).dryRun).toBe(true)
  })

  // 4. Non-zero exit → metadata.error: true
  test("non-zero exit — metadata.error: true", async () => {
    const def = await buildExec(
      stubRunner({
        exitCode: 4,
        stderr: JSON.stringify({ error: { code: "ATOMIC_TOOL_FAILED", message: "drift" } }),
      }),
    )
    const out = await runtime.runPromise(
      def.execute({ script_path: "/abs/path/ep01.mss" }, ctx()),
    )
    expect((out.metadata as { error?: boolean }).error).toBe(true)
  })

  // 5. Malformed JSON stdout → metadata.error: true
  test("malformed JSON stdout — metadata.error: true", async () => {
    const def = await buildExec(stubRunner({ stdout: "not-valid-json{{" }))
    const out = await runtime.runPromise(
      def.execute({ script_path: "/abs/path/ep01.mss" }, ctx()),
    )
    expect((out.metadata as { error?: boolean }).error).toBe(true)
  })

  // 6. Valid JSON but wrong schema shape → Schema.decodeUnknownEffect rejects → metadata.error: true
  test("valid JSON wrong shape — schema decode rejects, metadata.error: true (no bare cast)", async () => {
    const def = await buildExec(
      stubRunner({ stdout: JSON.stringify({ verdict: "MAYBE", errors: [] }) }),
    )
    const out = await runtime.runPromise(
      def.execute({ script_path: "/abs/path/ep01.mss" }, ctx()),
    )
    expect((out.metadata as { error?: boolean }).error).toBe(true)
  })

  // 7. Parameters rejects empty and relative script_path; accepts absolute
  test("Parameters rejects empty script_path", () => {
    const decode = Schema.decodeUnknownEffect(Parameters)
    const exit = Effect.runSyncExit(decode({ script_path: "" }))
    expect(exit._tag).toBe("Failure")
  })

  test("Parameters rejects relative script_path", () => {
    const decode = Schema.decodeUnknownEffect(Parameters)
    const exit = Effect.runSyncExit(decode({ script_path: "relative/path.mss" }))
    expect(exit._tag).toBe("Failure")
  })

  test("Parameters accepts absolute script_path", () => {
    const decode = Schema.decodeUnknownEffect(Parameters)
    const exit = Effect.runSyncExit(decode({ script_path: "/abs/path/ep01.mss" }))
    expect(exit._tag).toBe("Success")
  })

  // 8. mock: true ⇒ --mock in extraArgs; absent when mock unset
  test("mock: true — --mock added to extraArgs", async () => {
    let receivedArgs: readonly string[] | undefined
    const def = await buildExec(async (opts) => {
      receivedArgs = opts.extraArgs
      return { stdout: okPassStdout, stderr: "", exitCode: 0 }
    })
    await runtime.runPromise(
      def.execute({ script_path: "/abs/path/ep01.mss", mock: true }, ctx()),
    )
    expect(receivedArgs).toContain("--mock")
  })

  test("mock absent — --mock NOT in extraArgs", async () => {
    let receivedArgs: readonly string[] | undefined
    const def = await buildExec(async (opts) => {
      receivedArgs = opts.extraArgs
      return { stdout: okPassStdout, stderr: "", exitCode: 0 }
    })
    await runtime.runPromise(
      def.execute({ script_path: "/abs/path/ep01.mss" }, ctx()),
    )
    expect(receivedArgs).not.toContain("--mock")
  })

  // 9. Real-shape parity: Schema.decodeUnknownEffect(MssValidateResult) accepts BOTH
  //    verbatim real bridge PASS and FAIL outputs (closes the meta integration risk).
  //    These strings are verbatim bridge output captured on 2026-05-19 (see comment above).
  test("real PASS stdout accepted by MssValidateResult schema (meta parity)", () => {
    const parsed = JSON.parse(REAL_PASS_STDOUT)
    const exit = Effect.runSyncExit(Schema.decodeUnknownEffect(MssValidateResult)(parsed))
    expect(exit._tag).toBe("Success")
    if (exit._tag === "Success") {
      expect(exit.value.verdict).toBe("PASS")
      expect(exit.value.errors).toEqual([])
      expect(exit.value.meta?.atomic_tool).toBe("mss-validate")
      expect(exit.value.meta?.mock).toBe(true)
    }
  })

  test("real FAIL stdout accepted by MssValidateResult schema (meta+raw parity)", () => {
    const parsed = JSON.parse(REAL_FAIL_STDOUT)
    const exit = Effect.runSyncExit(Schema.decodeUnknownEffect(MssValidateResult)(parsed))
    expect(exit._tag).toBe("Success")
    if (exit._tag === "Success") {
      expect(exit.value.verdict).toBe("FAIL")
      expect(exit.value.errors).toContain("mock: injected failure")
      expect(exit.value.raw).toBe("mock: injected failure\n")
      expect(exit.value.meta?.atomic_tool).toBe("mss-validate")
      expect(exit.value.meta?.mock).toBe(true)
    }
  })
})
