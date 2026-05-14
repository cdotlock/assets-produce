import { describe, expect, test } from "bun:test"
import { eq } from "drizzle-orm"
import { AssetTable } from "@/business/asset/asset.sql"
import { Database } from "@/storage/db"
import { AssetJobRepo } from "@/business/asset-service/asset-job.repo"
import { runAssetGeneration } from "@/business/asset-service/run-asset-generation"
import { createLangfuseTracer, nullTracer, type JobTrace, type Tracer } from "@/business/asset-service/tracer"
import type { AssetWriter, GenerationOutcome } from "@/business/asset-service/run-asset-generation"
import { ids, seedProject } from "./fixture"

const okOutcome: GenerationOutcome = {
  ok: true,
  atomic_tool: "stub",
  url: "https://oss/url.png",
  ref_urls: [],
  // Generator-provided trace id — used when tracer is the no-op default.
  langfuse_trace_id: "outcome-trace-1",
}

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

const recordingTracer = (assignedId: string) => {
  const events: Array<{ kind: string; data: unknown }> = []
  const trace: JobTrace = {
    id: assignedId,
    event(name, data) {
      events.push({ kind: name, data })
    },
    end(data) {
      events.push({ kind: "end", data })
    },
  }
  const tracer: Tracer = {
    startJob() {
      events.push({ kind: "start", data: null })
      return trace
    },
  }
  return { tracer, events }
}

const seedQueuedJob = (project_id: string) => {
  const repo = AssetJobRepo.fromDatabase()
  const id = ids.job()
  repo.create({ id, project_id, intent: { kind: "cg", key: "k", spec_md: "" } })
  return { id, repo }
}

describe("nullTracer", () => {
  test("returns a no-op trace with empty string id", () => {
    const trace = nullTracer.startJob({} as never)
    expect(trace.id).toBe("")
    expect(() => trace.event("anything", {})).not.toThrow()
    expect(() => trace.end({ status: "succeeded" })).not.toThrow()
  })
})

describe("createLangfuseTracer", () => {
  test("returns nullTracer when LANGFUSE keys are missing", () => {
    const t = createLangfuseTracer({ env: { publicKey: undefined, secretKey: undefined } })
    const trace = t.startJob({
      job_id: "j",
      project_id: "p",
      intent: { kind: "cg", key: "k", spec_md: "" },
      skill: "cg-render-spec",
      maxSteps: 30,
    })
    expect(trace.id).toBe("")
  })

  test("wires the SDK client when env keys are present", () => {
    const calls: Array<{ kind: string; args: unknown }> = []
    const fakeTrace = {
      id: "lf-trace-123",
      event(args: unknown) {
        calls.push({ kind: "event", args })
      },
      update(args: unknown) {
        calls.push({ kind: "update", args })
      },
    }
    const fakeClient = {
      trace(args: unknown) {
        calls.push({ kind: "trace", args })
        return fakeTrace
      },
    }
    const t = createLangfuseTracer({
      env: { publicKey: "pk", secretKey: "sk", host: "https://lf", project: "p1" },
      __clientForTest: fakeClient,
    })
    const handle = t.startJob({
      job_id: "j1",
      project_id: "proj_a",
      intent: { kind: "character_portrait", key: "k", spec_md: "## brief" },
      skill: "character-portrait-spec",
      preferences: { atomic_tool_hint: "nb" },
      maxSteps: 30,
    })
    expect(handle.id).toBe("lf-trace-123")
    handle.event("skill.picked", { skill: "character-portrait-spec" })
    handle.end({ status: "succeeded", asset_id: "asset_1", url: "https://oss/a.png" })

    // trace → event → update
    expect(calls.map((c) => c.kind)).toEqual(["trace", "event", "update"])
    const traceArgs = calls[0]!.args as { name: string; tags: string[]; metadata: { job_id: string } }
    expect(traceArgs.name).toBe("asset-service.runJob")
    expect(traceArgs.tags).toContain("asset-service")
    expect(traceArgs.tags).toContain("skill:character-portrait-spec")
    expect(traceArgs.tags).toContain("kind:character_portrait")
    expect(traceArgs.metadata.job_id).toBe("j1")
  })

  test("startJob swallows SDK errors and returns the no-op trace", () => {
    const angryClient = {
      trace() {
        throw new Error("network down")
      },
    }
    const t = createLangfuseTracer({
      env: { publicKey: "pk", secretKey: "sk" },
      __clientForTest: angryClient,
    })
    const trace = t.startJob({
      job_id: "j",
      project_id: "p",
      intent: { kind: "cg", key: "k", spec_md: "" },
      skill: "cg-render-spec",
      maxSteps: 30,
    })
    expect(trace.id).toBe("")
  })
})

describe("runAssetGeneration with injected tracer", () => {
  test("invokes tracer.startJob + trace.end on success path", async () => {
    const project_id = seedProject()
    const { id: job_id, repo } = seedQueuedJob(project_id)
    const { tracer, events } = recordingTracer("trace-abc")
    const after = await runAssetGeneration(
      { job_id },
      {
        jobRepo: repo,
        generator: { async generate() { return { ...okOutcome, langfuse_trace_id: null } } },
        writer: dbWriter,
        tracer,
      },
    )
    expect(after.status).toBe("succeeded")
    expect(after.langfuse_trace_id).toBe("trace-abc")
    // Events ordered: start → skill.picked → generator.ok → end
    expect(events.map((e) => e.kind)).toEqual(["start", "skill.picked", "generator.ok", "end"])
  })

  test("trace.end carries the terminal outcome (succeeded/failed)", async () => {
    const project_id = seedProject()
    const { id: job_id, repo } = seedQueuedJob(project_id)
    const { tracer, events } = recordingTracer("trace-fail")
    await runAssetGeneration(
      { job_id },
      {
        jobRepo: repo,
        generator: {
          async generate() {
            return { ok: false, code: "BUDGET_EXCEEDED", message: "30 steps" }
          },
        },
        writer: dbWriter,
        tracer,
      },
    )
    const end = events.find((e) => e.kind === "end")
    expect(end).toBeDefined()
    const data = end!.data as { status: string; error?: { code: string } }
    expect(data.status).toBe("failed")
    expect(data.error?.code).toBe("BUDGET_EXCEEDED")
  })

  test("explicit langfuse_trace_id from generator wins over tracer's id when tracer absent", async () => {
    const project_id = seedProject()
    const { id: job_id, repo } = seedQueuedJob(project_id)
    const after = await runAssetGeneration(
      { job_id },
      {
        jobRepo: repo,
        generator: { async generate() { return okOutcome } },
        writer: dbWriter,
        // no tracer injected → nullTracer used → outcome's trace id surfaces
      },
    )
    expect(after.langfuse_trace_id).toBe("outcome-trace-1")
  })
})
