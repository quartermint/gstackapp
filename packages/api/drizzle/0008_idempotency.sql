CREATE TABLE `idempotency_keys` (
	`key` text PRIMARY KEY NOT NULL,
	`capture_id` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idempotency_created_at_idx` ON `idempotency_keys` (`created_at`);
