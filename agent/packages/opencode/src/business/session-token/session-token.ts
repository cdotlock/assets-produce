import { Effect, Layer, Context } from "effect"
import { and, eq } from "drizzle-orm"
import { ulid } from "ulid"
import { Database, Client } from "@/storage/db"
import { SessionTokenTable, type SessionTokenRow } from "./session-token.sql"
import { NamedError } from "@opencode-ai/core/util/error"
import { z } from "zod"

export const SessionTokenError = NamedError.create(
  "SessionTokenError",
  z.object({ op: z.string(), message: z.string() }),
)
export type SessionTokenError = InstanceType<typeof SessionTokenError>

export interface CreateInput {
  userId: string
  tokenHash: string
  expiresAt: number
}

export interface Interface {
  readonly create: (input: CreateInput) => Effect.Effect<SessionTokenRow, SessionTokenError>
  readonly get: (id: string) => Effect.Effect<SessionTokenRow | undefined, SessionTokenError>
  readonly listByUser: (userId: string) => Effect.Effect<SessionTokenRow[], SessionTokenError>
  readonly revoke: (id: string) => Effect.Effect<void, SessionTokenError>
  readonly revokeAllForUser: (userId: string) => Effect.Effect<void, SessionTokenError>
  readonly purgeExpired: () => Effect.Effect<number, SessionTokenError>
}

export class Service extends Context.Service<Service, Interface>()("@assets-produce/SessionToken") {}

export const layer = Layer.succeed(
  Service,
  Service.of({
    create: (input) =>
      Effect.try({
        try: () =>
          Database.use((db) =>
            db
              .insert(SessionTokenTable)
              .values({
                id: `tok_${ulid()}`,
                user_id: input.userId,
                token_hash: input.tokenHash,
                expires_at: input.expiresAt,
                revoked: false,
              })
              .returning()
              .get(),
          ),
        catch: (cause) =>
          new SessionTokenError({ op: "create", message: cause instanceof Error ? cause.message : String(cause) }),
      }),
    get: (id) =>
      Effect.try({
        try: () =>
          Database.use((db) => db.select().from(SessionTokenTable).where(eq(SessionTokenTable.id, id)).get()),
        catch: (cause) =>
          new SessionTokenError({ op: "get", message: cause instanceof Error ? cause.message : String(cause) }),
      }),
    listByUser: (userId) =>
      Effect.try({
        try: () =>
          Database.use((db) =>
            db.select().from(SessionTokenTable).where(eq(SessionTokenTable.user_id, userId)).all(),
          ),
        catch: (cause) =>
          new SessionTokenError({ op: "listByUser", message: cause instanceof Error ? cause.message : String(cause) }),
      }),
    revoke: (id) =>
      Effect.try({
        try: () => {
          Database.use((db) =>
            db.update(SessionTokenTable).set({ revoked: true }).where(eq(SessionTokenTable.id, id)).run(),
          )
        },
        catch: (cause) =>
          new SessionTokenError({ op: "revoke", message: cause instanceof Error ? cause.message : String(cause) }),
      }),
    revokeAllForUser: (userId) =>
      Effect.try({
        try: () => {
          Database.use((db) =>
            db
              .update(SessionTokenTable)
              .set({ revoked: true })
              .where(and(eq(SessionTokenTable.user_id, userId), eq(SessionTokenTable.revoked, false)))
              .run(),
          )
        },
        catch: (cause) =>
          new SessionTokenError({
            op: "revokeAllForUser",
            message: cause instanceof Error ? cause.message : String(cause),
          }),
      }),
    purgeExpired: () =>
      Effect.try({
        try: () =>
          Client()
            .$client.query<null, [number]>("DELETE FROM business_session_token WHERE expires_at < ?")
            .run(Date.now()).changes,
        catch: (cause) =>
          new SessionTokenError({
            op: "purgeExpired",
            message: cause instanceof Error ? cause.message : String(cause),
          }),
      }),
  }),
)

export const defaultLayer = layer
