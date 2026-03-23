CREATE TABLE `insights` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`metadata` text,
	`project_slug` text,
	`content_hash` text NOT NULL,
	`dismissed_at` integer,
	`snoozed_until` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `insights_type_idx` ON `insights` (`type`);
--> statement-breakpoint
CREATE INDEX `insights_dismissed_idx` ON `insights` (`dismissed_at`);
--> statement-breakpoint
CREATE INDEX `insights_project_slug_idx` ON `insights` (`project_slug`);
--> statement-breakpoint
CREATE UNIQUE INDEX `insights_content_hash_uniq` ON `insights` (`content_hash`);
