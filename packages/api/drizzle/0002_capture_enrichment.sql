ALTER TABLE captures ADD COLUMN ai_confidence REAL;--> statement-breakpoint
ALTER TABLE captures ADD COLUMN ai_project_slug TEXT;--> statement-breakpoint
ALTER TABLE captures ADD COLUMN ai_reasoning TEXT;--> statement-breakpoint
ALTER TABLE captures ADD COLUMN link_url TEXT;--> statement-breakpoint
ALTER TABLE captures ADD COLUMN link_title TEXT;--> statement-breakpoint
ALTER TABLE captures ADD COLUMN link_description TEXT;--> statement-breakpoint
ALTER TABLE captures ADD COLUMN link_domain TEXT;--> statement-breakpoint
ALTER TABLE captures ADD COLUMN link_image TEXT;--> statement-breakpoint
ALTER TABLE captures ADD COLUMN enriched_at INTEGER;
