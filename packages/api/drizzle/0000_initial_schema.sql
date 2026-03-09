CREATE TABLE `captures` (
	`id` text PRIMARY KEY NOT NULL,
	`raw_content` text NOT NULL,
	`type` text DEFAULT 'text' NOT NULL,
	`status` text DEFAULT 'raw' NOT NULL,
	`project_id` text,
	`user_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `captures_project_id_idx` ON `captures` (`project_id`);--> statement-breakpoint
CREATE INDEX `captures_status_idx` ON `captures` (`status`);--> statement-breakpoint
CREATE INDEX `captures_user_id_idx` ON `captures` (`user_id`);--> statement-breakpoint
CREATE TABLE `projects` (
	`slug` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`tagline` text,
	`path` text NOT NULL,
	`host` text DEFAULT 'local' NOT NULL,
	`last_scanned_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `projects_host_idx` ON `projects` (`host`);