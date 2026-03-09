CREATE TABLE `commits` (
	`id` text PRIMARY KEY NOT NULL,
	`hash` text NOT NULL,
	`message` text NOT NULL,
	`project_slug` text NOT NULL,
	`author_date` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `commits_project_hash_uniq` ON `commits` (`project_slug`, `hash`);--> statement-breakpoint
CREATE INDEX `commits_project_slug_idx` ON `commits` (`project_slug`);--> statement-breakpoint
DROP TRIGGER IF EXISTS captures_ai;--> statement-breakpoint
DROP TRIGGER IF EXISTS captures_ad;--> statement-breakpoint
DROP TRIGGER IF EXISTS captures_au;--> statement-breakpoint
DROP TRIGGER IF EXISTS projects_ai;--> statement-breakpoint
DROP TRIGGER IF EXISTS projects_ad;--> statement-breakpoint
DROP TRIGGER IF EXISTS projects_au;--> statement-breakpoint
DROP TABLE IF EXISTS captures_fts;--> statement-breakpoint
DROP TABLE IF EXISTS project_metadata_fts;--> statement-breakpoint
CREATE VIRTUAL TABLE search_index USING fts5(
  content,
  source_type UNINDEXED,
  source_id UNINDEXED,
  project_slug UNINDEXED,
  created_at UNINDEXED
);--> statement-breakpoint
INSERT INTO search_index(content, source_type, source_id, project_slug, created_at)
  SELECT raw_content, 'capture', id, project_id, created_at FROM captures;--> statement-breakpoint
INSERT INTO search_index(content, source_type, source_id, project_slug, created_at)
  SELECT name || ' ' || COALESCE(tagline, ''), 'project', slug, slug, created_at FROM projects;
