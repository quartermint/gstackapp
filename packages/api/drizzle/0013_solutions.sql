CREATE TABLE `solutions` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text,
	`project_slug` text,
	`title` text NOT NULL,
	`content` text NOT NULL,
	`content_hash` text NOT NULL,
	`module` text,
	`problem_type` text,
	`symptoms` text,
	`root_cause` text,
	`tags_json` text,
	`severity` text DEFAULT 'medium',
	`status` text NOT NULL DEFAULT 'candidate',
	`reference_count` integer NOT NULL DEFAULT 0,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`reviewed_at` integer
);
--> statement-breakpoint
CREATE INDEX `solutions_project_slug_idx` ON `solutions` (`project_slug`);
--> statement-breakpoint
CREATE INDEX `solutions_status_idx` ON `solutions` (`status`);
--> statement-breakpoint
CREATE INDEX `solutions_problem_type_idx` ON `solutions` (`problem_type`);
--> statement-breakpoint
CREATE INDEX `solutions_session_id_idx` ON `solutions` (`session_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `solutions_content_hash_uniq` ON `solutions` (`content_hash`);
--> statement-breakpoint
CREATE TABLE `solution_references` (
	`id` text PRIMARY KEY NOT NULL,
	`solution_id` text NOT NULL,
	`session_id` text NOT NULL,
	`reference_type` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `sol_ref_solution_id_idx` ON `solution_references` (`solution_id`);
--> statement-breakpoint
CREATE INDEX `sol_ref_session_id_idx` ON `solution_references` (`session_id`);
