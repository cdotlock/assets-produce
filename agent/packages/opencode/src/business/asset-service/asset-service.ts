// AssetService — top-level entry for the Phase 8 Asset Service surface.
//
// Composes: AssetJobRepo (job state), Catalog (read-side lookup / since),
// runAssetGeneration (mini agent loop driver), and an injectable
// AssetGenerator + AssetWriter pair. HTTP and MCP layers consume this class
// directly so they share one source of truth for ids, error codes, and
// view shapes.

import { and, desc, eq } from "drizzle-orm"
import { ulid } from "ulid"
import { Database } from "@/storage/db"
import { AssetTable, type AssetRow } from "@/business/asset/asset.sql"
import { AssetJobRepo } from "./asset-job.repo"
import { Catalog, type CatalogSinceInput } from "./catalog"
import { AssetServiceError } from "./errors"
import {
  runAssetGeneration,
  type AssetGenerator,
  type AssetWriter,
  DEFAULT_MAX_STEPS,
} from "./run-asset-generation"
import type { SkillPicker } from "./intent-to-skill"
import type { AssetJobRow } from "./asset-job.sql"
import type { Tracer } from "./tracer"
import type {
  AssetCreateInput,
  AssetJobResult,
  AssetJobView,
  AssetKind,
  AssetLookupQuery,
  AssetLookupResult,
  CatalogPage,
} from "./types"

export interface AssetServiceOptions {
  generator: AssetGenerator
  writer: AssetWriter
  jobRepo?: AssetJobRepo
  catalog?: Catalog
  skillPicker?: SkillPicker
  maxSteps?: number
  // Optional Langfuse-shaped tracer; runAssetGeneration defaults to a
  // no-op when this is omitted.
  tracer?: Tracer
}

// SQLite UNIQUE-constraint detector for the (project_id, client_request_id)
// partial unique index. bun:sqlite / node:sqlite both surface this as an
// Error whose message contains "UNIQUE constraint failed". Matching by
// message is the only stable hook we have — sqlite's extended result code
// is not exposed through drizzle.
function isUniqueViolation(err: unknown): boolean {
  if (err instanceof Error) {
    return /UNIQUE constraint failed/i.test(err.message)
  }
  return false
}

export class AssetService {
  private readonly generator: AssetGenerator
  private readonly writer: AssetWriter
  private readonly jobRepo: AssetJobRepo
  private readonly catalog: Catalog
  private readonly skillPicker?: SkillPicker
  private readonly maxSteps: number
  private readonly tracer?: Tracer

  constructor(opts: AssetServiceOptions) {
    this.generator = opts.generator
    this.writer = opts.writer
    this.jobRepo = opts.jobRepo ?? AssetJobRepo.fromDatabase()
    this.catalog = opts.catalog ?? Catalog.fromDatabase()
    this.skillPicker = opts.skillPicker
    this.maxSteps = opts.maxSteps ?? DEFAULT_MAX_STEPS
    this.tracer = opts.tracer
  }

  // ---------- createJob ----------
  async createJob(input: AssetCreateInput): Promise<AssetJobView> {
    // Dedupe path: same (project_id, client_request_id) → return the
    // existing job's view, do NOT re-create. This matches the
    // idempotency contract in design doc § 4.1.
    if (input.client_request_id) {
      const existing = this.jobRepo.findByClientRequestId(input.project_id, input.client_request_id)
      if (existing) return this.viewFor(existing)
    }

    const id = `asset_job_${ulid()}`
    // Persist the FULL intent + preferences blob so runAssetGeneration can
    // recover everything from the row alone (db is the source of truth).
    const persistedIntent = {
      ...input.asset_intent,
      __preferences: input.preferences ?? null,
    }
    let row: AssetJobRow
    try {
      row = this.jobRepo.create({
        id,
        project_id: input.project_id,
        intent: persistedIntent,
        client_request_id: input.client_request_id ?? null,
      })
    } catch (err) {
      // Concurrent create won the (project_id, client_request_id) race —
      // the partial unique index trips, and we recover by re-fetching the
      // winner's row. Any other failure surfaces as-is.
      if (input.client_request_id && isUniqueViolation(err)) {
        const winner = this.jobRepo.findByClientRequestId(input.project_id, input.client_request_id)
        if (winner) return this.viewFor(winner)
      }
      throw err
    }
    return this.viewFor(row, {
      key: input.asset_intent.key,
      version: this.nextVersionHint(input.project_id, input.asset_intent.key),
    })
  }

  // ---------- getJob ----------
  async getJob(job_id: string): Promise<AssetJobView> {
    const row = this.jobRepo.findById(job_id)
    if (!row) {
      throw new AssetServiceError({
        code: "NOT_FOUND",
        op: "AssetService.getJob",
        message: `AssetJob ${job_id} not found`,
      })
    }
    return this.viewFor(row)
  }

  // ---------- runJob (worker entry; HTTP layer fires-and-forgets) ----------
  async runJob(job_id: string): Promise<AssetJobView> {
    const row = await runAssetGeneration(
      { job_id },
      {
        jobRepo: this.jobRepo,
        generator: this.generator,
        writer: this.writer,
        skillPicker: this.skillPicker,
        maxSteps: this.maxSteps,
        tracer: this.tracer,
      },
    )
    return this.viewFor(row)
  }

  // ---------- lookup / catalogSince (read-side; just forward) ----------
  async lookup(project_id: string, queries: AssetLookupQuery[]): Promise<AssetLookupResult[]> {
    return this.catalog.lookup(project_id, queries)
  }

  async catalogSince(input: CatalogSinceInput): Promise<CatalogPage> {
    return this.catalog.since(input)
  }

  // ---------- internals ----------

  // Projection from AssetJob row → AssetJobView. When the job is succeeded
  // and has an asset_id, joins the Asset row to fill result.{url, kind,
  // version, key, ref_urls}.
  private viewFor(
    row: AssetJobRow,
    hints?: { key?: string; version?: number },
  ): AssetJobView {
    const intent = (row.intent ?? {}) as { key?: string; kind?: AssetKind; __preferences?: unknown }
    const baseKey = hints?.key ?? intent.key
    const baseVersion = hints?.version

    if (row.status === "succeeded" && row.asset_id) {
      const asset = this.fetchAsset(row.asset_id)
      const result: AssetJobResult | undefined = asset
        ? {
            asset_id: asset.id,
            key: asset.key,
            version: asset.version,
            kind: (asset.kind as AssetKind | null) ?? null,
            url: asset.url ?? null,
            ref_urls: asset.ref_urls,
            meta: {
              atomic_tool: null,
              skill_used: null,
              langfuse_trace_id: row.langfuse_trace_id,
            },
          }
        : undefined
      return {
        job_id: row.id,
        status: row.status,
        key: baseKey ?? asset?.key,
        version: asset?.version ?? baseVersion,
        result,
      }
    }

    if (row.status === "failed") {
      return {
        job_id: row.id,
        status: row.status,
        key: baseKey,
        version: baseVersion,
        error: {
          code: row.error_code ?? "INTERNAL",
          message: row.error_message ?? "unspecified failure",
        },
      }
    }

    // queued / running / cancelled
    return {
      job_id: row.id,
      status: row.status,
      key: baseKey,
      version: baseVersion,
    }
  }

  private fetchAsset(asset_id: string): AssetRow | undefined {
    return Database.use((db) => db.select().from(AssetTable).where(eq(AssetTable.id, asset_id)).get())
  }

  // Best-effort next-version hint for createJob's response. Looks up the
  // current max version for (project_id, key); +1 if exists, else 1. Not
  // a guarantee — if two creates race, both may publish a "1" hint and the
  // second job will actually settle at v2 once the loop writes.
  private nextVersionHint(project_id: string, key: string): number {
    const row = Database.use((db) =>
      db
        .select({ version: AssetTable.version })
        .from(AssetTable)
        .where(and(eq(AssetTable.project_id, project_id), eq(AssetTable.key, key)))
        .orderBy(desc(AssetTable.version))
        .limit(1)
        .get(),
    )
    return row ? row.version + 1 : 1
  }
}
