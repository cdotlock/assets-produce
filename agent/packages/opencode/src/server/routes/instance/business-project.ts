import { Hono } from "hono"
import { describeRoute, resolver } from "hono-openapi"
import z from "zod"
import { Effect } from "effect"
import { lazy } from "@/util/lazy"
import { jsonRequest } from "./trace"
import { Service as ProjectService, defaultLayer as projectLayer } from "@/business/project/project"
import { requireAuth } from "@/server/guards"

const ProjectInfo = z.object({
  id: z.string(),
  type: z.enum(["novel", "manga", "ad", "preset_set", "other"]),
  title: z.string(),
  description: z.string().nullable(),
  owner_id: z.string(),
  metadata: z.unknown().nullable(),
  time_created: z.number(),
  time_updated: z.number(),
})

const ListResponse = z.object({ projects: ProjectInfo.array() })

export const BusinessProjectRoutes = lazy(() =>
  new Hono().get(
    "/",
    requireAuth,
    describeRoute({
      summary: "List business projects owned by the authenticated user",
      operationId: "business_project.list",
      responses: {
        200: { description: "Projects", content: { "application/json": { schema: resolver(ListResponse) } } },
        401: { description: "Unauthorized" },
      },
    }),
    async (c) =>
      jsonRequest("BusinessProjectRoutes.list", c, function* () {
        const user = c.var.user!
        const rows = yield* Effect.gen(function* () {
          const projects = yield* ProjectService
          return yield* projects.list({ ownerId: user.sub })
        }).pipe(Effect.provide(projectLayer))
        return { projects: rows }
      }),
  ),
)
