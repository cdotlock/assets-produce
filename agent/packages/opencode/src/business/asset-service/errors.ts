import { NamedError } from "@opencode-ai/core/util/error"
import { z } from "zod"

// Public AssetService error codes. Map 1:1 with the HTTP / MCP error
// envelope `{ error: { code, message } }` in design doc § 4.
export const AssetServiceErrorCode = z.enum([
  // Lookup / fetch
  "NOT_FOUND",
  "PROJECT_NOT_FOUND",
  "ASSET_NOT_FOUND",
  // Input
  "INVALID_INPUT",
  // Auth (set by HTTP middleware; defined here so the codebase has one
  // canonical enum of strings the API can emit).
  "UNAUTHENTICATED",
  "FORBIDDEN",
  // Mini agent loop
  "BUDGET_EXCEEDED",
  "GENERATION_REJECTED",
  "ATOMIC_TOOL_FAILED",
  // Unhandled
  "INTERNAL",
])
export type AssetServiceErrorCode = z.infer<typeof AssetServiceErrorCode>

export const AssetServiceError = NamedError.create(
  "AssetServiceError",
  z.object({
    code: AssetServiceErrorCode,
    message: z.string(),
    // Optional contextual fields used by tests / logs; never serialized to
    // the API caller (the public envelope is `{code, message}`).
    op: z.string().optional(),
    detail: z.unknown().optional(),
  }),
)
export type AssetServiceError = InstanceType<typeof AssetServiceError>

// HTTP status mapping for the route layer (Phase 8 Step 4). Kept here so the
// service-layer error code list and HTTP codes never drift.
export const ASSET_SERVICE_ERROR_HTTP: Record<AssetServiceErrorCode, number> = {
  NOT_FOUND: 404,
  PROJECT_NOT_FOUND: 404,
  ASSET_NOT_FOUND: 404,
  INVALID_INPUT: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  BUDGET_EXCEEDED: 422,
  GENERATION_REJECTED: 422,
  ATOMIC_TOOL_FAILED: 502,
  INTERNAL: 500,
}
