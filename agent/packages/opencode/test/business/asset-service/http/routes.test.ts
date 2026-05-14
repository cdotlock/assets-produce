import { describe, expect, test } from "bun:test"
import { eq } from "drizzle-orm"
import { Database } from "@/storage/db"
import { AssetTable } from "@/business/asset/asset.sql"
import { AssetService } from "@/business/asset-service/asset-service"
import { mountAssetServiceRoutes } from "@/business/asset-service/http"
import type {
  AssetGenerator,
  AssetWriter,
  GenerationOutcome,
} from "@/business/asset-service/run-asset-generation"
import { ids, seedProject } from "../fixture"

// ---------- fixtures ----------

const okOutcome = (
  overrides: Partial<Extract<GenerationOutcome, { ok: true }>> = {},
): GenerationOutcome => ({
  ok: true,
  atomic_tool: "stub",
  url: "https://oss/test.png",
  ref_urls: [],
  langfuse_trace_id: "trace-http",
  ...overrides,
})

const stubGenerator = (out: GenerationOutcome = okOutcome()): AssetGenerator => ({
  async generate() {
    return out
  },
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

// One Bearer token allowed for project A, plus a "*" dev token. Lets us
// cover 401 / 403 / 200 without permuting too many.
const TOKEN_NAMED = "tok-named"
const TOKEN_DEV = "tok-dev"

const buildApp = (project_id_named: string, generator: AssetGenerator = stubGenerator()) => {
  const svc = new AssetService({ generator, writer: dbWriter })
  return mountAssetServiceRoutes({
    service: svc,
    auth: {
      tokens: [
        { name: "named", token: TOKEN_NAMED, projects: [project_id_named] },
        { name: "dev", token: TOKEN_DEV, projects: "*" },
      ],
    },
  })
}

const authBearer = (token: string): HeadersInit => ({ Authorization: `Bearer ${token}` })
const json = (body: unknown): HeadersInit => ({ "Content-Type": "application/json" })

// ---------- auth envelope ----------

describe("HTTP — auth envelope", () => {
  test("POST /api/v1/assets/create → 401 when missing Authorization", async () => {
    const project_id = seedProject()
    const app = buildApp(project_id)
    const res = await app.request("/api/v1/assets/create", {
      method: "POST",
      headers: json({}),
      body: JSON.stringify({ project_id, asset_intent: { kind: "cg", key: "k", spec_md: "" } }),
    })
    expect(res.status).toBe(401)
  })

  test("POST /api/v1/assets/create → 401 when token unknown", async () => {
    const project_id = seedProject()
    const app = buildApp(project_id)
    const res = await app.request("/api/v1/assets/create", {
      method: "POST",
      headers: { ...authBearer("bogus"), ...json({}) },
      body: JSON.stringify({ project_id, asset_intent: { kind: "cg", key: "k", spec_md: "" } }),
    })
    expect(res.status).toBe(401)
  })

  test("POST /api/v1/assets/create → 403 when token cannot access that project", async () => {
    const allowed = seedProject()
    const other = seedProject()
    const app = buildApp(allowed)
    const res = await app.request("/api/v1/assets/create", {
      method: "POST",
      headers: { ...authBearer(TOKEN_NAMED), ...json({}) },
      body: JSON.stringify({ project_id: other, asset_intent: { kind: "cg", key: "k", spec_md: "" } }),
    })
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error.code).toBe("FORBIDDEN")
  })
})

// ---------- POST /create ----------

describe("HTTP — POST /api/v1/assets/create", () => {
  test("200 returns job view with status=queued", async () => {
    const project_id = seedProject()
    const app = buildApp(project_id)
    const res = await app.request("/api/v1/assets/create", {
      method: "POST",
      headers: { ...authBearer(TOKEN_NAMED), ...json({}) },
      body: JSON.stringify({
        project_id,
        asset_intent: { kind: "cg", key: "create/k", spec_md: "## brief" },
        client_request_id: "ci-1",
      }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.job_id).toMatch(/^asset_job_/)
    expect(body.status).toBe("queued")
    expect(body.key).toBe("create/k")
    expect(body.version).toBe(1)
  })

  test("dedupe: same client_request_id returns the same job_id", async () => {
    const project_id = seedProject()
    const app = buildApp(project_id)
    const make = () =>
      app.request("/api/v1/assets/create", {
        method: "POST",
        headers: { ...authBearer(TOKEN_NAMED), ...json({}) },
        body: JSON.stringify({
          project_id,
          asset_intent: { kind: "cg", key: "create/dedupe", spec_md: "" },
          client_request_id: "dup-1",
        }),
      })
    const first = await (await make()).json()
    const second = await (await make()).json()
    expect(first.job_id).toBe(second.job_id)
  })

  test("400 when body fails zod validation", async () => {
    const project_id = seedProject()
    const app = buildApp(project_id)
    const res = await app.request("/api/v1/assets/create", {
      method: "POST",
      headers: { ...authBearer(TOKEN_NAMED), ...json({}) },
      body: JSON.stringify({ project_id }), // missing asset_intent
    })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.code).toBe("INVALID_INPUT")
  })
})

// ---------- GET /jobs/:id ----------

describe("HTTP — GET /api/v1/assets/jobs/:id", () => {
  test("200 returns the queued job before runJob", async () => {
    const project_id = seedProject()
    const app = buildApp(project_id)
    const created = await (
      await app.request("/api/v1/assets/create", {
        method: "POST",
        headers: { ...authBearer(TOKEN_NAMED), ...json({}) },
        body: JSON.stringify({
          project_id,
          asset_intent: { kind: "cg", key: "jobs/k", spec_md: "" },
        }),
      })
    ).json()

    const res = await app.request(`/api/v1/assets/jobs/${created.job_id}`, {
      headers: authBearer(TOKEN_NAMED),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe("queued")
    expect(body.result).toBeUndefined()
  })

  test("200 returns succeeded job with result.url after runJob completes", async () => {
    const project_id = seedProject()
    const app = buildApp(project_id)
    const created = await (
      await app.request("/api/v1/assets/create", {
        method: "POST",
        headers: { ...authBearer(TOKEN_NAMED), ...json({}) },
        body: JSON.stringify({
          project_id,
          asset_intent: { kind: "cg", key: "jobs/finished", spec_md: "" },
        }),
      })
    ).json()
    // Wait for the fire-and-forget worker to settle — the route handler
    // schedules svc.runJob() asynchronously after createJob returns.
    await new Promise<void>((resolve) => setTimeout(resolve, 30))

    const res = await app.request(`/api/v1/assets/jobs/${created.job_id}`, {
      headers: authBearer(TOKEN_NAMED),
    })
    const body = await res.json()
    expect(body.status).toBe("succeeded")
    expect(body.result.url).toBe("https://oss/test.png")
    expect(body.result.kind).toBe("cg")
    expect(body.result.meta.langfuse_trace_id).toBe("trace-http")
  })

  test("404 when the job id does not exist", async () => {
    const project_id = seedProject()
    const app = buildApp(project_id)
    const res = await app.request("/api/v1/assets/jobs/asset_job_missing", {
      headers: authBearer(TOKEN_NAMED),
    })
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error.code).toBe("NOT_FOUND")
  })

  test("403 when token cannot access the job's project", async () => {
    const allowed = seedProject()
    const other = seedProject()
    const app = buildApp(allowed)
    // Create via dev token (allowed everywhere)
    const created = await (
      await app.request("/api/v1/assets/create", {
        method: "POST",
        headers: { ...authBearer(TOKEN_DEV), ...json({}) },
        body: JSON.stringify({
          project_id: other,
          asset_intent: { kind: "cg", key: "jobs/k", spec_md: "" },
        }),
      })
    ).json()
    // Read with named token (cannot see `other`)
    const res = await app.request(`/api/v1/assets/jobs/${created.job_id}`, {
      headers: authBearer(TOKEN_NAMED),
    })
    expect(res.status).toBe(403)
  })
})

// ---------- POST /lookup ----------

describe("HTTP — POST /api/v1/assets/lookup", () => {
  test("200 returns one result per query with match_reason", async () => {
    const project_id = seedProject()
    const app = buildApp(project_id)
    // Insert a current asset directly so lookup has something to find.
    const aid = ids.asset()
    const db = Database.Client()
    db.insert(AssetTable)
      .values({
        id: aid,
        project_id,
        type: "image",
        kind: "cg",
        key: "lookup/k",
        name: "Hero portrait",
        url: "https://oss/h.png",
      })
      .run()
    const res = await app.request("/api/v1/assets/lookup", {
      method: "POST",
      headers: { ...authBearer(TOKEN_NAMED), ...json({}) },
      body: JSON.stringify({
        project_id,
        queries: [{ key: "lookup/k" }, { name: "Hero portrait" }, { key: "ghost" }],
      }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.results).toHaveLength(3)
    expect(body.results[0].match_reason).toBe("exact_key")
    expect(body.results[1].match_reason).toBe("name_exact")
    expect(body.results[2].match_reason).toBe("no_match")
  })

  test("400 when queries array is missing", async () => {
    const project_id = seedProject()
    const app = buildApp(project_id)
    const res = await app.request("/api/v1/assets/lookup", {
      method: "POST",
      headers: { ...authBearer(TOKEN_NAMED), ...json({}) },
      body: JSON.stringify({ project_id }),
    })
    expect(res.status).toBe(400)
  })

  test("400 when a query carries neither key nor name (M2 regression)", async () => {
    const project_id = seedProject()
    const app = buildApp(project_id)
    const res = await app.request("/api/v1/assets/lookup", {
      method: "POST",
      headers: { ...authBearer(TOKEN_NAMED), ...json({}) },
      body: JSON.stringify({ project_id, queries: [{}] }),
    })
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error?: { code?: string; message?: string } }
    expect(body.error?.code).toBe("INVALID_INPUT")
  })

  test("403 when token cannot access project_id", async () => {
    const a = seedProject()
    const b = seedProject()
    const app = buildApp(a)
    const res = await app.request("/api/v1/assets/lookup", {
      method: "POST",
      headers: { ...authBearer(TOKEN_NAMED), ...json({}) },
      body: JSON.stringify({ project_id: b, queries: [{ key: "x" }] }),
    })
    expect(res.status).toBe(403)
  })
})

// ---------- GET /catalog ----------

describe("HTTP — GET /api/v1/assets/catalog", () => {
  test("200 returns the items + has_more + next_cursor", async () => {
    const project_id = seedProject()
    const app = buildApp(project_id)
    const db = Database.Client()
    for (let i = 0; i < 3; i++) {
      db.insert(AssetTable)
        .values({
          id: ids.asset(),
          project_id,
          type: "image",
          kind: "cg",
          key: `cat/${i}`,
          url: `https://oss/${i}.png`,
        })
        .run()
      await Bun.sleep(2)
    }
    const res = await app.request(
      `/api/v1/assets/catalog?project_id=${encodeURIComponent(project_id)}&limit=2`,
      { headers: authBearer(TOKEN_NAMED) },
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.items).toHaveLength(2)
    expect(body.has_more).toBe(true)
    expect(body.next_cursor).not.toBeNull()
  })

  test("400 when project_id query param is missing", async () => {
    const project_id = seedProject()
    const app = buildApp(project_id)
    const res = await app.request("/api/v1/assets/catalog?limit=10", {
      headers: authBearer(TOKEN_NAMED),
    })
    expect(res.status).toBe(400)
  })

  test("403 when token cannot access project_id", async () => {
    const a = seedProject()
    const b = seedProject()
    const app = buildApp(a)
    const res = await app.request(`/api/v1/assets/catalog?project_id=${encodeURIComponent(b)}`, {
      headers: authBearer(TOKEN_NAMED),
    })
    expect(res.status).toBe(403)
  })
})

// ---------- end-to-end integration ----------

describe("HTTP — integration", () => {
  test("create → wait → succeeded; lookup finds the new asset by name", async () => {
    const project_id = seedProject()
    const app = buildApp(project_id)
    const created = await (
      await app.request("/api/v1/assets/create", {
        method: "POST",
        headers: { ...authBearer(TOKEN_NAMED), ...json({}) },
        body: JSON.stringify({
          project_id,
          asset_intent: {
            kind: "character_portrait",
            key: "e2e/portrait",
            spec_md: "",
            name: "E2E Hero",
          },
        }),
      })
    ).json()

    // Poll until succeeded (fire-and-forget worker)
    let view: { status?: string; result?: { asset_id?: string } } = {}
    for (let i = 0; i < 50 && view.status !== "succeeded"; i++) {
      await new Promise<void>((r) => setTimeout(r, 10))
      const res = await app.request(`/api/v1/assets/jobs/${created.job_id}`, {
        headers: authBearer(TOKEN_NAMED),
      })
      view = await res.json()
    }
    expect(view.status).toBe("succeeded")

    const lookup = await (
      await app.request("/api/v1/assets/lookup", {
        method: "POST",
        headers: { ...authBearer(TOKEN_NAMED), ...json({}) },
        body: JSON.stringify({ project_id, queries: [{ name: "E2E Hero" }] }),
      })
    ).json()
    expect(lookup.results[0].asset?.url).toBe("https://oss/test.png")
  })

  test("catalog round-trip: page 1 → cursor → page 2 exhausts", async () => {
    const project_id = seedProject()
    const app = buildApp(project_id)
    const db = Database.Client()
    for (let i = 0; i < 5; i++) {
      db.insert(AssetTable)
        .values({
          id: ids.asset(),
          project_id,
          type: "image",
          kind: "cg",
          key: `pages/${i}`,
          url: `https://oss/p${i}.png`,
        })
        .run()
      await Bun.sleep(2)
    }
    const url = (cursor: string | null) =>
      `/api/v1/assets/catalog?project_id=${encodeURIComponent(project_id)}&limit=3${
        cursor ? `&since=${encodeURIComponent(cursor)}` : ""
      }`
    const p1 = await (await app.request(url(null), { headers: authBearer(TOKEN_NAMED) })).json()
    expect(p1.items).toHaveLength(3)
    expect(p1.has_more).toBe(true)
    const p2 = await (
      await app.request(url(p1.next_cursor), { headers: authBearer(TOKEN_NAMED) })
    ).json()
    expect(p2.items).toHaveLength(2)
    expect(p2.has_more).toBe(false)
  })
})
