import { Effect, Layer, Context } from "effect"
import { and, eq } from "drizzle-orm"
import { ulid } from "ulid"
import { Database } from "@/storage/db"
import { SkillTable, type SkillRow } from "./skill.sql"
import { NamedError } from "@opencode-ai/core/util/error"
import { z } from "zod"

export const SkillError = NamedError.create(
  "SkillError",
  z.object({
    op: z.string(),
    message: z.string(),
  }),
)
export type SkillError = InstanceType<typeof SkillError>

export type Scope = "system" | "creator"

export interface CreateInput {
  name: string
  description: string
  langfusePromptKey: string
  langfuseLabel?: string
  scope?: Scope
  enabled?: boolean
  attachments?: unknown
}

export interface UpdateInput {
  description?: string
  langfusePromptKey?: string
  langfuseLabel?: string
  scope?: Scope
  enabled?: boolean
  attachments?: unknown
}

export interface ListFilter {
  scope?: Scope
  enabledOnly?: boolean
}

export interface Interface {
  readonly create: (input: CreateInput) => Effect.Effect<SkillRow, SkillError>
  readonly get: (id: string) => Effect.Effect<SkillRow | undefined, SkillError>
  readonly getByName: (name: string) => Effect.Effect<SkillRow | undefined, SkillError>
  readonly list: (filter?: ListFilter) => Effect.Effect<SkillRow[], SkillError>
  readonly update: (id: string, patch: UpdateInput) => Effect.Effect<SkillRow, SkillError>
  readonly delete: (id: string) => Effect.Effect<void, SkillError>
}

export class Service extends Context.Service<Service, Interface>()("@assets-produce/Skill") {}

export const layer = Layer.succeed(
  Service,
  Service.of({
    create: (input) =>
      Effect.try({
        try: () =>
          Database.use((db) =>
            db
              .insert(SkillTable)
              .values({
                id: `skl_${ulid()}`,
                name: input.name,
                description: input.description,
                langfuse_prompt_key: input.langfusePromptKey,
                langfuse_label: input.langfuseLabel ?? "production",
                scope: input.scope ?? "system",
                enabled: input.enabled ?? true,
                attachments: input.attachments ?? null,
              })
              .returning()
              .get(),
          ),
        catch: (cause) =>
          new SkillError({ op: "create", message: cause instanceof Error ? cause.message : String(cause) }),
      }),
    get: (id) =>
      Effect.try({
        try: () => Database.use((db) => db.select().from(SkillTable).where(eq(SkillTable.id, id)).get()),
        catch: (cause) =>
          new SkillError({ op: "get", message: cause instanceof Error ? cause.message : String(cause) }),
      }),
    getByName: (name) =>
      Effect.try({
        try: () => Database.use((db) => db.select().from(SkillTable).where(eq(SkillTable.name, name)).get()),
        catch: (cause) =>
          new SkillError({ op: "getByName", message: cause instanceof Error ? cause.message : String(cause) }),
      }),
    list: (filter) =>
      Effect.try({
        try: () =>
          Database.use((db) => {
            const conds = []
            if (filter?.scope) conds.push(eq(SkillTable.scope, filter.scope))
            if (filter?.enabledOnly) conds.push(eq(SkillTable.enabled, true))
            const q = db.select().from(SkillTable)
            if (conds.length) return q.where(and(...conds)).all()
            return q.all()
          }),
        catch: (cause) =>
          new SkillError({ op: "list", message: cause instanceof Error ? cause.message : String(cause) }),
      }),
    update: (id, patch) =>
      Effect.try({
        try: () => {
          const values: Record<string, unknown> = {}
          if (patch.description !== undefined) values.description = patch.description
          if (patch.langfusePromptKey !== undefined) values.langfuse_prompt_key = patch.langfusePromptKey
          if (patch.langfuseLabel !== undefined) values.langfuse_label = patch.langfuseLabel
          if (patch.scope !== undefined) values.scope = patch.scope
          if (patch.enabled !== undefined) values.enabled = patch.enabled
          if (patch.attachments !== undefined) values.attachments = patch.attachments
          if (Object.keys(values).length === 0) {
            const existing = Database.use((db) => db.select().from(SkillTable).where(eq(SkillTable.id, id)).get())
            if (!existing) throw new Error(`skill ${id} not found`)
            return existing
          }
          const row = Database.use((db) =>
            db.update(SkillTable).set(values).where(eq(SkillTable.id, id)).returning().get(),
          )
          if (!row) throw new Error(`skill ${id} not found`)
          return row
        },
        catch: (cause) =>
          new SkillError({ op: "update", message: cause instanceof Error ? cause.message : String(cause) }),
      }),
    delete: (id) =>
      Effect.try({
        try: () => {
          Database.use((db) => db.delete(SkillTable).where(eq(SkillTable.id, id)).run())
        },
        catch: (cause) =>
          new SkillError({ op: "delete", message: cause instanceof Error ? cause.message : String(cause) }),
      }),
  }),
)

export const defaultLayer = layer
