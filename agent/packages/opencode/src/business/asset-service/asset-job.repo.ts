// Thin drizzle-backed repository for AssetJob rows. Stateless: every method
// resolves the current database via Database.use(), so callers don't have to
// thread connections around. Callable from inside Database.transaction(...)
// without re-wiring — the transaction's tx is what Database.use yields.

import { and, eq } from "drizzle-orm"
import { Database } from "@/storage/db"
import { AssetJobTable, type AssetJobRow } from "./asset-job.sql"
import type { AssetJobStatus } from "./types"

export interface CreateJobInput {
  id: string
  project_id: string
  intent: unknown
  client_request_id?: string | null
}

export interface UpdateStatusInput {
  status: AssetJobStatus
  asset_id?: string | null
  error_code?: string | null
  error_message?: string | null
  langfuse_trace_id?: string | null
}

export class AssetJobRepo {
  // No state — instance methods just give consumers a discoverable surface
  // and parallel the asset-service's other repo-ish classes.
  static fromDatabase(): AssetJobRepo {
    return new AssetJobRepo()
  }

  create(input: CreateJobInput): AssetJobRow {
    return Database.use((db) =>
      db
        .insert(AssetJobTable)
        .values({
          id: input.id,
          project_id: input.project_id,
          // drizzle's text({mode:"json"}) handles JSON encoding for us.
          intent: input.intent as unknown,
          status: "queued",
          client_request_id: input.client_request_id ?? null,
        })
        .returning()
        .get(),
    )
  }

  findById(id: string): AssetJobRow | null {
    return (
      Database.use((db) => db.select().from(AssetJobTable).where(eq(AssetJobTable.id, id)).get()) ?? null
    )
  }

  findByClientRequestId(project_id: string, client_request_id: string): AssetJobRow | null {
    // Empty string explicitly returns null — we treat "" as "no dedupe key".
    if (!client_request_id) return null
    return (
      Database.use((db) =>
        db
          .select()
          .from(AssetJobTable)
          .where(
            and(
              eq(AssetJobTable.project_id, project_id),
              eq(AssetJobTable.client_request_id, client_request_id),
            ),
          )
          .get(),
      ) ?? null
    )
  }

  updateStatus(id: string, fields: UpdateStatusInput): AssetJobRow | null {
    return Database.use((db) => {
      const row = db
        .update(AssetJobTable)
        .set({
          status: fields.status,
          // Only overwrite the columns the caller explicitly passed; falsy
          // (undefined) means "leave as-is".
          ...(fields.asset_id !== undefined ? { asset_id: fields.asset_id } : {}),
          ...(fields.error_code !== undefined ? { error_code: fields.error_code } : {}),
          ...(fields.error_message !== undefined ? { error_message: fields.error_message } : {}),
          ...(fields.langfuse_trace_id !== undefined ? { langfuse_trace_id: fields.langfuse_trace_id } : {}),
        })
        .where(eq(AssetJobTable.id, id))
        .returning()
        .get()
      return row ?? null
    })
  }
}
