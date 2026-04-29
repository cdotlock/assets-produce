import { Effect, Layer, Context } from "effect"
import { and, desc, eq } from "drizzle-orm"
import { ulid } from "ulid"
import { Database } from "@/storage/db"
import { AssetTable, type AssetRow } from "./asset.sql"
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
}

export interface Interface {
  readonly create: (input: CreateInput) => Effect.Effect<AssetRow, AssetError>
  readonly get: (id: string) => Effect.Effect<AssetRow | undefined, AssetError>
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
                key: input.key,
                title: input.title ?? null,
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
