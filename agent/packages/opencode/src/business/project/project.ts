import { Effect, Layer, Context } from "effect"
import { eq } from "drizzle-orm"
import { ulid } from "ulid"
import { Database } from "@/storage/db"
import { BusinessProjectTable, type BusinessProjectRow } from "./project.sql"
import { NamedError } from "@opencode-ai/core/util/error"
import { z } from "zod"

export const ProjectError = NamedError.create(
  "ProjectError",
  z.object({
    op: z.string(),
    message: z.string(),
  }),
)
export type ProjectError = InstanceType<typeof ProjectError>

export type ProjectType = "novel" | "manga" | "ad" | "preset_set" | "other"

export interface CreateInput {
  type: ProjectType
  title: string
  ownerId: string
  description?: string | null
  metadata?: unknown
}

export interface UpdateInput {
  title?: string
  description?: string | null
  metadata?: unknown
}

export interface Interface {
  readonly create: (input: CreateInput) => Effect.Effect<BusinessProjectRow, ProjectError>
  readonly get: (id: string) => Effect.Effect<BusinessProjectRow | undefined, ProjectError>
  readonly list: (opts?: { ownerId?: string }) => Effect.Effect<BusinessProjectRow[], ProjectError>
  readonly update: (id: string, patch: UpdateInput) => Effect.Effect<BusinessProjectRow, ProjectError>
  readonly delete: (id: string) => Effect.Effect<void, ProjectError>
}

export class Service extends Context.Service<Service, Interface>()("@assets-produce/Project") {}

export const layer = Layer.succeed(
  Service,
  Service.of({
    create: (input) =>
      Effect.try({
        try: () =>
          Database.use((db) =>
            db
              .insert(BusinessProjectTable)
              .values({
                id: `prj_${ulid()}`,
                type: input.type,
                title: input.title,
                description: input.description ?? null,
                owner_id: input.ownerId,
                metadata: input.metadata ?? null,
              })
              .returning()
              .get(),
          ),
        catch: (cause) =>
          new ProjectError({ op: "create", message: cause instanceof Error ? cause.message : String(cause) }),
      }),
    get: (id) =>
      Effect.try({
        try: () =>
          Database.use((db) => db.select().from(BusinessProjectTable).where(eq(BusinessProjectTable.id, id)).get()),
        catch: (cause) =>
          new ProjectError({ op: "get", message: cause instanceof Error ? cause.message : String(cause) }),
      }),
    list: (opts) =>
      Effect.try({
        try: () =>
          Database.use((db) => {
            const q = db.select().from(BusinessProjectTable)
            if (opts?.ownerId) return q.where(eq(BusinessProjectTable.owner_id, opts.ownerId)).all()
            return q.all()
          }),
        catch: (cause) =>
          new ProjectError({ op: "list", message: cause instanceof Error ? cause.message : String(cause) }),
      }),
    update: (id, patch) =>
      Effect.try({
        try: () => {
          const values: Record<string, unknown> = {}
          if (patch.title !== undefined) values.title = patch.title
          if (patch.description !== undefined) values.description = patch.description
          if (patch.metadata !== undefined) values.metadata = patch.metadata
          if (Object.keys(values).length === 0) {
            const existing = Database.use((db) =>
              db.select().from(BusinessProjectTable).where(eq(BusinessProjectTable.id, id)).get(),
            )
            if (!existing) throw new Error(`project ${id} not found`)
            return existing
          }
          const row = Database.use((db) =>
            db.update(BusinessProjectTable).set(values).where(eq(BusinessProjectTable.id, id)).returning().get(),
          )
          if (!row) throw new Error(`project ${id} not found`)
          return row
        },
        catch: (cause) =>
          new ProjectError({ op: "update", message: cause instanceof Error ? cause.message : String(cause) }),
      }),
    delete: (id) =>
      Effect.try({
        try: () => {
          Database.use((db) => db.delete(BusinessProjectTable).where(eq(BusinessProjectTable.id, id)).run())
        },
        catch: (cause) =>
          new ProjectError({ op: "delete", message: cause instanceof Error ? cause.message : String(cause) }),
      }),
  }),
)

export const defaultLayer = layer
