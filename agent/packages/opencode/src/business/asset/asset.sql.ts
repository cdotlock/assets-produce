import { sqliteTable, text, integer, index, uniqueIndex, type AnySQLiteColumn } from "drizzle-orm/sqlite-core"
import { sql } from "drizzle-orm"
import { BusinessProjectTable } from "@/business/project/project.sql"

export const AssetTable = sqliteTable(
  "business_asset",
  {
    id: text().primaryKey(),
    project_id: text()
      .notNull()
      .references(() => BusinessProjectTable.id, { onDelete: "cascade" }),
    parent_id: text().references((): AnySQLiteColumn => AssetTable.id, { onDelete: "set null" }),
    type: text({ enum: ["image", "video", "audio", "script", "metadata"] }).notNull(),
    key: text().notNull(),
    title: text(),
    url: text(),
    data: text({ mode: "json" }),
    prompt: text(),
    ref_urls: text({ mode: "json" }),
    version: integer().notNull().default(1),
    is_current: integer({ mode: "boolean" }).notNull().default(true),
    time_created: integer()
      .notNull()
      .$default(() => Date.now()),
  },
  (t) => [
    uniqueIndex("uq_business_asset_project_key_version").on(t.project_id, t.key, t.version),
    index("idx_business_asset_project_key_current")
      .on(t.project_id, t.key)
      .where(sql`${t.is_current} = 1`),
  ],
)

export type AssetRow = typeof AssetTable.$inferSelect
export type AssetInsert = typeof AssetTable.$inferInsert
