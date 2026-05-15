import { describe, expect, test } from "bun:test"
import { Hono } from "hono"
import {
  loadAssetAuthFromEnv,
  makeAssetServiceAuth,
  tokenCanAccess,
  type AssetAuthConfig,
  type AssetAuthContext,
} from "@/business/asset-service/http/auth"
import { LookupRoute } from "@/business/asset-service/http/lookup"
import type { AssetService } from "@/business/asset-service/asset-service"

const cfg = (tokens: AssetAuthConfig["tokens"]): AssetAuthConfig => ({ tokens })

const mkApp = (config: AssetAuthConfig) => {
  const app = new Hono<{ Variables: { assetToken: AssetAuthContext } }>()
  app.use("/x/*", makeAssetServiceAuth(config))
  app.get("/x/echo", (c) => c.json({ token_name: c.var.assetToken.name }))
  return app
}

describe("loadAssetAuthFromEnv", () => {
  test("picks up ASSETS_API_TOKEN_* + ASSETS_API_PROJECTS_* triples", () => {
    const env = {
      ASSETS_API_TOKEN_NTMS: "tok-ntms",
      ASSETS_API_PROJECTS_NTMS: "proj_a,proj_b",
      ASSETS_API_TOKEN_MSB: "tok-msb",
      ASSETS_API_PROJECTS_MSB: "proj_c",
      ASSETS_API_TOKEN_DEV: "tok-dev",
      ASSETS_API_PROJECTS_DEV: "*",
    }
    const out = loadAssetAuthFromEnv(env as NodeJS.ProcessEnv)
    expect(out.tokens).toHaveLength(3)
    expect(out.tokens.find((t) => t.name === "ntms")).toEqual({
      name: "ntms",
      token: "tok-ntms",
      projects: ["proj_a", "proj_b"],
    })
    expect(out.tokens.find((t) => t.name === "dev")?.projects).toBe("*")
  })

  test("skips a token name when env var is unset", () => {
    const env = { ASSETS_API_TOKEN_DEV: "tok-dev", ASSETS_API_PROJECTS_DEV: "*" }
    const out = loadAssetAuthFromEnv(env as NodeJS.ProcessEnv)
    expect(out.tokens).toHaveLength(1)
    expect(out.tokens[0].name).toBe("dev")
  })

  test("empty projects string yields empty array (caller must provide at least one)", () => {
    const env = { ASSETS_API_TOKEN_NTMS: "tok", ASSETS_API_PROJECTS_NTMS: "" }
    const out = loadAssetAuthFromEnv(env as NodeJS.ProcessEnv)
    expect(out.tokens[0].projects).toEqual([])
  })

  test("ignores empty-token entries (env var present but value empty)", () => {
    const env = { ASSETS_API_TOKEN_NTMS: "", ASSETS_API_PROJECTS_NTMS: "p" }
    const out = loadAssetAuthFromEnv(env as NodeJS.ProcessEnv)
    expect(out.tokens).toHaveLength(0)
  })
})

describe("tokenCanAccess", () => {
  test("wildcard '*' admits any project", () => {
    expect(tokenCanAccess({ name: "dev", projects: "*" }, "anything")).toBe(true)
  })
  test("listed project is admitted", () => {
    expect(tokenCanAccess({ name: "n", projects: ["a", "b"] }, "a")).toBe(true)
  })
  test("unlisted project is denied", () => {
    expect(tokenCanAccess({ name: "n", projects: ["a"] }, "b")).toBe(false)
  })
  test("empty list denies everything (deny-by-default)", () => {
    expect(tokenCanAccess({ name: "n", projects: [] }, "a")).toBe(false)
  })
})

describe("makeAssetServiceAuth middleware", () => {
  const config = cfg([
    { name: "ntms", token: "tok-ntms", projects: ["proj_a"] },
    { name: "dev", token: "tok-dev", projects: "*" },
  ])

  test("401 when Authorization header is missing", async () => {
    const res = await mkApp(config).request("/x/echo")
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error.code).toBe("UNAUTHENTICATED")
    expect(body.error.message).toMatch(/Authorization/i)
  })

  test("401 when Authorization header is not a Bearer", async () => {
    const res = await mkApp(config).request("/x/echo", {
      headers: { Authorization: "Basic abc" },
    })
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error.code).toBe("UNAUTHENTICATED")
  })

  test("401 when token does not match any configured token", async () => {
    const res = await mkApp(config).request("/x/echo", {
      headers: { Authorization: "Bearer not-a-real-token" },
    })
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error.code).toBe("UNAUTHENTICATED")
    expect(body.error.message).toMatch(/invalid/i)
  })

  test("200 + sets c.var.assetToken when token is valid", async () => {
    const res = await mkApp(config).request("/x/echo", {
      headers: { Authorization: "Bearer tok-ntms" },
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.token_name).toBe("ntms")
  })

  test("works with Bearer surrounded by extra whitespace", async () => {
    const res = await mkApp(config).request("/x/echo", {
      headers: { Authorization: "Bearer   tok-dev" },
    })
    expect(res.status).toBe(200)
  })
})

// Phase 10 — verify the full middleware + route path returns 403 (not 401) when
// a valid token is presented but its project allowlist doesn't include the
// requested `project_id`. The cross-project denial lives in each route handler
// via `tokenCanAccess`; this test wires up `LookupRoute` end-to-end so a
// regression in either layer would surface here.
describe("auth middleware + lookup route (cross-project denial)", () => {
  const cfg10: AssetAuthConfig = {
    tokens: [
      { name: "ntms", token: "tok-ntms", projects: ["novel_allowed"] },
      { name: "dev", token: "tok-dev", projects: "*" },
    ],
  }

  // Minimal stub — the 403 fires before `svc.lookup` runs, so we only need
  // the type to satisfy the route constructor. A `lookup` call here would
  // make the test useless (it would mean the guard missed).
  const stubSvc = {
    lookup: async () => {
      throw new Error("svc.lookup should not be called when token is forbidden")
    },
  } as unknown as AssetService

  const mkLookupApp = (config: AssetAuthConfig) => {
    const app = new Hono<{ Variables: { assetToken: AssetAuthContext } }>()
    app.use("/api/v1/assets/*", makeAssetServiceAuth(config))
    app.route("/api/v1/assets", LookupRoute(stubSvc))
    return app
  }

  test("403 when token is valid but project_id is outside its allowlist", async () => {
    const res = await mkLookupApp(cfg10).request("/api/v1/assets/lookup", {
      method: "POST",
      headers: {
        Authorization: "Bearer tok-ntms",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        project_id: "novel_other_book",
        queries: [{ key: "anything" }],
      }),
    })
    expect(res.status).toBe(403)
    const body = (await res.json()) as { error?: { code?: string; message?: string } }
    expect(body.error?.code).toBe("FORBIDDEN")
    expect(body.error?.message).toMatch(/novel_other_book/)
  })

  test("200 path-through when token is valid and project_id is allowed (wildcard)", async () => {
    const wildcardSvc = {
      lookup: async () => [{ query: { key: "k" }, status: "no_match" as const }],
    } as unknown as AssetService
    const app = new Hono<{ Variables: { assetToken: AssetAuthContext } }>()
    app.use("/api/v1/assets/*", makeAssetServiceAuth(cfg10))
    app.route("/api/v1/assets", LookupRoute(wildcardSvc))

    const res = await app.request("/api/v1/assets/lookup", {
      method: "POST",
      headers: {
        Authorization: "Bearer tok-dev",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        project_id: "any_project_id",
        queries: [{ key: "anything" }],
      }),
    })
    expect(res.status).toBe(200)
  })

  test("403 deny-by-default when token has empty allowlist", async () => {
    const empty: AssetAuthConfig = {
      tokens: [{ name: "ntms", token: "tok-empty", projects: [] }],
    }
    const res = await mkLookupApp(empty).request("/api/v1/assets/lookup", {
      method: "POST",
      headers: {
        Authorization: "Bearer tok-empty",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        project_id: "novel_anything",
        queries: [{ key: "k" }],
      }),
    })
    expect(res.status).toBe(403)
  })
})
