import { describe, expect, test } from "bun:test"
import { placeholderGenerator } from "@/business/asset-service/wire"
import type { AssetGeneratorInput } from "@/business/asset-service/run-asset-generation"

// Minimal shape — placeholderGenerator only reads `intent.key`, `intent.kind`,
// and `intent.refs`. Other fields are accepted as-is from the runtime.
const baseInput: AssetGeneratorInput = {
  job_id: "asset_job_test",
  project_id: "proj_test",
  intent: { kind: "cg", key: "test/key", spec_md: "" },
  skill: "cg-render-spec",
  maxSteps: 30,
}

describe("placeholderGenerator (Phase 8 stub)", () => {
  test("returns ok=true with the phase8-placeholder atomic_tool tag", async () => {
    const out = await placeholderGenerator.generate(baseInput)
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.atomic_tool).toBe("phase8-placeholder")
  })

  test("emits a deterministic URL keyed off intent.key for image kinds", async () => {
    const out = await placeholderGenerator.generate(baseInput)
    if (!out.ok) throw new Error("expected ok outcome")
    expect(out.url).toBe("https://stub.assets.local/test%2Fkey.png")
    // Re-run with same input → byte-identical URL.
    const again = await placeholderGenerator.generate(baseInput)
    if (!again.ok) throw new Error("expected ok outcome")
    expect(again.url).toBe(out.url)
  })

  test("switches the extension to .mp4 when intent.kind=shot_video", async () => {
    const out = await placeholderGenerator.generate({
      ...baseInput,
      intent: { kind: "shot_video", key: "ep1/shot1", spec_md: "" },
    })
    if (!out.ok) throw new Error("expected ok outcome")
    expect(out.url.endsWith(".mp4")).toBe(true)
    expect(out.url).toContain("ep1%2Fshot1")
  })

  test("encodes special characters in intent.key so the URL stays valid", async () => {
    const out = await placeholderGenerator.generate({
      ...baseInput,
      intent: { kind: "cg", key: "a b/c?d&e", spec_md: "" },
    })
    if (!out.ok) throw new Error("expected ok outcome")
    expect(out.url).not.toContain("?")
    expect(out.url).not.toContain("&")
    expect(out.url).toContain("a%20b")
  })

  test("passes intent.refs through to ref_urls (defaults to []) ", async () => {
    const refs = [{ kind: "image" as const, url: "https://ref.example/a.png", tag: "style" }]
    const out = await placeholderGenerator.generate({
      ...baseInput,
      intent: { kind: "cg", key: "k", spec_md: "", refs },
    })
    if (!out.ok) throw new Error("expected ok outcome")
    expect(out.ref_urls).toEqual(refs)

    const noRefs = await placeholderGenerator.generate(baseInput)
    if (!noRefs.ok) throw new Error("expected ok outcome")
    expect(noRefs.ref_urls).toEqual([])
  })

  test("returns langfuse_trace_id=null (placeholder does not start a trace)", async () => {
    const out = await placeholderGenerator.generate(baseInput)
    if (!out.ok) throw new Error("expected ok outcome")
    expect(out.langfuse_trace_id).toBeNull()
  })
})
