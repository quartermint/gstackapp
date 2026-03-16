CREATE TABLE `discoveries` (
	`id` text PRIMARY KEY NOT NULL,
	`path` text NOT NULL,
	`host` text NOT NULL DEFAULT 'local',
	`status` text NOT NULL DEFAULT 'found',
	`remote_url` text,
	`name` text,
	`last_commit_at` integer,
	`discovered_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `discoveries_path_host_uniq` ON `discoveries` (`path`, `host`);
--> statement-breakpoint
CREATE INDEX `discoveries_status_idx` ON `discoveries` (`status`);
--> statement-breakpoint
CREATE INDEX `discoveries_host_idx` ON `discoveries` (`host`);
--> statement-breakpoint
CREATE TABLE `stars` (
	`github_id` integer PRIMARY KEY NOT NULL,
	`full_name` text NOT NULL,
	`description` text,
	`language` text,
	`topics` text,
	`html_url` text NOT NULL,
	`intent` text,
	`ai_confidence` real,
	`user_override` integer DEFAULT false,
	`starred_at` integer NOT NULL,
	`last_synced_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `stars_github_id_uniq` ON `stars` (`github_id`);
--> statement-breakpoint
CREATE INDEX `stars_intent_idx` ON `stars` (`intent`);
--> statement-breakpoint
CREATE INDEX `stars_language_idx` ON `stars` (`language`);
--> statement-breakpoint
CREATE INDEX `stars_starred_at_idx` ON `stars` (`starred_at`);
