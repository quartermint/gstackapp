CREATE TABLE `client_visits` (
	`client_id` text PRIMARY KEY NOT NULL,
	`last_visit_at` text NOT NULL,
	`previous_visit_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
