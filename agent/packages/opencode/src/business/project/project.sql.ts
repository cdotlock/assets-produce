import { sqliteTable, text } from "drizzle-orm/sqlite-core"
import { Timestamps } from "@/storage/schema.sql"
import { UserTable } from "@/business/user/user.sql"

// Business Project (novel/manga/ad/preset_set/other) — distinct from
// opencode's own ProjectTable in src/project/project.sql, which represents
// an opencode workspace registration. Table name is prefixed business_ to
// avoid SQL collision.
export const BusinessProjectTable = sqliteTable("business_project", {
  id: text().primaryKey(),
  type: text({ enum: ["novel", "manga", "ad", "preset_set", "other"] }).notNull(),
  title: text().notNull(),
  description: text(),
  owner_id: text()
    .notNull()
    .references(() => UserTable.id, { onDelete: "cascade" }),
  metadata: text({ mode: "json" }),
  ...Timestamps,
})

export type BusinessProjectRow = typeof BusinessProjectTable.$inferSelect
export type BusinessProjectInsert = typeof BusinessProjectTable.$inferInsert
