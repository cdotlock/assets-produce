import { Effect, Layer, Context } from "effect"
import { eq, isNull, or } from "drizzle-orm"
import { ulid } from "ulid"
import { Database } from "@/storage/db"
import { StylePresetTable, type StylePresetRow } from "./style-preset.sql"
import { NamedError } from "@opencode-ai/core/util/error"
import { z } from "zod"

export const StylePresetError = NamedError.create(
  "StylePresetError",
  z.object({
    op: z.string(),
    message: z.string(),
  }),
)
export type StylePresetError = InstanceType<typeof StylePresetError>

export type PresetType = "character" | "scene" | "overall"

export interface CreateInput {
  name: string
  type: PresetType
  data: unknown
  ownerId?: string | null
}

export interface UpdateInput {
  name?: string
  data?: unknown
}

export interface Interface {
  readonly create: (input: CreateInput) => Effect.Effect<StylePresetRow, StylePresetError>
  readonly get: (id: string) => Effect.Effect<StylePresetRow | undefined, StylePresetError>
  readonly list: (opts?: { ownerId?: string | null; type?: PresetType }) => Effect.Effect<StylePresetRow[], StylePresetError>
  readonly update: (id: string, patch: UpdateInput) => Effect.Effect<StylePresetRow, StylePresetError>
  readonly delete: (id: string) => Effect.Effect<void, StylePresetError>
}

export class Service extends Context.Service<Service, Interface>()("@assets-produce/StylePreset") {}

export const layer = Layer.succeed(
  Service,
  Service.of({
    create: (input) =>
      Effect.try({
        try: () =>
          Database.use((db) =>
            db
              .insert(StylePresetTable)
              .values({
                id: `sty_${ulid()}`,
                name: input.name,
                type: input.type,
                data: input.data,
                owner_id: input.ownerId ?? null,
              })
              .returning()
              .get(),
          ),
        catch: (cause) =>
          new StylePresetError({
            op: "create",
            message: cause instanceof Error ? cause.message : String(cause),
          }),
      }),
    get: (id) =>
      Effect.try({
        try: () =>
          Database.use((db) => db.select().from(StylePresetTable).where(eq(StylePresetTable.id, id)).get()),
        catch: (cause) =>
          new StylePresetError({ op: "get", message: cause instanceof Error ? cause.message : String(cause) }),
      }),
    list: (opts) =>
      Effect.try({
        try: () =>
          Database.use((db) => {
            const q = db.select().from(StylePresetTable)
            if (opts?.ownerId !== undefined) {
              return q
                .where(
                  opts.ownerId === null
                    ? isNull(StylePresetTable.owner_id)
                    : or(isNull(StylePresetTable.owner_id), eq(StylePresetTable.owner_id, opts.ownerId)),
                )
                .all()
            }
            if (opts?.type) return q.where(eq(StylePresetTable.type, opts.type)).all()
            return q.all()
          }),
        catch: (cause) =>
          new StylePresetError({ op: "list", message: cause instanceof Error ? cause.message : String(cause) }),
      }),
    update: (id, patch) =>
      Effect.try({
        try: () => {
          const values: Record<string, unknown> = {}
          if (patch.name !== undefined) values.name = patch.name
          if (patch.data !== undefined) values.data = patch.data
          const row = Database.use((db) =>
            db.update(StylePresetTable).set(values).where(eq(StylePresetTable.id, id)).returning().get(),
          )
          if (!row) throw new Error(`style preset ${id} not found`)
          return row
        },
        catch: (cause) =>
          new StylePresetError({
            op: "update",
            message: cause instanceof Error ? cause.message : String(cause),
          }),
      }),
    delete: (id) =>
      Effect.try({
        try: () => {
          Database.use((db) => db.delete(StylePresetTable).where(eq(StylePresetTable.id, id)).run())
        },
        catch: (cause) =>
          new StylePresetError({
            op: "delete",
            message: cause instanceof Error ? cause.message : String(cause),
          }),
      }),
  }),
)

export const defaultLayer = layer
