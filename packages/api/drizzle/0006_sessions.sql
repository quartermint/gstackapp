CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`source` text NOT NULL,
	`model` text,
	`tier` text NOT NULL,
	`project_slug` text,
	`cwd` text NOT NULL,
	`status` text NOT NULL DEFAULT 'active',
	`files_json` text,
	`task_description` text,
	`stop_reason` text,
	`started_at` integer NOT NULL,
	`last_heartbeat_at` integer,
	`ended_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `sessions_status_idx` ON `sessions` (`status`);
--> statement-breakpoint
CREATE INDEX `sessions_project_slug_idx` ON `sessions` (`project_slug`);
--> statement-breakpoint
CREATE INDEX `sessions_started_at_idx` ON `sessions` (`started_at`);
--> statement-breakpoint
CREATE INDEX `sessions_tier_idx` ON `sessions` (`tier`);
