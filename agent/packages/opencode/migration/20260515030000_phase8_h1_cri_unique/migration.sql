-- Phase 8 H1 fix: enforce idempotency at the database layer.
--
-- The Phase 8 schema added a non-unique index on (project_id, client_request_id)
-- — fast for lookups, but powerless against the TOCTOU race in
-- AssetService.createJob: two concurrent requests with the same dedupe key
-- both pass the existence check and both insert.
--
-- Replace the non-unique index with a partial unique index. The WHERE clause
-- keeps the constraint scoped to rows the caller actually wants deduped —
-- multiple NULL client_request_id rows in the same project are still allowed
-- (callers that don't supply a dedupe key are explicitly opting out).
DROP INDEX IF EXISTS `idx_asset_job_project_client_request_id`;--> statement-breakpoint
CREATE UNIQUE INDEX `uq_asset_job_project_client_request_id` ON `asset_job` (`project_id`, `client_request_id`) WHERE `client_request_id` IS NOT NULL;
