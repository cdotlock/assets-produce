// Asset Service Bearer auth — distinct from the JWT auth used by creator-
// profile routes (server/guards.ts requireAuth). Three named tokens (per
// design § 5.5): ntms (novels-to-moonscript), msb (moonshort-backend), dev.
//
// Token config comes from env: ASSETS_API_TOKEN_<NAME> + ASSETS_API_PROJECTS_<NAME>.
// Projects is a CSV of project ids; literal "*" means "any project".
//
// The middleware sets c.var.assetToken so route handlers can call
// tokenCanAccess(c.var.assetToken, project_id) for the 403 check. Route
// handlers (not the middleware) decide which project_id to assert against,
// because that's pulled from path params / body and the middleware can't
// universally know it.

import type { MiddlewareHandler } from "hono"

export interface AssetTokenSpec {
  name: string
  token: string
  projects: string[] | "*"
}

export interface AssetAuthConfig {
  tokens: AssetTokenSpec[]
}

export interface AssetAuthContext {
  name: string
  projects: string[] | "*"
}

const TOKEN_NAMES = ["ntms", "msb", "dev"] as const

export function loadAssetAuthFromEnv(env: NodeJS.ProcessEnv = process.env): AssetAuthConfig {
  const tokens: AssetTokenSpec[] = []
  for (const name of TOKEN_NAMES) {
    const upper = name.toUpperCase()
    const token = env[`ASSETS_API_TOKEN_${upper}`]
    if (!token) continue
    const projectsRaw = env[`ASSETS_API_PROJECTS_${upper}`] ?? ""
    const projects =
      projectsRaw === "*"
        ? "*"
        : projectsRaw
            .split(",")
            .map((s) => s.trim())
            .filter((s) => s.length > 0)
    tokens.push({ name, token, projects })
  }
  return { tokens }
}

export function tokenCanAccess(ctx: AssetAuthContext, project_id: string): boolean {
  if (ctx.projects === "*") return true
  return ctx.projects.includes(project_id)
}

const BEARER_RE = /^Bearer\s+(\S.*)$/

export function makeAssetServiceAuth(config: AssetAuthConfig): MiddlewareHandler<{
  Variables: { assetToken: AssetAuthContext }
}> {
  const byToken = new Map<string, AssetAuthContext>()
  for (const t of config.tokens) {
    byToken.set(t.token, { name: t.name, projects: t.projects })
  }
  return async (c, next) => {
    const header = c.req.header("Authorization") ?? c.req.header("authorization") ?? ""
    const match = BEARER_RE.exec(header.trim())
    if (!match) {
      c.status(401)
      return c.json({
        error: { code: "UNAUTHENTICATED", message: "missing or malformed Authorization header" },
      })
    }
    const token = match[1]!.trim()
    const ctx = byToken.get(token)
    if (!ctx) {
      c.status(401)
      return c.json({ error: { code: "UNAUTHENTICATED", message: "invalid token" } })
    }
    c.set("assetToken", ctx)
    return next()
  }
}
