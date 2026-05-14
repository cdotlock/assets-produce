// POST /api/v1/assets/lookup — batch lookup by key or name within a project.

import { Hono } from "hono"
import { validator } from "hono-openapi"
import z from "zod"
import { AssetService } from "../asset-service"
import { AssetServiceError } from "../errors"
import { tokenCanAccess, type AssetAuthContext } from "./auth"
import { handle, makeError, zodMessage } from "./envelope"

const LookupQuery = z
  .object({
    key: z.string().optional(),
    version: z.number().int().positive().optional(),
    name: z.string().optional(),
  })
  // Caller must supply at least one of `key` / `name`; empty `{}` queries
  // would silently return `no_match` and the caller's batch slot would be
  // wasted — fail fast at the boundary instead.
  .refine((q) => Boolean(q.key) || Boolean(q.name), {
    message: "each query needs at least one of `key` or `name`",
  })

const LookupBody = z.object({
  project_id: z.string().min(1),
  queries: z.array(LookupQuery).min(1),
})

export function LookupRoute(svc: AssetService) {
  return new Hono<{ Variables: { assetToken: AssetAuthContext } }>().post(
    "/lookup",
    validator("json", LookupBody, (result, c) => {
      if (!result.success) {
        c.status(400)
        return c.json(makeError("INVALID_INPUT", zodMessage(result.error)))
      }
    }),
    async (c) =>
      handle(c, async () => {
        const body = c.req.valid("json") as z.infer<typeof LookupBody>
        if (!tokenCanAccess(c.var.assetToken, body.project_id)) {
          throw new AssetServiceError({
            code: "FORBIDDEN",
            op: "POST /lookup",
            message: `token not allowed for project ${body.project_id}`,
          })
        }
        const results = await svc.lookup(body.project_id, body.queries)
        return { results }
      }),
  )
}
