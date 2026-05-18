// Phase 14 — hermetic unit tests for the real LLM mini agent loop.
//
// Every external dependency is injected so NOTHING touches the real
// AppRuntime, an LLM, the network, or disk:
//   - `loadSkill`   : fake skill body + allowlist (T1/T2)
//   - `resolveModel`: a stub model object (no Provider/AppRuntime)
//   - `driveLoop`   : a deterministic fake of ai's generateText that
//                     returns whatever tool results the test scripts
//
// Covers plan test items T1, T2, T5, T6, T7, T8, T9.

import { describe, expect, test } from "bun:test"
import { tool, jsonSchema, type ToolSet } from "ai"
import {
  createLlmGenerator,
  parseAllowlist,
  type LoadedSkill,
  type ResolvedModel,
  type LoopResult,
  type LoopToolResult,
  type DriveLoopArgs,
  type BuildTools,
} from "@/business/asset-service/llm-generator"
import { ASSET_GENERATION_SKILLS } from "@/business/asset-service/intent-to-skill"
import type { AssetGeneratorInput } from "@/business/asset-service/run-asset-generation"

// Stub ToolSet assembly — keeps the allowlist→exposed-tool mapping (so
// T7 still asserts enforcement) without touching AppRuntime / Tool.init.
const fakeBuildTools: BuildTools = async ({ allowlist }) => {
  const set: ToolSet = {}
  for (const id of allowlist) {
    set[id] = tool({
      description: `stub ${id}`,
      inputSchema: jsonSchema({ type: "object", properties: {} } as Record<string, unknown>),
      execute: async () => "stub",
    })
  }
  return set
}

// ---------- helpers ----------

const STUB_MODEL = {
  model: { __fake: "language-model" } as any,
  providerID: "anthropic",
  modelID: "claude-stub",
} satisfies ResolvedModel

const fakeResolveModel = () => Promise.resolve(STUB_MODEL)

const input = (over: Partial<AssetGeneratorInput> = {}): AssetGeneratorInput => ({
  job_id: "job_test_1",
  project_id: "prj_test_1",
  intent: {
    kind: "cg",
    key: "ep01/beat1",
    spec_md: "Sylvia raises hand; silver glyph ignites.",
    refs: [{ kind: "image", url: "https://oss/sprites/sylvia.png", tag: "character" }],
    constraints: { ratio: "16:9" },
  },
  skill: "cg-render-spec",
  maxSteps: 30,
  ...over,
})

// A skill body whose "Atomic tools (allowed)" section lists cg-render +
// oss-put (plus a non-tool token to prove only known ids survive).
const SAMPLE_BODY = [
  "# cg-render-spec",
  "",
  "## Intent",
  "Produce a CG beat.",
  "",
  "## Atomic tools (allowed)",
  "",
  "- **`cg-render` — primary.** Dispatches to the python script.",
  "- `generate-image-nanobanana` — fallback when cg-render is unavailable.",
  "- **`oss-put` — REQUIRED final step.** chain it for the OSS url.",
  "- not-a-real-tool — should be ignored.",
  "",
  "## Inputs",
  "- `oss-put` mentioned again here must NOT count (outside the section).",
  "- `generate-music-suno` outside the section must NOT count.",
].join("\n")

const fakeLoad = (body: string): ((skill: string) => Promise<LoadedSkill>) => {
  return async (skill: string) => {
    if (skill === "__missing__") throw new Error(`skill body not found for "${skill}"`)
    return { body, allowlist: parseAllowlist(body) }
  }
}

// Build a fake driveLoop that returns a scripted set of tool results and
// (optionally) token/step counts. Records the tool ids it was actually
// exposed so allowlist-enforcement can be asserted.
function scriptedDriver(opts: {
  toolResults: LoopToolResult[]
  steps?: number
  totalTokens?: number
  capture?: { exposed?: string[] }
}) {
  return async (args: DriveLoopArgs): Promise<LoopResult> => {
    if (opts.capture) opts.capture.exposed = Object.keys(args.tools)
    return {
      steps: opts.steps ?? opts.toolResults.length,
      totalTokens: opts.totalTokens ?? 0,
      toolResults: opts.toolResults,
    }
  }
}

// A tool ExecuteResult shaped exactly like the real atomic tools'.
const execResult = (output: string, metadata: Record<string, unknown>) => ({
  title: "t",
  output,
  metadata: { truncated: false, ...metadata },
})

// ---------- T1: skill loader (known / unknown) ----------

describe("T1 — skill loader", () => {
  test("unknown skill → GENERATION_REJECTED (not a crash)", async () => {
    const gen = createLlmGenerator({
      loadSkill: fakeLoad(SAMPLE_BODY),
      resolveModel: fakeResolveModel,
      buildTools: fakeBuildTools,
      driveLoop: scriptedDriver({ toolResults: [] }),
    })
    const out = await gen.generate(input({ skill: "__missing__" }))
    expect(out.ok).toBe(false)
    if (!out.ok) {
      expect(out.code).toBe("GENERATION_REJECTED")
      expect(out.message).toContain("__missing__")
    }
  })

  test("known skill loads its body + allowlist", async () => {
    const loaded = await fakeLoad(SAMPLE_BODY)("cg-render-spec")
    expect(loaded.body).toContain("cg-render-spec")
    expect(loaded.allowlist.sort()).toEqual(["cg-render", "generate-image-nanobanana", "oss-put"])
  })
})

// ---------- T2: allowlist parsing ----------

describe("T2 — allowlist parsing", () => {
  test("collects only known kebab tool ids inside the Atomic tools section", () => {
    const list = parseAllowlist(SAMPLE_BODY).sort()
    expect(list).toEqual(["cg-render", "generate-image-nanobanana", "oss-put"])
    // tokens outside the section (in ## Inputs) are NOT collected
    expect(list).not.toContain("generate-music-suno")
    // non-tool tokens are dropped
    expect(list).not.toContain("not-a-real-tool")
  })

  test("empty / missing section yields an empty allowlist", () => {
    expect(parseAllowlist("# x\n\n## Intent\njust prose, no tools section")).toEqual([])
  })

  test("real sfx-spec style body resolves the single real tool", () => {
    const body = [
      "## Atomic tools (allowed)",
      "- **`generate-sfx-elevenlabs` — primary, and the only real path.**",
      "## Inputs",
    ].join("\n")
    expect(parseAllowlist(body)).toEqual(["generate-sfx-elevenlabs"])
  })
})

// ---------- T5: success path ----------

describe("T5 — success path", () => {
  test("allowlisted tool returns metadata.ossUrl → ok:true with url + atomic_tool + steps", async () => {
    const gen = createLlmGenerator({
      loadSkill: fakeLoad(SAMPLE_BODY),
      resolveModel: fakeResolveModel,
      buildTools: fakeBuildTools,
      driveLoop: scriptedDriver({
        steps: 4,
        totalTokens: 1234,
        toolResults: [
          { toolName: "cg-render", output: execResult("/tmp/local.png", { localPath: "/tmp/local.png" }) },
          {
            toolName: "oss-put",
            output: execResult("https://oss.example.com/assets/x.png", {
              ossUrl: "https://oss.example.com/assets/x.png",
            }),
          },
        ],
      }),
    })
    const out = await gen.generate(input())
    expect(out.ok).toBe(true)
    if (out.ok) {
      expect(out.url).toBe("https://oss.example.com/assets/x.png")
      expect(out.atomic_tool).toBe("oss-put")
      expect(out.steps).toBe(4)
    }
  })

  test("terminal tool whose OSS url is the bare `output` string is accepted", async () => {
    const gen = createLlmGenerator({
      loadSkill: fakeLoad(SAMPLE_BODY),
      resolveModel: fakeResolveModel,
      buildTools: fakeBuildTools,
      driveLoop: scriptedDriver({
        toolResults: [
          {
            toolName: "cg-render",
            // sfx/cg-render put the https url directly in output, no ossUrl
            output: execResult("https://oss.example.com/sfx/y.mp3", {}),
          },
        ],
      }),
    })
    const out = await gen.generate(input())
    expect(out.ok).toBe(true)
    if (out.ok) expect(out.url).toBe("https://oss.example.com/sfx/y.mp3")
  })
})

// ---------- T6: music deferred placeholder ----------

describe("T6 — music deferred", () => {
  test("generate-music-suno metadata.placeholder:true → ok:true (NOT failed), short-circuits failure mapping", async () => {
    const musicBody = [
      "# music-spec",
      "## Atomic tools (allowed)",
      "- **`generate-music-suno` — placeholder; the only tool.**",
      "## Inputs",
    ].join("\n")
    const gen = createLlmGenerator({
      loadSkill: fakeLoad(musicBody),
      resolveModel: fakeResolveModel,
      buildTools: fakeBuildTools,
      driveLoop: scriptedDriver({
        steps: 1,
        toolResults: [
          {
            toolName: "generate-music-suno",
            output: execResult("music generation pending Suno gateway selection", { placeholder: true }),
          },
        ],
      }),
    })
    const out = await gen.generate(input({ skill: "music-spec", intent: { kind: "music", key: "bgm1", spec_md: "lofi" } }))
    expect(out.ok).toBe(true)
    if (out.ok) {
      expect(out.atomic_tool).toBe("generate-music-suno")
      expect(out.url).toContain("pending Suno gateway")
      expect(out.steps).toBe(1)
    }
  })

  test("placeholder wins even when a later tool result reports an error", async () => {
    const musicBody = ["## Atomic tools (allowed)", "- `generate-music-suno`", "- `oss-put`", "## Inputs"].join("\n")
    const gen = createLlmGenerator({
      loadSkill: fakeLoad(musicBody),
      resolveModel: fakeResolveModel,
      buildTools: fakeBuildTools,
      driveLoop: scriptedDriver({
        toolResults: [
          {
            toolName: "generate-music-suno",
            output: execResult("placeholder msg", { placeholder: true }),
          },
          { toolName: "oss-put", output: execResult("oss-put error: boom", { error: true, message: "boom" }) },
        ],
      }),
    })
    const out = await gen.generate(input({ skill: "music-spec" }))
    expect(out.ok).toBe(true)
    if (out.ok) expect(out.atomic_tool).toBe("generate-music-suno")
  })
})

// ---------- T7: allowlist enforcement ----------

describe("T7 — allowlist enforcement", () => {
  test("only allowlisted tools are exposed to the model; non-allowlisted never reachable", async () => {
    const capture: { exposed?: string[] } = {}
    const gen = createLlmGenerator({
      loadSkill: fakeLoad(SAMPLE_BODY),
      resolveModel: fakeResolveModel,
      buildTools: fakeBuildTools,
      driveLoop: scriptedDriver({
        capture,
        toolResults: [
          { toolName: "oss-put", output: execResult("https://oss.example.com/ok.png", { ossUrl: "https://oss.example.com/ok.png" }) },
        ],
      }),
    })
    const out = await gen.generate(input())
    expect(out.ok).toBe(true)
    // Exposed tool set is exactly the parsed allowlist — nothing else.
    expect(capture.exposed?.sort()).toEqual(["cg-render", "generate-image-nanobanana", "oss-put"])
    expect(capture.exposed).not.toContain("generate-video-seedance")
    expect(capture.exposed).not.toContain("generate-music-suno")
  })
})

// ---------- T8: budget ----------

describe("T8 — budget backstops", () => {
  test("token usage over the per-job limit (no terminal url) → BUDGET_EXCEEDED", async () => {
    const prev = process.env.ASSETS_SERVICE_MAX_TOKENS_PER_JOB
    process.env.ASSETS_SERVICE_MAX_TOKENS_PER_JOB = "100"
    try {
      const gen = createLlmGenerator({
        loadSkill: fakeLoad(SAMPLE_BODY),
        resolveModel: fakeResolveModel,
        buildTools: fakeBuildTools,
        driveLoop: scriptedDriver({ steps: 2, totalTokens: 5000, toolResults: [] }),
      })
      const out = await gen.generate(input())
      expect(out.ok).toBe(false)
      if (!out.ok) {
        expect(out.code).toBe("BUDGET_EXCEEDED")
        expect(out.message).toContain("token budget")
      }
    } finally {
      if (prev === undefined) delete process.env.ASSETS_SERVICE_MAX_TOKENS_PER_JOB
      else process.env.ASSETS_SERVICE_MAX_TOKENS_PER_JOB = prev
    }
  })

  test("step cap reached without a terminal url → BUDGET_EXCEEDED", async () => {
    const gen = createLlmGenerator({
      loadSkill: fakeLoad(SAMPLE_BODY),
      resolveModel: fakeResolveModel,
      buildTools: fakeBuildTools,
      driveLoop: scriptedDriver({ steps: 5, totalTokens: 10, toolResults: [] }),
    })
    const out = await gen.generate(input({ maxSteps: 5 }))
    expect(out.ok).toBe(false)
    if (!out.ok) {
      expect(out.code).toBe("BUDGET_EXCEEDED")
      expect(out.message).toContain("step budget")
    }
  })
})

// ---------- T9: tool error ----------

describe("T9 — atomic tool failure", () => {
  test("metadata.error:true ends the run → ATOMIC_TOOL_FAILED (no internal retry)", async () => {
    const gen = createLlmGenerator({
      loadSkill: fakeLoad(SAMPLE_BODY),
      resolveModel: fakeResolveModel,
      buildTools: fakeBuildTools,
      driveLoop: scriptedDriver({
        steps: 2,
        totalTokens: 50,
        toolResults: [
          {
            toolName: "cg-render",
            output: execResult("cg-render error: python exited 1", {
              error: true,
              message: "python exited 1",
            }),
          },
        ],
      }),
    })
    const out = await gen.generate(input())
    expect(out.ok).toBe(false)
    if (!out.ok) {
      expect(out.code).toBe("ATOMIC_TOOL_FAILED")
      expect(out.message).toBe("python exited 1")
      expect(out.steps).toBe(2)
    }
  })

  test("no usable tool output at all → GENERATION_REJECTED", async () => {
    const gen = createLlmGenerator({
      loadSkill: fakeLoad(SAMPLE_BODY),
      resolveModel: fakeResolveModel,
      buildTools: fakeBuildTools,
      driveLoop: scriptedDriver({ steps: 1, totalTokens: 10, toolResults: [] }),
    })
    const out = await gen.generate(input({ maxSteps: 30 }))
    expect(out.ok).toBe(false)
    if (!out.ok) expect(out.code).toBe("GENERATION_REJECTED")
  })
})

// ---------- default disk skill loader against the REAL shipped bodies ----------
//
// Exercises the production `defaultLoadSkill` (no loadSkill override) +
// parseAllowlist against the actual knowledge/asset-generation/*.md files.
// Hermetic: only disk read of in-repo files; model/tools/loop injected.
// Directly de-risks "全部落地" — every registered skill the picker can
// route to MUST be loadable by the production loop with a non-empty
// allowlist of *known* atomic-tool ids.

describe("default disk loader — real shipped skill bodies", () => {
  test.each([...ASSET_GENERATION_SKILLS])(
    "%s loads via defaultLoadSkill with a non-empty known-tool allowlist",
    async (skill) => {
      const capture: { allowlist?: string[] } = {}
      const recordingBuildTools: BuildTools = async ({ allowlist }) => {
        capture.allowlist = allowlist
        return await fakeBuildTools({ allowlist } as Parameters<BuildTools>[0])
      }
      const gen = createLlmGenerator({
        // NO loadSkill override → real defaultLoadSkill reads the repo file.
        resolveModel: fakeResolveModel,
        buildTools: recordingBuildTools,
        driveLoop: scriptedDriver({
          toolResults: [
            {
              toolName: "oss-put",
              output: execResult("https://oss.example.com/ok.png", {
                ossUrl: "https://oss.example.com/ok.png",
              }),
            },
          ],
        }),
      })
      const out = await gen.generate(input({ skill }))
      // Loader resolved (not GENERATION_REJECTED for a missing/empty body).
      expect(out.ok).toBe(true)
      expect(capture.allowlist && capture.allowlist.length).toBeGreaterThan(0)
    },
  )

  test("a skill name with no body file → GENERATION_REJECTED via defaultLoadSkill", async () => {
    const gen = createLlmGenerator({
      resolveModel: fakeResolveModel,
      buildTools: fakeBuildTools,
      driveLoop: scriptedDriver({ toolResults: [] }),
    })
    const out = await gen.generate(input({ skill: "definitely-not-a-real-skill-xyz" }))
    expect(out.ok).toBe(false)
    if (!out.ok) {
      expect(out.code).toBe("GENERATION_REJECTED")
      expect(out.message).toContain("definitely-not-a-real-skill-xyz")
    }
  })
})

// ---------- model fallback signalling ----------

describe("model resolution", () => {
  test("resolveModel rejection (no model available) → GENERATION_REJECTED", async () => {
    const gen = createLlmGenerator({
      loadSkill: fakeLoad(SAMPLE_BODY),
      resolveModel: () => Promise.reject(new Error("no LLM model available")),
      buildTools: fakeBuildTools,
      driveLoop: scriptedDriver({ toolResults: [] }),
    })
    const out = await gen.generate(input())
    expect(out.ok).toBe(false)
    if (!out.ok) {
      expect(out.code).toBe("GENERATION_REJECTED")
      expect(out.message).toContain("no LLM model available")
    }
  })
})

// ---------- nrbi-render-prompt registration ----------

describe("nrbi-render-prompt atomic tool", () => {
  test("nrbi-render-prompt is a known atomic tool and parses in an allowlist", () => {
    const body =
      "## Atomic tools (allowed)\n\n- `nrbi-render-prompt` — assembler\n- `generate-image-gpt` — render\n- `oss-put` — upload\n"
    const allow = parseAllowlist(body)
    expect(allow).toContain("nrbi-render-prompt")
    expect(allow).toContain("generate-image-gpt")
  })
})
