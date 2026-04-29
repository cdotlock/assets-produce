import { sqliteTable, text, index } from "drizzle-orm/sqlite-core"
import { Timestamps } from "@/storage/schema.sql"
import { UserTable } from "@/business/user/user.sql"

export const StylePresetTable = sqliteTable(
  "business_style_preset",
  {
    id: text().primaryKey(),
    name: text().notNull(),
    type: text({ enum: ["character", "scene", "overall"] }).notNull(),
    data: text({ mode: "json" }).notNull(),
    owner_id: text().references(() => UserTable.id, { onDelete: "set null" }),
    ...Timestamps,
  },
  (t) => [index("idx_business_style_preset_type").on(t.type), index("idx_business_style_preset_owner").on(t.owner_id)],
)

export type StylePresetRow = typeof StylePresetTable.$inferSelect
export type StylePresetInsert = typeof StylePresetTable.$inferInsert
