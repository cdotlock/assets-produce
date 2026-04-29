import { Effect, Layer, Context } from "effect"
import { eq } from "drizzle-orm"
import { ulid } from "ulid"
import { Database } from "@/storage/db"
import { TaskTable, type TaskRow } from "./task.sql"
import { NamedError } from "@opencode-ai/core/util/error"
import { z } from "zod"

export const TaskError = NamedError.create(
  "TaskError",
  z.object({
    op: z.string(),
    message: z.string(),
  }),
)
export type TaskError = InstanceType<typeof TaskError>

export type Status = "pending" | "running" | "succeeded" | "failed" | "canceled"

export interface CreateInput {
  type: string
  projectId?: string | null
  parentTaskId?: string | null
  input?: unknown
}

export interface UpdateInput {
  status?: Status
  output?: unknown
  error?: string | null
  progress?: number | null
  startedAt?: number | null
  completedAt?: number | null
}

export interface Interface {
  readonly create: (input: CreateInput) => Effect.Effect<TaskRow, TaskError>
  readonly get: (id: string) => Effect.Effect<TaskRow | undefined, TaskError>
  readonly listByProject: (projectId: string) => Effect.Effect<TaskRow[], TaskError>
  readonly listByStatus: (status: Status) => Effect.Effect<TaskRow[], TaskError>
  readonly update: (id: string, patch: UpdateInput) => Effect.Effect<TaskRow, TaskError>
  readonly delete: (id: string) => Effect.Effect<void, TaskError>
}

export class Service extends Context.Service<Service, Interface>()("@assets-produce/Task") {}

export const layer = Layer.succeed(
  Service,
  Service.of({
    create: (input) =>
      Effect.try({
        try: () =>
          Database.use((db) =>
            db
              .insert(TaskTable)
              .values({
                id: `tsk_${ulid()}`,
                type: input.type,
                status: "pending",
                project_id: input.projectId ?? null,
                parent_task_id: input.parentTaskId ?? null,
                input: input.input ?? null,
              })
              .returning()
              .get(),
          ),
        catch: (cause) =>
          new TaskError({ op: "create", message: cause instanceof Error ? cause.message : String(cause) }),
      }),
    get: (id) =>
      Effect.try({
        try: () => Database.use((db) => db.select().from(TaskTable).where(eq(TaskTable.id, id)).get()),
        catch: (cause) =>
          new TaskError({ op: "get", message: cause instanceof Error ? cause.message : String(cause) }),
      }),
    listByProject: (projectId) =>
      Effect.try({
        try: () =>
          Database.use((db) => db.select().from(TaskTable).where(eq(TaskTable.project_id, projectId)).all()),
        catch: (cause) =>
          new TaskError({ op: "listByProject", message: cause instanceof Error ? cause.message : String(cause) }),
      }),
    listByStatus: (status) =>
      Effect.try({
        try: () => Database.use((db) => db.select().from(TaskTable).where(eq(TaskTable.status, status)).all()),
        catch: (cause) =>
          new TaskError({ op: "listByStatus", message: cause instanceof Error ? cause.message : String(cause) }),
      }),
    update: (id, patch) =>
      Effect.try({
        try: () => {
          const values: Record<string, unknown> = {}
          if (patch.status !== undefined) values.status = patch.status
          if (patch.output !== undefined) values.output = patch.output
          if (patch.error !== undefined) values.error = patch.error
          if (patch.progress !== undefined) values.progress = patch.progress
          if (patch.startedAt !== undefined) values.started_at = patch.startedAt
          if (patch.completedAt !== undefined) values.completed_at = patch.completedAt
          const row = Database.use((db) =>
            db.update(TaskTable).set(values).where(eq(TaskTable.id, id)).returning().get(),
          )
          if (!row) throw new Error(`task ${id} not found`)
          return row
        },
        catch: (cause) =>
          new TaskError({ op: "update", message: cause instanceof Error ? cause.message : String(cause) }),
      }),
    delete: (id) =>
      Effect.try({
        try: () => {
          Database.use((db) => db.delete(TaskTable).where(eq(TaskTable.id, id)).run())
        },
        catch: (cause) =>
          new TaskError({ op: "delete", message: cause instanceof Error ? cause.message : String(cause) }),
      }),
  }),
)

export const defaultLayer = layer
