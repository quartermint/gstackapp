CREATE TABLE `project_health` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_slug` text NOT NULL,
	`check_type` text NOT NULL,
	`severity` text NOT NULL,
	`detail` text NOT NULL,
	`metadata` text,
	`detected_at` text NOT NULL,
	`resolved_at` text
);
--> statement-breakpoint
CREATE INDEX `health_slug_check_idx` ON `project_health` (`project_slug`, `check_type`);--> statement-breakpoint
CREATE INDEX `health_resolved_idx` ON `project_health` (`resolved_at`);--> statement-breakpoint
CREATE INDEX `health_slug_resolved_idx` ON `project_health` (`project_slug`, `resolved_at`);--> statement-breakpoint
CREATE TABLE `project_copies` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_slug` text NOT NULL,
	`host` text NOT NULL,
	`path` text NOT NULL,
	`remote_url` text,
	`head_commit` text,
	`branch` text,
	`is_public` integer,
	`last_checked_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `copies_slug_host_uniq` ON `project_copies` (`project_slug`, `host`);--> statement-breakpoint
CREATE INDEX `copies_remote_url_idx` ON `project_copies` (`remote_url`);
