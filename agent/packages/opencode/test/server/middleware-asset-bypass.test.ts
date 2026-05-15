// Regression for the Phase 10 fix: WebAuthMiddleware must not interpret the
// asset-service's opaque Bearer tokens (ntms / msb / dev) as JWTs. Phase 8
// asset-service tests targeted the sub-app via app.request() directly and
// never exercised the global middleware chain, so the collision only
// surfaced once Phase 10 ran a real `agent serve`.
//
// The fix in src/server/middleware.ts short-circuits WebAuthMiddleware for
// paths starting with `/api/v1/assets/`. This file pins that behavior.

import { describe, expect, test } from "bun:test"
import { Hono } from "hono"
import { WebAuthMiddleware } from "@/server/middleware"

const mkApp = () => {
  const app = new Hono()
  app.use("*", WebAuthMiddleware)
  app.get("/api/v1/assets/lookup", (c) => c.json({ ok: true, where: "assets" }))
  app.get("/session", (c) => c.json({ ok: true, where: "session" }))
  return app
}

describe("WebAuthMiddleware — Phase 10 asset-service path bypass", () => {
  test("forwards an opaque (non-JWT) Bearer token on /api/v1/assets/* without 401-ing", async () => {
    const res = await mkApp().request("/api/v1/assets/lookup", {
      headers: { Authorization: "Bearer not-a-jwt-just-an-opaque-token" },
    })
    // Without the fix this is 401 "invalid token" because WebAuthMiddleware
    // tries verifyJwt() on the opaque token. With the fix it passes through.
    expect(res.status).toBe(200)
    const body = (await res.json()) as { ok?: boolean; where?: string }
    expect(body.ok).toBe(true)
    expect(body.where).toBe("assets")
  })

  test("forwards `Basic` auth (not Bearer) on /api/v1/assets/* without 401-ing", async () => {
    const res = await mkApp().request("/api/v1/assets/create", {
      headers: { Authorization: "Basic abc" },
      method: "GET",
    })
    // Asset routes don't define GET /create, so they 404 — but the
    // middleware itself must not 401 on a non-Bearer scheme. (We assert
    // "not 401" rather than 200 because the test app doesn't mount the
    // real asset router.)
    expect(res.status).not.toBe(401)
  })

  test("still enforces JWT verification on non-asset routes", async () => {
    const res = await mkApp().request("/session", {
      headers: { Authorization: "Bearer not-a-jwt" },
    })
    // Middleware tried to verify — exact code depends on env (401 when
    // JWT_SECRET is configured and the token fails, 500 when JWT_SECRET
    // is missing). Crucially it MUST NOT be 200 (which would mean the
    // request reached the route handler bypassing JWT checks).
    expect(res.status).not.toBe(200)
    expect([401, 500]).toContain(res.status)
  })

  test("non-asset routes still pass when no Authorization header is sent", async () => {
    const res = await mkApp().request("/session")
    expect(res.status).toBe(200)
  })

  test("OPTIONS preflight is allowed on both asset and non-asset paths", async () => {
    const a = await mkApp().request("/api/v1/assets/lookup", { method: "OPTIONS" })
    const b = await mkApp().request("/session", { method: "OPTIONS" })
    // CORS preflight should never 401 — both branches return next().
    expect(a.status).not.toBe(401)
    expect(b.status).not.toBe(401)
  })
})
