CREATE TABLE `asset_job` (
	`id` text PRIMARY KEY,
	`project_id` text NOT NULL,
	`client_request_id` text,
	`intent` text NOT NULL,
	`status` text NOT NULL,
	`asset_id` text,
	`error_code` text,
	`error_message` text,
	`langfuse_trace_id` text,
	`time_created` integer NOT NULL,
	`time_updated` integer NOT NULL,
	CONSTRAINT `fk_asset_job_project_id_business_project_id_fk` FOREIGN KEY (`project_id`) REFERENCES `business_project`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_asset_job_asset_id_business_asset_id_fk` FOREIGN KEY (`asset_id`) REFERENCES `business_asset`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
ALTER TABLE `business_asset` ADD `kind` text;--> statement-breakpoint
ALTER TABLE `business_asset` ADD `name` text;--> statement-breakpoint
-- time_updated needs a default for ALTER TABLE on already-populated tables;
-- backfill existing rows to their time_created so the catalog cursor stays
-- sane. New rows get Date.now() from the drizzle runtime $default.
ALTER TABLE `business_asset` ADD `time_updated` integer NOT NULL DEFAULT 0;--> statement-breakpoint
UPDATE `business_asset` SET `time_updated` = `time_created`;--> statement-breakpoint
CREATE INDEX `idx_asset_job_project_status` ON `asset_job` (`project_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_asset_job_project_client_request_id` ON `asset_job` (`project_id`,`client_request_id`);--> statement-breakpoint
CREATE INDEX `idx_asset_job_project_updated` ON `asset_job` (`project_id`,`time_updated`);--> statement-breakpoint
CREATE INDEX `idx_business_asset_project_name` ON `business_asset` (`project_id`,`name`) WHERE "business_asset"."name" is not null;--> statement-breakpoint
CREATE INDEX `idx_business_asset_project_updated` ON `business_asset` (`project_id`,`time_updated`);