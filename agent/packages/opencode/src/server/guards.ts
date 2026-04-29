import type { MiddlewareHandler } from "hono"

// Hono middleware guards used by JWT-gated HTTP routes.
//
// Place these in the route chain BEFORE body validators so auth runs first
// (a missing/invalid JWT short-circuits 401 instead of 400 from Zod).
//
// `c.var.user` is populated by WebAuthMiddleware (server/middleware.ts).

export const requireAuth: MiddlewareHandler = async (c, next) => {
  if (!c.var.user) {
    c.status(401)
    return c.json({ error: "unauthorized" })
  }
  return next()
}

export const requireAdmin: MiddlewareHandler = async (c, next) => {
  if (!c.var.user) {
    c.status(401)
    return c.json({ error: "unauthorized" })
  }
  if (c.var.user.role !== "admin") {
    c.status(403)
    return c.json({ error: "admin role required" })
  }
  return next()
}
