CREATE TABLE `business_asset` (
	`id` text PRIMARY KEY,
	`project_id` text NOT NULL,
	`parent_id` text,
	`type` text NOT NULL,
	`key` text NOT NULL,
	`title` text,
	`url` text,
	`data` text,
	`prompt` text,
	`ref_urls` text,
	`version` integer DEFAULT 1 NOT NULL,
	`is_current` integer DEFAULT true NOT NULL,
	`time_created` integer NOT NULL,
	CONSTRAINT `fk_business_asset_project_id_business_project_id_fk` FOREIGN KEY (`project_id`) REFERENCES `business_project`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_business_asset_parent_id_business_asset_id_fk` FOREIGN KEY (`parent_id`) REFERENCES `business_asset`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE TABLE `business_project` (
	`id` text PRIMARY KEY,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`owner_id` text NOT NULL,
	`metadata` text,
	`time_created` integer NOT NULL,
	`time_updated` integer NOT NULL,
	CONSTRAINT `fk_business_project_owner_id_business_user_id_fk` FOREIGN KEY (`owner_id`) REFERENCES `business_user`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `business_skill` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL UNIQUE,
	`description` text NOT NULL,
	`langfuse_prompt_key` text NOT NULL,
	`langfuse_label` text DEFAULT 'production' NOT NULL,
	`scope` text DEFAULT 'system' NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`attachments` text,
	`time_created` integer NOT NULL,
	`time_updated` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `business_style_preset` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`data` text NOT NULL,
	`owner_id` text,
	`time_created` integer NOT NULL,
	`time_updated` integer NOT NULL,
	CONSTRAINT `fk_business_style_preset_owner_id_business_user_id_fk` FOREIGN KEY (`owner_id`) REFERENCES `business_user`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE TABLE `business_task` (
	`id` text PRIMARY KEY,
	`type` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`project_id` text,
	`parent_task_id` text,
	`input` text,
	`output` text,
	`error` text,
	`progress` real,
	`started_at` integer,
	`completed_at` integer,
	`time_created` integer NOT NULL,
	`time_updated` integer NOT NULL,
	CONSTRAINT `fk_business_task_project_id_business_project_id_fk` FOREIGN KEY (`project_id`) REFERENCES `business_project`(`id`) ON DELETE SET NULL,
	CONSTRAINT `fk_business_task_parent_task_id_business_task_id_fk` FOREIGN KEY (`parent_task_id`) REFERENCES `business_task`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE TABLE `business_user` (
	`id` text PRIMARY KEY,
	`username` text NOT NULL UNIQUE,
	`password_hash` text,
	`role` text NOT NULL,
	`time_created` integer NOT NULL,
	`time_updated` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_business_asset_project_key_version` ON `business_asset` (`project_id`,`key`,`version`);--> statement-breakpoint
CREATE INDEX `idx_business_asset_project_key_current` ON `business_asset` (`project_id`,`key`) WHERE "business_asset"."is_current" = 1;--> statement-breakpoint
CREATE INDEX `idx_business_style_preset_type` ON `business_style_preset` (`type`);--> statement-breakpoint
CREATE INDEX `idx_business_style_preset_owner` ON `business_style_preset` (`owner_id`);--> statement-breakpoint
CREATE INDEX `idx_business_task_status` ON `business_task` (`status`);--> statement-breakpoint
CREATE INDEX `idx_business_task_project_created` ON `business_task` (`project_id`,`time_created`);