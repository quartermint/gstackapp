CREATE TABLE `project_knowledge` (
	`project_slug` text PRIMARY KEY NOT NULL,
	`content` text NOT NULL,
	`content_hash` text NOT NULL,
	`file_size` integer NOT NULL,
	`last_modified` text NOT NULL,
	`commits_since_update` integer NOT NULL DEFAULT 0,
	`last_scanned_at` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `knowledge_last_modified_idx` ON `project_knowledge` (`last_modified`);
