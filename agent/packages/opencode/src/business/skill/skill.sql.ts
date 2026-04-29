import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core"
import { Timestamps } from "@/storage/schema.sql"

export const SkillTable = sqliteTable("business_skill", {
  id: text().primaryKey(),
  name: text().notNull().unique(),
  description: text().notNull(),
  langfuse_prompt_key: text().notNull(),
  langfuse_label: text().notNull().default("production"),
  scope: text({ enum: ["system", "creator"] })
    .notNull()
    .default("system"),
  enabled: integer({ mode: "boolean" }).notNull().default(true),
  attachments: text({ mode: "json" }),
  ...Timestamps,
})

export type SkillRow = typeof SkillTable.$inferSelect
export type SkillInsert = typeof SkillTable.$inferInsert
