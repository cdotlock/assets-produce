// Public types for the Phase 8 Asset Service. Shapes mirror the REST envelopes
// in docs/superpowers/specs/2026-05-14-three-repo-asset-integration-design.md
// § 4; the REST/MCP layer marshals to/from these.

// ---------- Common enums ----------

export type AssetJobStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled"

export type AssetKind =
  | "character_portrait"
  | "scene_bg"
  | "cg"
  | "cover"
  | "shot_image"
  | "shot_video"
  | "sfx"
  | "music"

export type AssetRefKind = "image" | "video"

// ---------- Inputs ----------

export interface AssetRef {
  kind: AssetRefKind
  url: string
  // Free-form label so callers can mark e.g. "style" vs "character" reference
  // for the picker / LLM to disambiguate.
  tag?: string
}

export interface AssetConstraints {
  // e.g. "9:16", "1:1"
  ratio?: string | null
  duration_sec?: number | null
  // e.g. "blurred", "transparent", null — relevant for some kinds only.
  background_kind?: string | null
  [extra: string]: unknown
}

export interface AssetIntent {
  kind: AssetKind
  // Caller-supplied stable key; uniqueness scoped to (project_id, key, version).
  key: string
  // Free-form markdown describing the desired asset (style, subject, scene).
  spec_md: string
  refs?: AssetRef[]
  constraints?: AssetConstraints
  // Caller may pre-fill a lookup `name` if they already track one. Skills can
  // also synthesize one in skill body. Final value is stored on Asset.name.
  name?: string | null
}

export interface AssetPreferences {
  // Non-binding hints. AssetService may override based on skill / LLM.
  atomic_tool_hint?: string
  skill_hint?: string
}

export interface AssetCreateInput {
  project_id: string
  asset_intent: AssetIntent
  preferences?: AssetPreferences
  // Caller-supplied dedupe key (idempotent retries return the same job).
  client_request_id?: string
  // Reserved for future push notifications; not used in Phase 8.
  callback_url?: string | null
}

// ---------- Outputs ----------

export interface AssetJobMeta {
  atomic_tool?: string | null
  skill_used?: string | null
  langfuse_trace_id?: string | null
}

export interface AssetJobResult {
  asset_id: string
  key: string
  version: number
  kind: AssetKind | null
  url: string | null
  ref_urls: unknown
  meta: AssetJobMeta
}

export interface AssetJobError {
  code: string
  message: string
}

export interface AssetJobView {
  job_id: string
  status: AssetJobStatus
  // Stable identifiers the caller can poll for / lookup. `key` and `version`
  // are echoed so callers can correlate without a separate Asset fetch.
  key?: string
  version?: number
  result?: AssetJobResult
  error?: AssetJobError
}

// ---------- Lookup ----------

export interface AssetLookupQuery {
  // Exactly one of key / name is required at the API layer; type stays loose
  // here so callers can pass either shape without TS gymnastics.
  key?: string
  version?: number
  name?: string
}

export interface AssetSummary {
  asset_id: string
  key: string
  version: number
  url: string | null
  kind: AssetKind | null
  name: string | null
}

export type AssetLookupMatchReason = "exact_key" | "key_version" | "name_exact" | "name_substring" | "no_match"

export interface AssetLookupResult {
  query: AssetLookupQuery
  asset: AssetSummary | null
  match_reason: AssetLookupMatchReason
}

// ---------- Catalog ----------

export interface CatalogItem {
  asset_id: string
  project_id: string
  key: string
  version: number
  url: string | null
  kind: AssetKind | null
  name: string | null
  // Epoch ms; HTTP layer renders ISO-8601 if it wants to.
  updated_at: number
}

export interface CatalogPage {
  items: CatalogItem[]
  // Opaque cursor for "give me the next page"; null when has_more=false.
  next_cursor: string | null
  has_more: boolean
}

// ---------- AssetJob row → view projection input ----------
// Internal — the repo returns the raw row + (optional) joined Asset, the
// service layer projects it to AssetJobView.

// `as const` produces a literal-typed tuple (rather than `readonly AssetKind[]`),
// which z.enum() accepts directly so HTTP route schemas don't need a widening cast.
export const ASSET_KINDS = [
  "character_portrait",
  "scene_bg",
  "cg",
  "cover",
  "shot_image",
  "shot_video",
  "sfx",
  "music",
] as const satisfies readonly AssetKind[]

export const ASSET_JOB_STATUSES: readonly AssetJobStatus[] = [
  "queued",
  "running",
  "succeeded",
  "failed",
  "cancelled",
]
