import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core"
import { Timestamps } from "@/storage/schema.sql"
import { UserTable } from "@/business/user/user.sql"

export const SessionTokenTable = sqliteTable(
  "business_session_token",
  {
    id: text().primaryKey(),
    user_id: text()
      .notNull()
      .references(() => UserTable.id, { onDelete: "cascade" }),
    token_hash: text().notNull(),
    expires_at: integer().notNull(),
    revoked: integer({ mode: "boolean" }).notNull().default(false),
    ...Timestamps,
  },
  (t) => [
    index("idx_session_token_user").on(t.user_id),
    index("idx_session_token_expires").on(t.expires_at),
  ],
)

export type SessionTokenRow = typeof SessionTokenTable.$inferSelect
export type SessionTokenInsert = typeof SessionTokenTable.$inferInsert
