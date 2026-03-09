import { sqliteTable, text, integer, real, index, uniqueIndex } from "drizzle-orm/sqlite-core";

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
    aiConfidence: real("ai_confidence"),
    aiProjectSlug: text("ai_project_slug"),
    aiReasoning: text("ai_reasoning"),
    linkUrl: text("link_url"),
    linkTitle: text("link_title"),
    linkDescription: text("link_description"),
    linkDomain: text("link_domain"),
    linkImage: text("link_image"),
    enrichedAt: integer("enriched_at", { mode: "timestamp" }),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    index("captures_project_id_idx").on(table.projectId),
    index("captures_status_idx").on(table.status),
    index("captures_user_id_idx").on(table.userId),
    index("captures_enriched_at_idx").on(table.enrichedAt),
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

export const commits = sqliteTable(
  "commits",
  {
    id: text("id").primaryKey(),
    hash: text("hash").notNull(),
    message: text("message").notNull(),
    projectSlug: text("project_slug").notNull(),
    authorDate: text("author_date").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    index("commits_project_slug_idx").on(table.projectSlug),
    uniqueIndex("commits_project_hash_uniq").on(
      table.projectSlug,
      table.hash
    ),
  ]
);
