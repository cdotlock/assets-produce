import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core"
import { BusinessProjectTable } from "@/business/project/project.sql"
import { AssetTable } from "@/business/asset/asset.sql"

// AssetJob — phase 8 mini agent loop tracking row. One row per
// AssetService.createJob; status moves queued → running → succeeded|failed
// (cancelled reserved for future client-issued aborts).
export const AssetJobTable = sqliteTable(
  "asset_job",
  {
    id: text().primaryKey(),
    project_id: text()
      .notNull()
      .references(() => BusinessProjectTable.id, { onDelete: "cascade" }),
    // Caller-supplied dedupe key — same value returns the same job on retry.
    // Nullable: callers that don't care about dedupe just omit it.
    client_request_id: text(),
    // Raw AssetCreateInput payload — kept as JSON so we don't have to migrate
    // the table every time the input schema gains a field.
    intent: text({ mode: "json" }).notNull(),
    status: text({ enum: ["queued", "running", "succeeded", "failed", "cancelled"] }).notNull(),
    asset_id: text().references(() => AssetTable.id, { onDelete: "set null" }),
    error_code: text(),
    error_message: text(),
    langfuse_trace_id: text(),
    time_created: integer()
      .notNull()
      .$default(() => Date.now()),
    time_updated: integer()
      .notNull()
      .$default(() => Date.now())
      .$onUpdate(() => Date.now()),
  },
  (t) => [
    index("idx_asset_job_project_status").on(t.project_id, t.status),
    // dedupe lookup: (project_id, client_request_id) — not unique because
    // client_request_id can repeat across projects and is also nullable.
    index("idx_asset_job_project_client_request_id").on(t.project_id, t.client_request_id),
    index("idx_asset_job_project_updated").on(t.project_id, t.time_updated),
  ],
)

export type AssetJobRow = typeof AssetJobTable.$inferSelect
export type AssetJobInsert = typeof AssetJobTable.$inferInsert
