CREATE TABLE `business_session_token` (
	`id` text PRIMARY KEY,
	`user_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`revoked` integer DEFAULT false NOT NULL,
	`time_created` integer NOT NULL,
	`time_updated` integer NOT NULL,
	CONSTRAINT `fk_business_session_token_user_id_business_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `business_user`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX `idx_session_token_user` ON `business_session_token` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_session_token_expires` ON `business_session_token` (`expires_at`);