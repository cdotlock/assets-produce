import { describe, expect, test } from "bun:test"
import { eq } from "drizzle-orm"
import { Database } from "@/storage/db"
import { AssetTable } from "@/business/asset/asset.sql"
import { AssetJobTable } from "@/business/asset-service/asset-job.sql"
import { BusinessProjectTable } from "@/business/project/project.sql"
import { UserTable } from "@/business/user/user.sql"

const fresh = () => crypto.randomUUID().replace(/-/g, "").slice(0, 12)
const userIdSeq = () => `user_${fresh()}`
const projectIdSeq = () => `proj_${fresh()}`
const assetIdSeq = () => `asset_${fresh()}`
const jobIdSeq = () => `job_${fresh()}`

function seedProject(): string {
  const db = Database.Client()
  const uid = userIdSeq()
  const pid = projectIdSeq()
  db.insert(UserTable)
    .values({
      id: uid,
      username: `u_${fresh()}`,
      password_hash: "x",
      role: "creator",
    })
    .run()
  db.insert(BusinessProjectTable)
    .values({
      id: pid,
      type: "novel",
      title: "test-project",
      owner_id: uid,
    })
    .run()
  return pid
}

describe("Phase 8 Step 2 — Asset & AssetJob schema", () => {
  test("AssetTable accepts new nullable `name` and `kind` columns and exposes `time_updated`", () => {
    const pid = seedProject()
    const db = Database.Client()
    const aid = assetIdSeq()
    const before = Date.now()
    db.insert(AssetTable)
      .values({
        id: aid,
        project_id: pid,
        type: "image",
        key: `step2/name-kind/${fresh()}`,
        name: "stable-lookup-name",
        kind: "cg",
      })
      .run()
    const rows = db.select().from(AssetTable).where(eq(AssetTable.id, aid)).all()
    expect(rows.length).toBe(1)
    const row = rows[0]!
    expect(row.name).toBe("stable-lookup-name")
    expect(row.kind).toBe("cg")
    expect(typeof row.time_updated).toBe("number")
    expect(row.time_updated).toBeGreaterThanOrEqual(before)
  })

  test("AssetTable.kind round-trips every Phase 8 sub-type + the Phase 11 sfx & music kinds", () => {
    const pid = seedProject()
    const db = Database.Client()
    const kinds = ["character_portrait", "scene_bg", "cg", "cover", "shot_image", "shot_video", "sfx", "music"] as const
    for (const k of kinds) {
      const aid = assetIdSeq()
      db.insert(AssetTable)
        .values({
          id: aid,
          project_id: pid,
          type: "image",
          key: `step2/kind/${k}/${fresh()}`,
          kind: k,
        })
        .run()
      const [row] = db.select().from(AssetTable).where(eq(AssetTable.id, aid)).all()
      expect(row?.kind).toBe(k)
    }
  })

  test("AssetTable.name/kind remain optional (insert without them succeeds)", () => {
    const pid = seedProject()
    const db = Database.Client()
    const aid = assetIdSeq()
    db.insert(AssetTable)
      .values({
        id: aid,
        project_id: pid,
        type: "image",
        key: `step2/optional/${fresh()}`,
      })
      .run()
    const [row] = db.select().from(AssetTable).where(eq(AssetTable.id, aid)).all()
    expect(row?.name).toBeNull()
    expect(row?.kind).toBeNull()
    expect(typeof row?.time_updated).toBe("number")
  })

  test("AssetJobTable round-trips a queued job with intent JSON", () => {
    const pid = seedProject()
    const db = Database.Client()
    const jid = jobIdSeq()
    const intent = { kind: "cg", spec_md: "## hi", refs: [] }
    db.insert(AssetJobTable)
      .values({
        id: jid,
        project_id: pid,
        client_request_id: "client-req-1",
        intent,
        status: "queued",
      })
      .run()
    const [row] = db.select().from(AssetJobTable).where(eq(AssetJobTable.id, jid)).all()
    expect(row?.project_id).toBe(pid)
    expect(row?.client_request_id).toBe("client-req-1")
    expect(row?.intent).toEqual(intent)
    expect(row?.status).toBe("queued")
    expect(row?.asset_id).toBeNull()
    expect(row?.error_code).toBeNull()
    expect(row?.error_message).toBeNull()
    expect(row?.langfuse_trace_id).toBeNull()
    expect(typeof row?.time_created).toBe("number")
    expect(typeof row?.time_updated).toBe("number")
  })

  test("AssetJobTable.status enum covers queued/running/succeeded/failed/cancelled", () => {
    const pid = seedProject()
    const db = Database.Client()
    const statuses = ["queued", "running", "succeeded", "failed", "cancelled"] as const
    for (const status of statuses) {
      const jid = jobIdSeq()
      db.insert(AssetJobTable)
        .values({ id: jid, project_id: pid, intent: {}, status })
        .run()
      const [row] = db.select().from(AssetJobTable).where(eq(AssetJobTable.id, jid)).all()
      expect(row?.status).toBe(status)
    }
  })

  test("AssetJobTable.asset_id FK sets to null when referenced Asset is deleted", () => {
    const pid = seedProject()
    const db = Database.Client()
    const aid = assetIdSeq()
    const jid = jobIdSeq()
    db.insert(AssetTable)
      .values({
        id: aid,
        project_id: pid,
        type: "image",
        key: `step2/fk/${fresh()}`,
        kind: "cg",
      })
      .run()
    db.insert(AssetJobTable)
      .values({
        id: jid,
        project_id: pid,
        intent: {},
        status: "succeeded",
        asset_id: aid,
      })
      .run()
    db.delete(AssetTable).where(eq(AssetTable.id, aid)).run()
    const [row] = db.select().from(AssetJobTable).where(eq(AssetJobTable.id, jid)).all()
    expect(row).toBeDefined()
    expect(row?.asset_id).toBeNull()
  })

  test("AssetJobTable cascades on BusinessProject delete", () => {
    const pid = seedProject()
    const db = Database.Client()
    const jid = jobIdSeq()
    db.insert(AssetJobTable)
      .values({ id: jid, project_id: pid, intent: {}, status: "queued" })
      .run()
    db.delete(BusinessProjectTable).where(eq(BusinessProjectTable.id, pid)).run()
    const rows = db.select().from(AssetJobTable).where(eq(AssetJobTable.id, jid)).all()
    expect(rows.length).toBe(0)
  })
})
