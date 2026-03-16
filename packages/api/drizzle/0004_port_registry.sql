CREATE TABLE `machines` (
	`id` text PRIMARY KEY NOT NULL,
	`hostname` text NOT NULL,
	`tailnet_ip` text,
	`os` text,
	`arch` text,
	`last_seen_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `machines_hostname_unique` ON `machines` (`hostname`);--> statement-breakpoint
CREATE INDEX `machines_hostname_idx` ON `machines` (`hostname`);--> statement-breakpoint
CREATE TABLE `port_allocations` (
	`id` text PRIMARY KEY NOT NULL,
	`port` integer NOT NULL,
	`protocol` text NOT NULL DEFAULT 'tcp',
	`machine_id` text NOT NULL,
	`service_name` text NOT NULL,
	`project_slug` text,
	`status` text NOT NULL DEFAULT 'active',
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `port_alloc_port_machine_proto_uniq` ON `port_allocations` (`port`, `machine_id`, `protocol`);--> statement-breakpoint
CREATE INDEX `port_alloc_machine_id_idx` ON `port_allocations` (`machine_id`);--> statement-breakpoint
CREATE INDEX `port_alloc_project_slug_idx` ON `port_allocations` (`project_slug`);--> statement-breakpoint
CREATE INDEX `port_alloc_status_idx` ON `port_allocations` (`status`);--> statement-breakpoint
CREATE TABLE `port_scans` (
	`id` text PRIMARY KEY NOT NULL,
	`machine_id` text NOT NULL,
	`port` integer NOT NULL,
	`protocol` text NOT NULL DEFAULT 'tcp',
	`process_name` text,
	`pid` integer,
	`scan_timestamp` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `port_scans_machine_id_idx` ON `port_scans` (`machine_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `port_scans_machine_port_proto_uniq` ON `port_scans` (`machine_id`, `port`, `protocol`);--> statement-breakpoint
CREATE TABLE `port_ranges` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`start_port` integer NOT NULL,
	`end_port` integer NOT NULL,
	`description` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `port_ranges_name_unique` ON `port_ranges` (`name`);
