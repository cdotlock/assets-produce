import { Hono } from "hono"
import { describeRoute, validator, resolver } from "hono-openapi"
import z from "zod"
import { Effect, Layer } from "effect"
import { lazy } from "@/util/lazy"
import { errors } from "../../error"
import { jsonRequest, runRequest } from "./trace"
import { Service as AssetService, defaultLayer as assetLayer } from "@/business/asset/asset"
import { Service as ProjectService, defaultLayer as projectLayer } from "@/business/project/project"
import { requireAuth } from "@/server/guards"

const AssetTypeEnum = z.enum(["image", "video", "audio", "script", "metadata"])

const AssetInfo = z.object({
  id: z.string(),
  project_id: z.string(),
  parent_id: z.string().nullable(),
  type: AssetTypeEnum,
  key: z.string(),
  title: z.string().nullable(),
  url: z.string().nullable(),
  data: z.unknown().nullable(),
  prompt: z.string().nullable(),
  ref_urls: z.unknown().nullable(),
  version: z.number(),
  is_current: z.boolean(),
  time_created: z.number(),
})

const ListQuery = z.object({
  project_id: z.string().optional(),
  type: AssetTypeEnum.optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
})

const ListResponse = z.object({
  assets: AssetInfo.array(),
  total: z.number(),
})

const assetsLayer = Layer.mergeAll(assetLayer, projectLayer)

export const AssetRoutes = lazy(() =>
  new Hono()
    .get(
      "/",
      requireAuth,
      describeRoute({
        summary: "List assets owned by the authenticated user",
        operationId: "asset.list",
        responses: {
          200: { description: "Assets", content: { "application/json": { schema: resolver(ListResponse) } } },
          401: { description: "Unauthorized" },
        },
      }),
      validator("query", ListQuery),
      async (c) =>
        jsonRequest("AssetRoutes.list", c, function* () {
          const user = c.var.user!
          const query = c.req.valid("query")
          const result = yield* Effect.gen(function* () {
            const assets = yield* AssetService
            return yield* assets.list({
              ownerId: user.sub,
              projectId: query.project_id,
              type: query.type,
              limit: query.limit,
              offset: query.offset,
            })
          }).pipe(Effect.provide(assetsLayer))
          return { assets: result.rows, total: result.total }
        }),
    )
    .get(
      "/:id",
      requireAuth,
      describeRoute({
        summary: "Get an asset by ID (404 if not owned by authenticated user)",
        operationId: "asset.get",
        responses: {
          200: { description: "Asset", content: { "application/json": { schema: resolver(AssetInfo) } } },
          ...errors(401, 404),
        },
      }),
      validator("param", z.object({ id: z.string() })),
      async (c) => {
        const { id } = c.req.valid("param")
        const user = c.var.user!
        const result = await runRequest(
          "AssetRoutes.get",
          c,
          Effect.gen(function* () {
            const assets = yield* AssetService
            const projects = yield* ProjectService
            const row = yield* assets.get(id)
            if (!row) return undefined
            const project = yield* projects.get(row.project_id)
            if (!project || project.owner_id !== user.sub) return undefined
            return row
          }).pipe(Effect.provide(assetsLayer)),
        )
        if (result === undefined) {
          c.status(404)
          return c.json({ error: "asset not found" })
        }
        return c.json(result)
      },
    ),
)
