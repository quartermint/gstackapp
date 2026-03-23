-- Embeddings metadata table (maps content_hash to integer rowid for vec_search)
CREATE TABLE IF NOT EXISTS `embeddings` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`content_hash` text UNIQUE NOT NULL,
	`source_type` text NOT NULL,
	`source_id` text NOT NULL,
	`model` text NOT NULL,
	`dimensions` integer NOT NULL,
	`created_at` text NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `embeddings_source_idx` ON `embeddings` (`source_type`, `source_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `embeddings_hash_idx` ON `embeddings` (`content_hash`);
