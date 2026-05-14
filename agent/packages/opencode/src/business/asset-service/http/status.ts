// GET /api/v1/assets/jobs/:job_id — view current state of a job.
//
// 403 if the caller's token can't access the job's project; we still load the
// row first because that's the only way to know which project to authorize
// against. The 403 is leaked-info-safe (the caller already has the job_id).

import { Hono } from "hono"
import { validator } from "hono-openapi"
import z from "zod"
import { AssetService } from "../asset-service"
import { tokenCanAccess, type AssetAuthContext } from "./auth"
import { handle, makeError, zodMessage } from "./envelope"
import { AssetServiceError } from "../errors"
import { AssetJobRepo } from "../asset-job.repo"

const JobIdParam = z.object({ job_id: z.string().min(1) })

export function StatusRoute(svc: AssetService) {
  return new Hono<{ Variables: { assetToken: AssetAuthContext } }>().get(
    "/jobs/:job_id",
    validator("param", JobIdParam, (result, c) => {
      if (!result.success) {
        c.status(400)
        return c.json(makeError("INVALID_INPUT", zodMessage(result.error)))
      }
    }),
    async (c) =>
      handle(c, async () => {
        const { job_id } = c.req.valid("param") as z.infer<typeof JobIdParam>
        // Cheap project lookup against the repo so we can 403 without
        // surfacing the raw job state when the caller is unauthorized.
        const row = AssetJobRepo.fromDatabase().findById(job_id)
        if (!row) {
          throw new AssetServiceError({
            code: "NOT_FOUND",
            op: "GET /jobs/:id",
            message: `job ${job_id} not found`,
          })
        }
        if (!tokenCanAccess(c.var.assetToken, row.project_id)) {
          throw new AssetServiceError({
            code: "FORBIDDEN",
            op: "GET /jobs/:id",
            message: `token not allowed for project ${row.project_id}`,
          })
        }
        return await svc.getJob(job_id)
      }),
  )
}
