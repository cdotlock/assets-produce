// Catalog — lookup + catalog-since over the Asset table. Stateless mirror of
// AssetJobRepo (resolves the current DB via Database.use). The lookup logic
// here is the only place where the "key or name, version optional, substring
// fallback" semantics live; the HTTP / MCP layers just forward queries.

import { and, asc, eq, gt, isNotNull, like, or, sql } from "drizzle-orm"
import { Database } from "@/storage/db"
import { AssetTable, type AssetRow } from "@/business/asset/asset.sql"
import type {
  AssetKind,
  AssetLookupMatchReason,
  AssetLookupQuery,
  AssetLookupResult,
  AssetSummary,
  CatalogItem,
  CatalogPage,
} from "./types"

const DEFAULT_LIMIT = 200
const MAX_LIMIT = 500

export interface CatalogSinceInput {
  project_id: string
  cursor: string | null
  limit: number
}

export interface CursorPayload {
  time_updated: number
  id: string
}

function rowToSummary(row: AssetRow): AssetSummary {
  return {
    asset_id: row.id,
    key: row.key,
    version: row.version,
    url: row.url ?? null,
    // The DB column is typed `text` with the enum union; cast keeps the public
    // type tight without an unsafe `as`.
    kind: (row.kind as AssetKind | null) ?? null,
    name: row.name ?? null,
  }
}

function rowToCatalogItem(row: AssetRow): CatalogItem {
  return {
    asset_id: row.id,
    project_id: row.project_id,
    key: row.key,
    version: row.version,
    url: row.url ?? null,
    kind: (row.kind as AssetKind | null) ?? null,
    name: row.name ?? null,
    updated_at: row.time_updated,
  }
}

// SQL LIKE escape — % and _ are wildcards, \ is the escape character.
// `name` is user-controlled in the design so we must not let a bare `_` or
// `%` blow up a substring match.
function escapeLike(input: string): string {
  return input.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_")
}

export class Catalog {
  static fromDatabase(): Catalog {
    return new Catalog()
  }

  // ---------- cursor encoding ----------

  // Format: `${time_updated_ms}/${asset_id}`. We base64-url-encode so the
  // string is safe to embed in URLs / query strings without escaping.
  static encodeCursor(payload: CursorPayload): string {
    return Buffer.from(`${payload.time_updated}/${payload.id}`, "utf8").toString("base64url")
  }

  static decodeCursor(cursor: string): CursorPayload | null {
    if (!cursor) return null
    try {
      const raw = Buffer.from(cursor, "base64url").toString("utf8")
      const slash = raw.indexOf("/")
      if (slash <= 0) return null
      const time_updated = Number(raw.slice(0, slash))
      const id = raw.slice(slash + 1)
      if (!Number.isFinite(time_updated) || !id) return null
      return { time_updated, id }
    } catch {
      return null
    }
  }

  // ---------- lookup ----------

  lookup(project_id: string, queries: AssetLookupQuery[]): AssetLookupResult[] {
    return Database.use((db) => queries.map((q) => this.resolveOne(db, project_id, q)))
  }

  private resolveOne(
    db: Parameters<Parameters<typeof Database.use<unknown>>[0]>[0],
    project_id: string,
    query: AssetLookupQuery,
  ): AssetLookupResult {
    // Helper to wrap a single drizzle SELECT into the shared envelope.
    const finish = (row: AssetRow | undefined, reason: AssetLookupMatchReason): AssetLookupResult =>
      row
        ? { query, asset: rowToSummary(row), match_reason: reason }
        : { query, asset: null, match_reason: "no_match" }

    if (query.key) {
      if (typeof query.version === "number") {
        const row = db
          .select()
          .from(AssetTable)
          .where(
            and(
              eq(AssetTable.project_id, project_id),
              eq(AssetTable.key, query.key),
              eq(AssetTable.version, query.version),
            ),
          )
          .get()
        return finish(row, "key_version")
      }
      const row = db
        .select()
        .from(AssetTable)
        .where(
          and(
            eq(AssetTable.project_id, project_id),
            eq(AssetTable.key, query.key),
            eq(AssetTable.is_current, true),
          ),
        )
        .get()
      return finish(row, "exact_key")
    }

    if (query.name) {
      // Exact name first — only consider current rows so we don't surface
      // stale supersedeed versions.
      const exact = db
        .select()
        .from(AssetTable)
        .where(
          and(
            eq(AssetTable.project_id, project_id),
            isNotNull(AssetTable.name),
            eq(AssetTable.name, query.name),
            eq(AssetTable.is_current, true),
          ),
        )
        .get()
      if (exact) return finish(exact, "name_exact")

      // Substring fallback (case-sensitive — good enough for Phase 8;
      // collation tweaks live in a future migration).
      const sub = db
        .select()
        .from(AssetTable)
        .where(
          and(
            eq(AssetTable.project_id, project_id),
            isNotNull(AssetTable.name),
            like(AssetTable.name, `%${escapeLike(query.name)}%`),
            eq(AssetTable.is_current, true),
          ),
        )
        .get()
      return finish(sub, "name_substring")
    }

    return { query, asset: null, match_reason: "no_match" }
  }

  // ---------- catalog.since ----------

  since(input: CatalogSinceInput): CatalogPage {
    const limit = input.limit && input.limit > 0 ? Math.min(input.limit, MAX_LIMIT) : DEFAULT_LIMIT
    const parsed = input.cursor ? Catalog.decodeCursor(input.cursor) : null

    // Fetch limit+1 to detect has_more without a separate COUNT.
    const fetchLimit = limit + 1

    const rows = Database.use((db) => {
      // Filter strategy:
      // 1) project + is_current
      // 2) if cursor decoded: time_updated > cursor.time_updated
      //    OR (time_updated == cursor.time_updated AND id > cursor.id)
      const where = parsed
        ? and(
            eq(AssetTable.project_id, input.project_id),
            eq(AssetTable.is_current, true),
            or(
              gt(AssetTable.time_updated, parsed.time_updated),
              and(eq(AssetTable.time_updated, parsed.time_updated), gt(AssetTable.id, parsed.id)),
            ),
          )
        : and(eq(AssetTable.project_id, input.project_id), eq(AssetTable.is_current, true))
      return db
        .select()
        .from(AssetTable)
        .where(where)
        .orderBy(asc(AssetTable.time_updated), asc(AssetTable.id))
        .limit(fetchLimit)
        .all()
    })

    const has_more = rows.length > limit
    const page = has_more ? rows.slice(0, limit) : rows
    const items = page.map(rowToCatalogItem)
    const next_cursor = has_more
      ? Catalog.encodeCursor({ time_updated: page[page.length - 1]!.time_updated, id: page[page.length - 1]!.id })
      : null

    return { items, has_more, next_cursor }
  }
}

// Re-export for ergonomic destructuring in service code.
export const _internal = { escapeLike, rowToSummary, rowToCatalogItem, sql }
