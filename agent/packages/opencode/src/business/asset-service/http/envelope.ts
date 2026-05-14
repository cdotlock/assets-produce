// Shared error envelope helpers for the asset-service HTTP routes.
//
// The public envelope is uniform across all 4 endpoints:
//   { error: { code, message } }
// with the HTTP status pulled from ASSET_SERVICE_ERROR_HTTP. Anything thrown
// during the request that is NOT an AssetServiceError becomes a 500
// INTERNAL — we don't leak raw error messages.

import type { Context } from "hono"
import * as Log from "@opencode-ai/core/util/log"
import { AssetServiceError, ASSET_SERVICE_ERROR_HTTP, type AssetServiceErrorCode } from "../errors"

const log = Log.create({ service: "asset-service.http.envelope" })

// hono-openapi's validator passes us its own `Issue` shape that is not
// 1:1 with zod's `$ZodIssue` (path is widened, code differs by version).
// We only need .path + .message for our error envelope; capture the
// minimum here so the helper doesn't pin a specific zod or hono-openapi
// version.
interface ValidationIssue {
  // hono-openapi widens path segments past zod's literal triple — accept
  // anything stringifiable and let .map(String) coerce.
  path?: readonly unknown[]
  message: string
}

export interface ErrorEnvelope {
  error: { code: AssetServiceErrorCode; message: string }
}

export function makeError(code: AssetServiceErrorCode, message: string): ErrorEnvelope {
  return { error: { code, message } }
}

export function errStatus(code: AssetServiceErrorCode): number {
  return ASSET_SERVICE_ERROR_HTTP[code] ?? 500
}

// hono-openapi's validator hands us `readonly Issue[]` directly (not the
// outer ZodError). Build a short human-readable summary from the first
// issue (caller can still see the full structure in logs).
export function zodMessage(issues: readonly ValidationIssue[]): string {
  const first = issues[0]
  if (!first) return "invalid input"
  const segs = first.path ?? []
  const path = segs.length > 0 ? segs.map(String).join(".") + ": " : ""
  return `${path}${first.message}`
}

// Centralized catch — used by handlers so each route doesn't reimplement the
// "AssetServiceError → envelope, otherwise INTERNAL" pattern.
//
// Raw exception messages NEVER reach the client (would leak DB schema
// fingerprints, internal paths, sqlite constraint names, etc.). Log them
// server-side with a structured payload so operators can still diagnose.
export async function handle<T>(c: Context, run: () => Promise<T>): Promise<Response> {
  try {
    const out = await run()
    return c.json(out as object)
  } catch (e) {
    if (AssetServiceError.isInstance(e)) {
      const { code, message } = e.data
      c.status(errStatus(code) as 400 | 401 | 403 | 404 | 422 | 500 | 502)
      return c.json(makeError(code, message))
    }
    log.error("asset-service unhandled exception", {
      path: c.req.path,
      method: c.req.method,
      error: e instanceof Error ? e.message : String(e),
      stack: e instanceof Error ? e.stack : undefined,
    })
    c.status(500)
    return c.json(makeError("INTERNAL", "internal error"))
  }
}
