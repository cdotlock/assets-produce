// GET /api/v1/assets/catalog?project_id=...&since=...&limit=...

import { Hono } from "hono"
import { validator } from "hono-openapi"
import z from "zod"
import { AssetService } from "../asset-service"
import { AssetServiceError } from "../errors"
import { tokenCanAccess, type AssetAuthContext } from "./auth"
import { handle, makeError, zodMessage } from "./envelope"

const CatalogQuery = z.object({
  project_id: z.string().min(1),
  since: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
})

export function CatalogRoute(svc: AssetService) {
  return new Hono<{ Variables: { assetToken: AssetAuthContext } }>().get(
    "/catalog",
    validator("query", CatalogQuery, (result, c) => {
      if (!result.success) {
        c.status(400)
        return c.json(makeError("INVALID_INPUT", zodMessage(result.error)))
      }
    }),
    async (c) =>
      handle(c, async () => {
        const q = c.req.valid("query") as z.infer<typeof CatalogQuery>
        if (!tokenCanAccess(c.var.assetToken, q.project_id)) {
          throw new AssetServiceError({
            code: "FORBIDDEN",
            op: "GET /catalog",
            message: `token not allowed for project ${q.project_id}`,
          })
        }
        return await svc.catalogSince({
          project_id: q.project_id,
          cursor: q.since ?? null,
          limit: q.limit ?? 200,
        })
      }),
  )
}
