CREATE TABLE `intelligence_cache` (
	`id` text PRIMARY KEY NOT NULL,
	`project_slug` text,
	`generation_type` text NOT NULL,
	`input_hash` text NOT NULL,
	`content` text NOT NULL,
	`model_id` text,
	`generated_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cache_slug_type_uniq` ON `intelligence_cache` (`project_slug`,`generation_type`);
--> statement-breakpoint
CREATE INDEX `cache_expires_at_idx` ON `intelligence_cache` (`expires_at`);
--> statement-breakpoint
CREATE INDEX `cache_generation_type_idx` ON `intelligence_cache` (`generation_type`);
