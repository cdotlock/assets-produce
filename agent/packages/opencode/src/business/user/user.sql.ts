import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core"
import { Timestamps } from "@/storage/schema.sql"

export const UserTable = sqliteTable("business_user", {
  id: text().primaryKey(),
  username: text().notNull().unique(),
  password_hash: text(),
  role: text({ enum: ["admin", "creator"] }).notNull(),
  ...Timestamps,
})

export type UserRow = typeof UserTable.$inferSelect
export type UserInsert = typeof UserTable.$inferInsert
