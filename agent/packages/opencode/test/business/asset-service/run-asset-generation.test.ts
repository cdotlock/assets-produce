import { describe, expect, test } from "bun:test"
import { eq } from "drizzle-orm"
import { Database } from "@/storage/db"
import { AssetTable } from "@/business/asset/asset.sql"
import { AssetJobRepo } from "@/business/asset-service/asset-job.repo"
import {
  runAssetGeneration,
  type AssetGenerator,
  type AssetWriter,
  type GenerationOutcome,
} from "@/business/asset-service/run-asset-generation"
import type { SkillPicker } from "@/business/asset-service/intent-to-skill"
import { ids, seedProject } from "./fixture"

// Default in-memory writer — writes a fresh Asset row via raw drizzle so
// tests don't have to wire up the larger Asset.Service Effect runtime.
const dbWriter: AssetWriter = {
  async write(input) {
    const id = ids.asset()
    const db = Database.Client()
    const row = db
      .insert(AssetTable)
      .values({
        id,
        project_id: input.project_id,
        type: input.type,
        kind: input.kind,
        key: input.key,
        name: input.name,
        url: input.url,
        prompt: input.prompt ?? null,
        ref_urls: input.ref_urls ?? null,
      })
      .returning()
      .get()
    return {
      asset_id: row.id,
      key: row.key,
      version: row.version,
      kind: input.kind,
      url: row.url ?? input.url,
      ref_urls: row.ref_urls,
    }
  },
}

const okOutcome = (overrides: Partial<Extract<GenerationOutcome, { ok: true }>> = {}): GenerationOutcome => ({
  ok: true,
  atomic_tool: "stub-image-gen",
  url: "https://oss.example.com/test.png",
  ref_urls: [],
  langfuse_trace_id: "trace-1",
  steps: 3,
  ...overrides,
})

const failOutcome = (code: "BUDGET_EXCEEDED" | "GENERATION_REJECTED" | "ATOMIC_TOOL_FAILED"): GenerationOutcome => ({
  ok: false,
  code,
  message: `stub ${code}`,
  steps: 7,
  langfuse_trace_id: "trace-fail",
})

const stubGenerator = (outcome: GenerationOutcome): AssetGenerator => ({
  async generate() {
    return outcome
  },
})

const seedQueuedJob = (project_id: string, intent: any = { kind: "cg", spec_md: "## brief", key: "k1" }) => {
  const repo = AssetJobRepo.fromDatabase()
  const id = ids.job()
  repo.create({ id, project_id, intent })
  return { id, repo }
}

describe("runAssetGeneration — success path", () => {
  test("happy path writes Asset, marks job succeeded, copies langfuse_trace_id", async () => {
    const project_id = seedProject()
    const { id: job_id, repo } = seedQueuedJob(project_id)
    const after = await runAssetGeneration(
      { job_id },
      { jobRepo: repo, generator: stubGenerator(okOutcome()), writer: dbWriter },
    )
    expect(after.status).toBe("succeeded")
    expect(after.asset_id).not.toBeNull()
    expect(after.langfuse_trace_id).toBe("trace-1")
    expect(after.error_code).toBeNull()

    // The Asset row was actually inserted.
    const db = Database.Client()
    const asset = db.select().from(AssetTable).where(eq(AssetTable.id, after.asset_id!)).get()
    expect(asset).not.toBeUndefined()
    expect(asset?.project_id).toBe(project_id)
    expect(asset?.key).toBe("k1")
    expect(asset?.kind).toBe("cg")
    expect(asset?.url).toBe("https://oss.example.com/test.png")
  })

  test("copies intent.name onto the Asset.name column", async () => {
    const project_id = seedProject()
    const { id: job_id, repo } = seedQueuedJob(project_id, {
      kind: "character_portrait",
      key: "p1",
      spec_md: "...",
      name: "Hero Portrait",
    })
    await runAssetGeneration(
      { job_id },
      { jobRepo: repo, generator: stubGenerator(okOutcome()), writer: dbWriter },
    )
    const db = Database.Client()
    const updated = repo.findById(job_id)!
    const asset = db.select().from(AssetTable).where(eq(AssetTable.id, updated.asset_id!)).get()
    expect(asset?.name).toBe("Hero Portrait")
  })

  test("defaults Asset.type=video when intent.kind=shot_video", async () => {
    const project_id = seedProject()
    const { id: job_id, repo } = seedQueuedJob(project_id, { kind: "shot_video", key: "v1", spec_md: "..." })
    await runAssetGeneration(
      { job_id },
      {
        jobRepo: repo,
        generator: stubGenerator(okOutcome({ url: "https://oss/v.mp4" })),
        writer: dbWriter,
      },
    )
    const db = Database.Client()
    const updated = repo.findById(job_id)!
    const asset = db.select().from(AssetTable).where(eq(AssetTable.id, updated.asset_id!)).get()
    expect(asset?.type).toBe("video")
  })

  test("invokes the skill picker only once when no skill_hint is set", async () => {
    const project_id = seedProject()
    const { id: job_id, repo } = seedQueuedJob(project_id, {
      kind: "cg",
      key: "skill-pick",
      spec_md: "## brief",
    })
    let calls = 0
    const picker: SkillPicker = {
      async pick() {
        calls++
        return "cg-render-spec"
      },
    }
    await runAssetGeneration(
      { job_id },
      { jobRepo: repo, generator: stubGenerator(okOutcome()), writer: dbWriter, skillPicker: picker },
    )
    expect(calls).toBe(1)
  })
})

describe("runAssetGeneration — failure paths", () => {
  test("BUDGET_EXCEEDED → job.failed with code+message", async () => {
    const project_id = seedProject()
    const { id: job_id, repo } = seedQueuedJob(project_id)
    const after = await runAssetGeneration(
      { job_id },
      { jobRepo: repo, generator: stubGenerator(failOutcome("BUDGET_EXCEEDED")), writer: dbWriter },
    )
    expect(after.status).toBe("failed")
    expect(after.error_code).toBe("BUDGET_EXCEEDED")
    expect(after.error_message).toContain("BUDGET_EXCEEDED")
    expect(after.asset_id).toBeNull()
    expect(after.langfuse_trace_id).toBe("trace-fail")
  })

  test("GENERATION_REJECTED preserves the generator-supplied message", async () => {
    const project_id = seedProject()
    const { id: job_id, repo } = seedQueuedJob(project_id)
    const generator: AssetGenerator = {
      async generate() {
        return {
          ok: false,
          code: "GENERATION_REJECTED",
          message: "content filter says no",
        }
      },
    }
    const after = await runAssetGeneration(
      { job_id },
      { jobRepo: repo, generator, writer: dbWriter },
    )
    expect(after.error_code).toBe("GENERATION_REJECTED")
    expect(after.error_message).toBe("content filter says no")
  })

  test("ATOMIC_TOOL_FAILED propagates correctly", async () => {
    const project_id = seedProject()
    const { id: job_id, repo } = seedQueuedJob(project_id)
    const after = await runAssetGeneration(
      { job_id },
      { jobRepo: repo, generator: stubGenerator(failOutcome("ATOMIC_TOOL_FAILED")), writer: dbWriter },
    )
    expect(after.error_code).toBe("ATOMIC_TOOL_FAILED")
  })

  test("skill picker error → job marked failed (no generator call, no asset write)", async () => {
    const project_id = seedProject()
    const { id: job_id, repo } = seedQueuedJob(project_id)
    let generated = 0
    let written = 0
    const generator: AssetGenerator = {
      async generate() {
        generated++
        return okOutcome()
      },
    }
    const writer: AssetWriter = {
      async write(input) {
        written++
        return dbWriter.write(input)
      },
    }
    const picker: SkillPicker = {
      async pick() {
        throw new Error("LLM offline")
      },
    }
    const after = await runAssetGeneration(
      { job_id },
      { jobRepo: repo, generator, writer, skillPicker: picker },
    )
    expect(after.status).toBe("failed")
    expect(after.error_message).toContain("LLM offline")
    expect(generated).toBe(0)
    expect(written).toBe(0)
  })

  test("generator throws → caught and surfaced as ATOMIC_TOOL_FAILED", async () => {
    const project_id = seedProject()
    const { id: job_id, repo } = seedQueuedJob(project_id)
    const generator: AssetGenerator = {
      async generate() {
        throw new Error("network timeout")
      },
    }
    const after = await runAssetGeneration(
      { job_id },
      { jobRepo: repo, generator, writer: dbWriter },
    )
    expect(after.status).toBe("failed")
    expect(after.error_code).toBe("ATOMIC_TOOL_FAILED")
    expect(after.error_message).toContain("network timeout")
  })
})

describe("runAssetGeneration — preferences round-trip (H2 regression)", () => {
  test("recovers preferences from persisted intent.__preferences and hands them to the picker", async () => {
    const project_id = seedProject()
    const { id: job_id, repo } = seedQueuedJob(project_id, {
      kind: "cg",
      key: "p1",
      spec_md: "## brief",
      __preferences: { atomic_tool_hint: "nb-2" },
    })
    let received: { atomic_tool_hint?: string; skill_hint?: string } | undefined
    const picker: SkillPicker = {
      async pick(ctx) {
        received = ctx.preferences
        return "cg-render-spec"
      },
    }
    await runAssetGeneration(
      { job_id },
      { jobRepo: repo, generator: stubGenerator(okOutcome()), writer: dbWriter, skillPicker: picker },
    )
    expect(received).toBeDefined()
    expect(received?.atomic_tool_hint).toBe("nb-2")
  })

  test("preferences.skill_hint short-circuits the picker (no picker.pick call)", async () => {
    const project_id = seedProject()
    const { id: job_id, repo } = seedQueuedJob(project_id, {
      kind: "character_portrait",
      key: "p2",
      spec_md: "...",
      __preferences: { skill_hint: "scene-bg-spec" },
    })
    let calls = 0
    const picker: SkillPicker = {
      async pick() {
        calls++
        return "cg-render-spec"
      },
    }
    const after = await runAssetGeneration(
      { job_id },
      { jobRepo: repo, generator: stubGenerator(okOutcome()), writer: dbWriter, skillPicker: picker },
    )
    expect(calls).toBe(0)
    // Sanity: skill_hint actually shaped the picked skill — Asset.prompt
    // comes from intent.spec_md and __preferences should be stripped from
    // downstream views of the intent (writer input, etc.).
    expect(after.status).toBe("succeeded")
  })

  test("__preferences is stripped before reaching writer / generator (no leak into Asset row)", async () => {
    const project_id = seedProject()
    const { id: job_id, repo } = seedQueuedJob(project_id, {
      kind: "cg",
      key: "p3",
      spec_md: "## actual brief",
      __preferences: { atomic_tool_hint: "x" },
    })
    let seenIntent: { spec_md?: string; key?: string } | undefined
    const generator: AssetGenerator = {
      async generate(ctx) {
        seenIntent = ctx.intent as { spec_md?: string; key?: string }
        return okOutcome()
      },
    }
    await runAssetGeneration(
      { job_id },
      { jobRepo: repo, generator, writer: dbWriter },
    )
    expect(seenIntent).toBeDefined()
    expect(seenIntent?.spec_md).toBe("## actual brief")
    expect(seenIntent?.key).toBe("p3")
    expect(seenIntent && "__preferences" in seenIntent).toBe(false)
  })
})

describe("runAssetGeneration — guards", () => {
  test("missing job → throws AssetServiceError code=NOT_FOUND", async () => {
    const repo = AssetJobRepo.fromDatabase()
    let err: any
    try {
      await runAssetGeneration(
        { job_id: ids.job() },
        { jobRepo: repo, generator: stubGenerator(okOutcome()), writer: dbWriter },
      )
    } catch (e) {
      err = e
    }
    expect(err).toBeDefined()
    expect(err?.data?.code).toBe("NOT_FOUND")
  })

  test("already-succeeded job returns as-is, no generator / writer call", async () => {
    const project_id = seedProject()
    const { id: job_id, repo } = seedQueuedJob(project_id)
    repo.updateStatus(job_id, { status: "succeeded", asset_id: null })

    let generated = 0
    let written = 0
    const generator: AssetGenerator = {
      async generate() {
        generated++
        return okOutcome()
      },
    }
    const writer: AssetWriter = {
      async write(input) {
        written++
        return dbWriter.write(input)
      },
    }
    const out = await runAssetGeneration(
      { job_id },
      { jobRepo: repo, generator, writer },
    )
    expect(out.status).toBe("succeeded")
    expect(generated).toBe(0)
    expect(written).toBe(0)
  })

  test("cancelled job is left alone too", async () => {
    const project_id = seedProject()
    const { id: job_id, repo } = seedQueuedJob(project_id)
    repo.updateStatus(job_id, { status: "cancelled" })
    let generated = 0
    const generator: AssetGenerator = {
      async generate() {
        generated++
        return okOutcome()
      },
    }
    const out = await runAssetGeneration(
      { job_id },
      { jobRepo: repo, generator, writer: dbWriter },
    )
    expect(out.status).toBe("cancelled")
    expect(generated).toBe(0)
  })
})
