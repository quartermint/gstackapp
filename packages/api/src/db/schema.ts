import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

export const captures = sqliteTable(
  "captures",
  {
    id: text("id").primaryKey(),
    rawContent: text("raw_content").notNull(),
    type: text("type", {
      enum: ["text", "voice", "link", "image"],
    })
      .notNull()
      .default("text"),
    status: text("status", {
      enum: ["raw", "pending_enrichment", "enriched", "archived"],
    })
      .notNull()
      .default("raw"),
    projectId: text("project_id"),
    userId: text("user_id"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    index("captures_project_id_idx").on(table.projectId),
    index("captures_status_idx").on(table.status),
    index("captures_user_id_idx").on(table.userId),
  ]
);

export const projects = sqliteTable(
  "projects",
  {
    slug: text("slug").primaryKey(),
    name: text("name").notNull(),
    tagline: text("tagline"),
    path: text("path").notNull(),
    host: text("host", { enum: ["local", "mac-mini"] })
      .notNull()
      .default("local"),
    lastScannedAt: integer("last_scanned_at", { mode: "timestamp" }),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [index("projects_host_idx").on(table.host)]
);
