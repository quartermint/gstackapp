CREATE TABLE `few_shot_examples` (
	`id` text PRIMARY KEY NOT NULL,
	`capture_content` text NOT NULL,
	`project_slug` text NOT NULL,
	`extraction_type` text NOT NULL DEFAULT 'project_ref',
	`is_correction` integer DEFAULT false,
	`source_capture_id` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `few_shot_project_slug_idx` ON `few_shot_examples` (`project_slug`);
--> statement-breakpoint
CREATE INDEX `few_shot_extraction_type_idx` ON `few_shot_examples` (`extraction_type`);
--> statement-breakpoint
CREATE TABLE `capture_extractions` (
	`id` text PRIMARY KEY NOT NULL,
	`capture_id` text NOT NULL,
	`extraction_type` text NOT NULL,
	`content` text NOT NULL,
	`confidence` real NOT NULL DEFAULT 0,
	`grounding_json` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `extractions_capture_id_idx` ON `capture_extractions` (`capture_id`);
--> statement-breakpoint
CREATE INDEX `extractions_type_idx` ON `capture_extractions` (`extraction_type`);
--> statement-breakpoint
ALTER TABLE `captures` ADD COLUMN `source_type` text NOT NULL DEFAULT 'manual';
--> statement-breakpoint
CREATE TABLE `correction_stats` (
	`id` text PRIMARY KEY NOT NULL,
	`predicted_slug` text NOT NULL,
	`actual_slug` text NOT NULL,
	`correction_count` integer NOT NULL DEFAULT 1,
	`last_corrected_at` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `correction_pair_uniq` ON `correction_stats` (`predicted_slug`, `actual_slug`);
