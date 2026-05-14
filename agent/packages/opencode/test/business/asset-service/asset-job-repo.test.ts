import { describe, expect, test } from "bun:test"
import { AssetJobRepo } from "@/business/asset-service/asset-job.repo"
import { ids, seedAsset, seedProject } from "./fixture"

const repo = () => AssetJobRepo.fromDatabase()

describe("AssetJobRepo.create", () => {
  test("inserts a queued job with the supplied id and intent", () => {
    const project_id = seedProject()
    const id = ids.job()
    const intent = { kind: "cg", spec_md: "## hello", key: "k1" }
    const before = Date.now()
    const row = repo().create({
      id,
      project_id,
      intent,
      client_request_id: "client-1",
    })
    expect(row.id).toBe(id)
    expect(row.project_id).toBe(project_id)
    expect(row.status).toBe("queued")
    expect(row.intent).toEqual(intent)
    expect(row.client_request_id).toBe("client-1")
    expect(row.asset_id).toBeNull()
    expect(row.error_code).toBeNull()
    expect(row.error_message).toBeNull()
    expect(row.langfuse_trace_id).toBeNull()
    expect(typeof row.time_created).toBe("number")
    expect(row.time_created).toBeGreaterThanOrEqual(before)
    expect(typeof row.time_updated).toBe("number")
  })

  test("allows omitting client_request_id", () => {
    const project_id = seedProject()
    const id = ids.job()
    const row = repo().create({ id, project_id, intent: {} })
    expect(row.client_request_id).toBeNull()
    expect(row.status).toBe("queued")
  })
})

describe("AssetJobRepo.findById", () => {
  test("returns the inserted row", () => {
    const project_id = seedProject()
    const id = ids.job()
    repo().create({ id, project_id, intent: { kind: "cg" } })
    const row = repo().findById(id)
    expect(row).not.toBeNull()
    expect(row?.id).toBe(id)
    expect(row?.intent).toEqual({ kind: "cg" })
  })

  test("returns null when no row matches", () => {
    expect(repo().findById(ids.job())).toBeNull()
  })
})

describe("AssetJobRepo.findByClientRequestId", () => {
  test("returns the row when (project_id, client_request_id) matches", () => {
    const project_id = seedProject()
    const id = ids.job()
    repo().create({ id, project_id, intent: {}, client_request_id: "dedupe-key" })
    const found = repo().findByClientRequestId(project_id, "dedupe-key")
    expect(found?.id).toBe(id)
  })

  test("scopes by project_id (same client_request_id in another project is not returned)", () => {
    const a = seedProject()
    const b = seedProject()
    repo().create({ id: ids.job(), project_id: a, intent: {}, client_request_id: "shared" })
    const found = repo().findByClientRequestId(b, "shared")
    expect(found).toBeNull()
  })

  test("returns null when no client_request_id matches", () => {
    const project_id = seedProject()
    expect(repo().findByClientRequestId(project_id, "missing")).toBeNull()
  })

  test("ignores empty / null client_request_id queries", () => {
    const project_id = seedProject()
    repo().create({ id: ids.job(), project_id, intent: {} }) // no client_request_id
    expect(repo().findByClientRequestId(project_id, "")).toBeNull()
  })
})

describe("AssetJobRepo.updateStatus", () => {
  test("transitions queued → running and bumps time_updated", async () => {
    const project_id = seedProject()
    const id = ids.job()
    const created = repo().create({ id, project_id, intent: {} })
    // Bun's Date.now() has ms resolution; sleep 2ms to make the bump visible.
    await Bun.sleep(2)
    const after = repo().updateStatus(id, { status: "running" })
    expect(after?.status).toBe("running")
    expect(after?.time_updated).toBeGreaterThanOrEqual(created.time_updated)
  })

  test("can also set asset_id / langfuse_trace_id on succeeded transition", () => {
    const project_id = seedProject()
    const id = ids.job()
    repo().create({ id, project_id, intent: {} })
    const { id: asset_id } = seedAsset({ project_id, kind: "cg" })
    const row = repo().updateStatus(id, {
      status: "succeeded",
      asset_id,
      langfuse_trace_id: "trace-abc",
    })
    expect(row?.status).toBe("succeeded")
    expect(row?.asset_id).toBe(asset_id)
    expect(row?.langfuse_trace_id).toBe("trace-abc")
  })

  test("can write error_code / error_message on failed transition", () => {
    const project_id = seedProject()
    const id = ids.job()
    repo().create({ id, project_id, intent: {} })
    const row = repo().updateStatus(id, {
      status: "failed",
      error_code: "BUDGET_EXCEEDED",
      error_message: "step limit",
    })
    expect(row?.status).toBe("failed")
    expect(row?.error_code).toBe("BUDGET_EXCEEDED")
    expect(row?.error_message).toBe("step limit")
  })

  test("returns null when the row does not exist", () => {
    expect(repo().updateStatus(ids.job(), { status: "running" })).toBeNull()
  })
})
