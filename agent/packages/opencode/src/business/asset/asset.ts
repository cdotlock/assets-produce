import { Effect, Layer, Context } from "effect"
import { and, desc, eq, sql } from "drizzle-orm"
import { ulid } from "ulid"
import { Database } from "@/storage/db"
import { AssetTable, type AssetRow } from "./asset.sql"
import { BusinessProjectTable } from "@/business/project/project.sql"
import { NamedError } from "@opencode-ai/core/util/error"
import { z } from "zod"

export const AssetError = NamedError.create(
  "AssetError",
  z.object({
    op: z.string(),
    message: z.string(),
  }),
)
export type AssetError = InstanceType<typeof AssetError>

export type AssetType = "image" | "video" | "audio" | "script" | "metadata"

export interface CreateInput {
  projectId: string
  type: AssetType
  key: string
  parentId?: string | null
  title?: string | null
  url?: string | null
  data?: unknown
  prompt?: string | null
  refUrls?: unknown
  // Phase 8 additions (nullable; older callers can omit).
  kind?: string | null
  name?: string | null
}

export interface ListOpts {
  projectId?: string
  type?: AssetType
  /** When set, filters to assets belonging to projects owned by this user id */
  ownerId?: string
  /** Default 50, max 200 */
  limit?: number
  /** Default 0 */
  offset?: number
  /** Default true — only return is_current=true rows */
  currentOnly?: boolean
}

export interface ListResult {
  rows: AssetRow[]
  total: number
}

export interface Interface {
  readonly create: (input: CreateInput) => Effect.Effect<AssetRow, AssetError>
  readonly get: (id: string) => Effect.Effect<AssetRow | undefined, AssetError>
  readonly list: (opts?: ListOpts) => Effect.Effect<ListResult, AssetError>
  readonly listByProject: (projectId: string) => Effect.Effect<AssetRow[], AssetError>
  readonly current: (projectId: string, key: string) => Effect.Effect<AssetRow | undefined, AssetError>
  readonly versions: (projectId: string, key: string) => Effect.Effect<AssetRow[], AssetError>
  readonly delete: (id: string) => Effect.Effect<void, AssetError>
}

export class Service extends Context.Service<Service, Interface>()("@assets-produce/Asset") {}

export const layer = Layer.succeed(
  Service,
  Service.of({
    create: (input) =>
      Effect.try({
        try: () =>
          // SELECT max(version) + UPDATE prior is_current + INSERT new row
          // must run atomically so two concurrent create()s for the same
          // (project_id, key) don't race. The UNIQUE index in
          // asset.sql.ts (uq_business_asset_project_key_version) is the
          // backstop, but the transaction is the primary correctness barrier.
          Database.transaction((db) => {
            const prev = db
              .select({ version: AssetTable.version })
              .from(AssetTable)
              .where(and(eq(AssetTable.project_id, input.projectId), eq(AssetTable.key, input.key)))
              .orderBy(desc(AssetTable.version))
              .limit(1)
              .get()
            const nextVersion = prev ? prev.version + 1 : 1
            if (prev) {
              db.update(AssetTable)
                .set({ is_current: false })
                .where(and(eq(AssetTable.project_id, input.projectId), eq(AssetTable.key, input.key)))
                .run()
            }
            return db
              .insert(AssetTable)
              .values({
                id: `ast_${ulid()}`,
                project_id: input.projectId,
                parent_id: input.parentId ?? null,
                type: input.type,
                kind: (input.kind ?? null) as
                  | "character_portrait"
                  | "scene_bg"
                  | "cg"
                  | "cover"
                  | "shot_image"
                  | "shot_video"
                  | "sfx"
                  | "music"
                  | null,
                key: input.key,
                title: input.title ?? null,
                name: input.name ?? null,
                url: input.url ?? null,
                data: input.data ?? null,
                prompt: input.prompt ?? null,
                ref_urls: input.refUrls ?? null,
                version: nextVersion,
                is_current: true,
              })
              .returning()
              .get()
          }),
        catch: (cause) =>
          new AssetError({ op: "create", message: cause instanceof Error ? cause.message : String(cause) }),
      }),
    get: (id) =>
      Effect.try({
        try: () => Database.use((db) => db.select().from(AssetTable).where(eq(AssetTable.id, id)).get()),
        catch: (cause) =>
          new AssetError({ op: "get", message: cause instanceof Error ? cause.message : String(cause) }),
      }),
    list: (opts) =>
      Effect.try({
        try: () => {
          const currentOnly = opts?.currentOnly ?? true
          const limit = Math.min(opts?.limit ?? 50, 200)
          const offset = opts?.offset ?? 0

          return Database.use((db) => {
            // Build WHERE conditions
            const conds: ReturnType<typeof eq>[] = []
            if (currentOnly) conds.push(eq(AssetTable.is_current, true))
            if (opts?.type) conds.push(eq(AssetTable.type, opts.type))
            if (opts?.projectId) conds.push(eq(AssetTable.project_id, opts.projectId))

            if (opts?.ownerId) {
              conds.push(eq(BusinessProjectTable.owner_id, opts.ownerId))
              const where = and(...conds)!
              const rows = db
                .select({ asset: AssetTable })
                .from(AssetTable)
                .innerJoin(BusinessProjectTable, eq(AssetTable.project_id, BusinessProjectTable.id))
                .where(where)
                .orderBy(desc(AssetTable.time_created))
                .limit(limit)
                .offset(offset)
                .all()
                .map((r) => r.asset)
              const countRow = db
                .select({ count: sql<number>`count(*)` })
                .from(AssetTable)
                .innerJoin(BusinessProjectTable, eq(AssetTable.project_id, BusinessProjectTable.id))
                .where(where)
                .get()
              return { rows, total: countRow?.count ?? 0 }
            }

            // No ownerId — simpler query without join
            const where = conds.length > 0 ? and(...conds) : undefined
            const q = db.select().from(AssetTable)
            const rows = (where ? q.where(where) : q)
              .orderBy(desc(AssetTable.time_created))
              .limit(limit)
              .offset(offset)
              .all()
            const countQ = db.select({ count: sql<number>`count(*)` }).from(AssetTable)
            const countRow = (where ? countQ.where(where) : countQ).get()
            return { rows, total: countRow?.count ?? 0 }
          })
        },
        catch: (cause) =>
          new AssetError({ op: "list", message: cause instanceof Error ? cause.message : String(cause) }),
      }),
    listByProject: (projectId) =>
      Effect.try({
        try: () => Database.use((db) => db.select().from(AssetTable).where(eq(AssetTable.project_id, projectId)).all()),
        catch: (cause) =>
          new AssetError({ op: "listByProject", message: cause instanceof Error ? cause.message : String(cause) }),
      }),
    current: (projectId, key) =>
      Effect.try({
        try: () =>
          Database.use((db) =>
            db
              .select()
              .from(AssetTable)
              .where(
                and(eq(AssetTable.project_id, projectId), eq(AssetTable.key, key), eq(AssetTable.is_current, true)),
              )
              .get(),
          ),
        catch: (cause) =>
          new AssetError({ op: "current", message: cause instanceof Error ? cause.message : String(cause) }),
      }),
    versions: (projectId, key) =>
      Effect.try({
        try: () =>
          Database.use((db) =>
            db
              .select()
              .from(AssetTable)
              .where(and(eq(AssetTable.project_id, projectId), eq(AssetTable.key, key)))
              .orderBy(desc(AssetTable.version))
              .all(),
          ),
        catch: (cause) =>
          new AssetError({ op: "versions", message: cause instanceof Error ? cause.message : String(cause) }),
      }),
    delete: (id) =>
      Effect.try({
        try: () => {
          Database.use((db) => db.delete(AssetTable).where(eq(AssetTable.id, id)).run())
        },
        catch: (cause) =>
          new AssetError({ op: "delete", message: cause instanceof Error ? cause.message : String(cause) }),
      }),
  }),
)

export const defaultLayer = layer
