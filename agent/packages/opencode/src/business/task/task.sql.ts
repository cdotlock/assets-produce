import { sqliteTable, text, integer, real, index, type AnySQLiteColumn } from "drizzle-orm/sqlite-core"
import { Timestamps } from "@/storage/schema.sql"
import { BusinessProjectTable } from "@/business/project/project.sql"

export const TaskTable = sqliteTable(
  "business_task",
  {
    id: text().primaryKey(),
    type: text().notNull(),
    status: text({ enum: ["pending", "running", "succeeded", "failed", "canceled"] })
      .notNull()
      .default("pending"),
    project_id: text().references(() => BusinessProjectTable.id, { onDelete: "set null" }),
    parent_task_id: text().references((): AnySQLiteColumn => TaskTable.id, { onDelete: "set null" }),
    input: text({ mode: "json" }),
    output: text({ mode: "json" }),
    error: text(),
    progress: real(),
    started_at: integer(),
    completed_at: integer(),
    ...Timestamps,
  },
  (t) => [
    index("idx_business_task_status").on(t.status),
    index("idx_business_task_project_created").on(t.project_id, t.time_created),
  ],
)

export type TaskRow = typeof TaskTable.$inferSelect
export type TaskInsert = typeof TaskTable.$inferInsert
