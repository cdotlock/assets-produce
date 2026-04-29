import { Effect, Layer, Context } from "effect"
import { eq } from "drizzle-orm"
import { ulid } from "ulid"
import { Database } from "@/storage/db"
import { UserTable, type UserRow } from "./user.sql"
import { NamedError } from "@opencode-ai/core/util/error"
import { z } from "zod"

export const UserError = NamedError.create(
  "UserError",
  z.object({
    op: z.string(),
    message: z.string(),
  }),
)
export type UserError = InstanceType<typeof UserError>

export type Role = "admin" | "creator"

export interface CreateInput {
  username: string
  role: Role
  passwordHash?: string | null
}

export interface UpdateInput {
  username?: string
  role?: Role
  passwordHash?: string | null
}

export interface Interface {
  readonly create: (input: CreateInput) => Effect.Effect<UserRow, UserError>
  readonly get: (id: string) => Effect.Effect<UserRow | undefined, UserError>
  readonly getByUsername: (username: string) => Effect.Effect<UserRow | undefined, UserError>
  readonly list: () => Effect.Effect<UserRow[], UserError>
  readonly update: (id: string, patch: UpdateInput) => Effect.Effect<UserRow, UserError>
  readonly delete: (id: string) => Effect.Effect<void, UserError>
}

export class Service extends Context.Service<Service, Interface>()("@assets-produce/User") {}

export const layer = Layer.succeed(
  Service,
  Service.of({
    create: (input) =>
      Effect.try({
        try: () => {
          const row = Database.use((db) =>
            db
              .insert(UserTable)
              .values({
                id: `usr_${ulid()}`,
                username: input.username,
                role: input.role,
                password_hash: input.passwordHash ?? null,
              })
              .returning()
              .get(),
          )
          return row
        },
        catch: (cause) => new UserError({ op: "create", message: cause instanceof Error ? cause.message : String(cause) }),
      }),
    get: (id) =>
      Effect.try({
        try: () => Database.use((db) => db.select().from(UserTable).where(eq(UserTable.id, id)).get()),
        catch: (cause) => new UserError({ op: "get", message: cause instanceof Error ? cause.message : String(cause) }),
      }),
    getByUsername: (username) =>
      Effect.try({
        try: () => Database.use((db) => db.select().from(UserTable).where(eq(UserTable.username, username)).get()),
        catch: (cause) =>
          new UserError({ op: "getByUsername", message: cause instanceof Error ? cause.message : String(cause) }),
      }),
    list: () =>
      Effect.try({
        try: () => Database.use((db) => db.select().from(UserTable).all()),
        catch: (cause) => new UserError({ op: "list", message: cause instanceof Error ? cause.message : String(cause) }),
      }),
    update: (id, patch) =>
      Effect.try({
        try: () => {
          const values: Record<string, unknown> = {}
          if (patch.username !== undefined) values.username = patch.username
          if (patch.role !== undefined) values.role = patch.role
          if (patch.passwordHash !== undefined) values.password_hash = patch.passwordHash
          if (Object.keys(values).length === 0) {
            const existing = Database.use((db) => db.select().from(UserTable).where(eq(UserTable.id, id)).get())
            if (!existing) throw new Error(`user ${id} not found`)
            return existing
          }
          const row = Database.use((db) =>
            db.update(UserTable).set(values).where(eq(UserTable.id, id)).returning().get(),
          )
          if (!row) throw new Error(`user ${id} not found`)
          return row
        },
        catch: (cause) =>
          new UserError({ op: "update", message: cause instanceof Error ? cause.message : String(cause) }),
      }),
    delete: (id) =>
      Effect.try({
        try: () => {
          Database.use((db) => db.delete(UserTable).where(eq(UserTable.id, id)).run())
        },
        catch: (cause) =>
          new UserError({ op: "delete", message: cause instanceof Error ? cause.message : String(cause) }),
      }),
  }),
)

export const defaultLayer = layer
