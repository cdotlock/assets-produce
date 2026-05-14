// POST /api/v1/assets/create
//
// Synchronous fast-return per design § 4.1 — writes an AssetJob (status=queued),
// schedules the mini agent loop with queueMicrotask, returns the queued view.

import { Hono } from "hono"
import { validator } from "hono-openapi"
import z from "zod"
import { AssetService } from "../asset-service"
import { AssetServiceError } from "../errors"
import { ASSET_KINDS } from "../types"
import { tokenCanAccess, type AssetAuthContext } from "./auth"
import { handle, makeError, zodMessage } from "./envelope"

export const AssetCreateBody = z.object({
  project_id: z.string().min(1),
  asset_intent: z.object({
    kind: z.enum(ASSET_KINDS as unknown as [string, ...string[]]),
    key: z.string().min(1),
    spec_md: z.string(),
    refs: z
      .array(
        z.object({
          kind: z.enum(["image", "video"]),
          url: z.string(),
          tag: z.string().optional(),
        }),
      )
      .optional(),
    constraints: z.record(z.string(), z.unknown()).optional(),
    name: z.string().nullable().optional(),
  }),
  preferences: z
    .object({
      atomic_tool_hint: z.string().optional(),
      skill_hint: z.string().optional(),
    })
    .optional(),
  client_request_id: z.string().optional(),
  callback_url: z.string().nullable().optional(),
})

export type AssetCreateBody = z.infer<typeof AssetCreateBody>

export function CreateRoute(svc: AssetService) {
  return new Hono<{ Variables: { assetToken: AssetAuthContext } }>().post(
    "/create",
    validator("json", AssetCreateBody, (result, c) => {
      if (!result.success) {
        c.status(400)
        return c.json(makeError("INVALID_INPUT", zodMessage(result.error)))
      }
    }),
    async (c) =>
      handle(c, async () => {
        const body = c.req.valid("json") as AssetCreateBody
        if (!tokenCanAccess(c.var.assetToken, body.project_id)) {
          throw new AssetServiceError({
            code: "FORBIDDEN",
            op: "POST /create",
            message: `token not allowed for project ${body.project_id}`,
          })
        }
        // z.enum widens to `string` in our schema (we have to feed it the
        // const array via the constructed-tuple cast). Re-cast to AssetIntent
        // before handing to the service which wants the literal-union form.
        const view = await svc.createJob({
          project_id: body.project_id,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          asset_intent: body.asset_intent as any,
          preferences: body.preferences,
          client_request_id: body.client_request_id,
          callback_url: body.callback_url ?? null,
        })
        // Fire-and-forget worker — caller polls via /jobs/:id. setTimeout(0)
        // (not queueMicrotask) so the HTTP response actually flushes before
        // the worker starts; otherwise tests / clients that poll immediately
        // see succeeded on the very first /jobs/:id read instead of queued.
        setTimeout(() => {
          void svc.runJob(view.job_id).catch(() => {})
        }, 0)
        return view
      }),
  )
}
