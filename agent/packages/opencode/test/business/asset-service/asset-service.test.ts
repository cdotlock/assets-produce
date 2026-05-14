import { describe, expect, test } from "bun:test"
import { eq } from "drizzle-orm"
import { Database } from "@/storage/db"
import { AssetTable } from "@/business/asset/asset.sql"
import { AssetServiceError } from "@/business/asset-service/errors"
import { AssetService } from "@/business/asset-service/asset-service"
import { AssetJobRepo } from "@/business/asset-service/asset-job.repo"
import type { AssetCreateInput, AssetIntent } from "@/business/asset-service/types"
import type {
  AssetGenerator,
  AssetWriter,
  GenerationOutcome,
} from "@/business/asset-service/run-asset-generation"
import { ids, seedProject } from "./fixture"

const intent = (overrides: Partial<AssetIntent> = {}): AssetIntent => ({
  kind: "cg",
  key: "k1",
  spec_md: "## brief",
  ...overrides,
})

const createInput = (
  project_id: string,
  overrides: Partial<AssetCreateInput> = {},
): AssetCreateInput => ({
  project_id,
  asset_intent: intent(),
  ...overrides,
})

const okOutcome = (): GenerationOutcome => ({
  ok: true,
  atomic_tool: "stub",
  url: "https://oss/url.png",
  ref_urls: [],
  langfuse_trace_id: "trace-svc",
})

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

const stubGenerator = (outcome: GenerationOutcome = okOutcome()): AssetGenerator => ({
  async generate() {
    return outcome
  },
})

const svc = (overrides: Partial<ConstructorParameters<typeof AssetService>[0]> = {}) =>
  new AssetService({
    generator: stubGenerator(),
    writer: dbWriter,
    ...overrides,
  })

describe("AssetService.createJob", () => {
  test("writes a queued job and echoes key/version in the view", async () => {
    const project_id = seedProject()
    const view = await svc().createJob(createInput(project_id))
    expect(view.status).toBe("queued")
    expect(view.job_id).toMatch(/^asset_job_/)
    expect(view.key).toBe("k1")
    expect(view.version).toBe(1)
  })

  test("dedupes on (project_id, client_request_id) → returns the existing job", async () => {
    const project_id = seedProject()
    const s = svc()
    const first = await s.createJob(createInput(project_id, { client_request_id: "req-1" }))
    const second = await s.createJob(createInput(project_id, { client_request_id: "req-1" }))
    expect(second.job_id).toBe(first.job_id)
    expect(second.status).toBe("queued")
  })

  test("same client_request_id in a different project still creates a fresh job", async () => {
    const a = seedProject()
    const b = seedProject()
    const s = svc()
    const first = await s.createJob(createInput(a, { client_request_id: "shared" }))
    const second = await s.createJob(createInput(b, { client_request_id: "shared" }))
    expect(second.job_id).not.toBe(first.job_id)
  })

  test("absent client_request_id always creates a new job", async () => {
    const project_id = seedProject()
    const s = svc()
    const a = await s.createJob(createInput(project_id))
    const b = await s.createJob(createInput(project_id))
    expect(a.job_id).not.toBe(b.job_id)
  })

  test("recovers when concurrent create wins the (project_id, client_request_id) race (H1 regression)", async () => {
    const project_id = seedProject()
    const realRepo = AssetJobRepo.fromDatabase()
    // Pre-insert the "winning racer" row directly to simulate "someone else
    // committed first while we were between findByClientRequestId and create".
    const winnerId = ids.job()
    realRepo.create({
      id: winnerId,
      project_id,
      intent: { kind: "cg", spec_md: "", key: "k" },
      client_request_id: "race-key",
    })
    // Stubbed repo where the first findByClientRequestId returns null
    // (simulating "winner hasn't committed yet from our perspective"). The
    // subsequent createJob call must trip the UNIQUE constraint and then
    // recover by re-fetching the winner's row.
    let findCalls = 0
    class RacingRepo extends AssetJobRepo {
      override findByClientRequestId(
        project: string,
        cri: string,
      ): ReturnType<AssetJobRepo["findByClientRequestId"]> {
        findCalls++
        if (findCalls === 1) return null
        return realRepo.findByClientRequestId(project, cri)
      }
      override create(input: Parameters<AssetJobRepo["create"]>[0]) {
        return realRepo.create(input)
      }
      override findById(id: string) {
        return realRepo.findById(id)
      }
      override updateStatus(id: string, fields: Parameters<AssetJobRepo["updateStatus"]>[1]) {
        return realRepo.updateStatus(id, fields)
      }
    }
    const s = new AssetService({
      generator: stubGenerator(),
      writer: dbWriter,
      jobRepo: new RacingRepo(),
    })
    const view = await s.createJob(createInput(project_id, { client_request_id: "race-key" }))
    expect(view.job_id).toBe(winnerId)
    expect(findCalls).toBeGreaterThanOrEqual(2)
  })
})

describe("AssetService.getJob", () => {
  test("returns the queued view when the job hasn't run", async () => {
    const project_id = seedProject()
    const s = svc()
    const { job_id } = await s.createJob(createInput(project_id))
    const view = await s.getJob(job_id)
    expect(view.job_id).toBe(job_id)
    expect(view.status).toBe("queued")
    expect(view.result).toBeUndefined()
    expect(view.error).toBeUndefined()
  })

  test("returns the succeeded view with result.url after runJob", async () => {
    const project_id = seedProject()
    const s = svc()
    const created = await s.createJob(createInput(project_id, { asset_intent: intent({ kind: "cg" }) }))
    await s.runJob(created.job_id)
    const view = await s.getJob(created.job_id)
    expect(view.status).toBe("succeeded")
    expect(view.result).toBeDefined()
    expect(view.result?.url).toBe("https://oss/url.png")
    expect(view.result?.kind).toBe("cg")
    expect(view.result?.meta.langfuse_trace_id).toBe("trace-svc")
  })

  test("returns the failed view with error.code+message", async () => {
    const project_id = seedProject()
    const s = svc({
      generator: {
        async generate() {
          return { ok: false, code: "BUDGET_EXCEEDED", message: "ran 30 steps" }
        },
      },
    })
    const created = await s.createJob(createInput(project_id))
    await s.runJob(created.job_id)
    const view = await s.getJob(created.job_id)
    expect(view.status).toBe("failed")
    expect(view.error?.code).toBe("BUDGET_EXCEEDED")
    expect(view.error?.message).toBe("ran 30 steps")
    expect(view.result).toBeUndefined()
  })

  test("missing job throws AssetServiceError code=NOT_FOUND", async () => {
    const s = svc()
    let err: any
    try {
      await s.getJob("asset_job_doesnotexist")
    } catch (e) {
      err = e
    }
    expect(err).toBeInstanceOf(AssetServiceError)
    expect(err?.data?.code).toBe("NOT_FOUND")
  })
})

describe("AssetService.lookup", () => {
  test("forwards to Catalog and returns match_reason per query", async () => {
    const project_id = seedProject()
    const s = svc()
    const { job_id } = await s.createJob(createInput(project_id))
    await s.runJob(job_id)
    const results = await s.lookup(project_id, [{ key: "k1" }, { key: "ghost" }])
    expect(results).toHaveLength(2)
    expect(results[0].match_reason).toBe("exact_key")
    expect(results[1].match_reason).toBe("no_match")
  })
})

describe("AssetService.catalogSince", () => {
  test("forwards to Catalog and pages forward", async () => {
    const project_id = seedProject()
    const s = svc()
    // Create + run two jobs so there are two Asset rows.
    const c1 = await s.createJob(createInput(project_id, { asset_intent: intent({ key: "c/a" }) }))
    await s.runJob(c1.job_id)
    await Bun.sleep(2)
    const c2 = await s.createJob(createInput(project_id, { asset_intent: intent({ key: "c/b" }) }))
    await s.runJob(c2.job_id)
    const page = await s.catalogSince({ project_id, cursor: null, limit: 1 })
    expect(page.items).toHaveLength(1)
    expect(page.has_more).toBe(true)
    expect(page.next_cursor).not.toBeNull()
  })
})

describe("AssetService.runJob", () => {
  test("idempotent: running an already-succeeded job is a no-op", async () => {
    const project_id = seedProject()
    let calls = 0
    const generator: AssetGenerator = {
      async generate() {
        calls++
        return okOutcome()
      },
    }
    const s = svc({ generator })
    const created = await s.createJob(createInput(project_id))
    await s.runJob(created.job_id)
    await s.runJob(created.job_id)
    expect(calls).toBe(1)
  })

  test("missing job throws NOT_FOUND (matches runAssetGeneration guard)", async () => {
    const s = svc()
    let err: any
    try {
      await s.runJob("asset_job_doesnotexist")
    } catch (e) {
      err = e
    }
    expect(err?.data?.code).toBe("NOT_FOUND")
  })
})
