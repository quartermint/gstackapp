import {
  sqliteTable,
  text,
  integer,
  real,
  index,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

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
    host: text("host", { enum: ["local", "mac-mini", "github"] })
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

// ── Port Management ────────────────────────────────────────────────

export const machines = sqliteTable(
  "machines",
  {
    id: text("id").primaryKey(),
    hostname: text("hostname").notNull().unique(),
    tailnetIp: text("tailnet_ip"),
    os: text("os"),
    arch: text("arch"),
    lastSeenAt: integer("last_seen_at", { mode: "timestamp" }),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [index("machines_hostname_idx").on(table.hostname)]
);

export const portAllocations = sqliteTable(
  "port_allocations",
  {
    id: text("id").primaryKey(),
    port: integer("port").notNull(),
    protocol: text("protocol", { enum: ["tcp", "udp"] })
      .notNull()
      .default("tcp"),
    machineId: text("machine_id").notNull(),
    serviceName: text("service_name").notNull(),
    projectSlug: text("project_slug"),
    status: text("status", {
      enum: ["active", "deprecated", "reserved"],
    })
      .notNull()
      .default("active"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    uniqueIndex("port_alloc_port_machine_proto_uniq").on(
      table.port,
      table.machineId,
      table.protocol
    ),
    index("port_alloc_machine_id_idx").on(table.machineId),
    index("port_alloc_project_slug_idx").on(table.projectSlug),
    index("port_alloc_status_idx").on(table.status),
  ]
);

export const portScans = sqliteTable(
  "port_scans",
  {
    id: text("id").primaryKey(),
    machineId: text("machine_id").notNull(),
    port: integer("port").notNull(),
    protocol: text("protocol", { enum: ["tcp", "udp"] })
      .notNull()
      .default("tcp"),
    processName: text("process_name"),
    pid: integer("pid"),
    scanTimestamp: integer("scan_timestamp", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    index("port_scans_machine_id_idx").on(table.machineId),
    uniqueIndex("port_scans_machine_port_proto_uniq").on(
      table.machineId,
      table.port,
      table.protocol
    ),
  ]
);

export const portRanges = sqliteTable("port_ranges", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  startPort: integer("start_port").notNull(),
  endPort: integer("end_port").notNull(),
  description: text("description"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

// ── Git Health Intelligence ───────────────────────────────────────

export const projectHealth = sqliteTable(
  "project_health",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    projectSlug: text("project_slug").notNull(),
    checkType: text("check_type").notNull(),
    severity: text("severity").notNull(),
    detail: text("detail").notNull(),
    metadata: text("metadata"),
    detectedAt: text("detected_at").notNull(),
    resolvedAt: text("resolved_at"),
  },
  (table) => [
    index("health_slug_check_idx").on(table.projectSlug, table.checkType),
    index("health_resolved_idx").on(table.resolvedAt),
    index("health_slug_resolved_idx").on(table.projectSlug, table.resolvedAt),
  ]
);

export const projectCopies = sqliteTable(
  "project_copies",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    projectSlug: text("project_slug").notNull(),
    host: text("host").notNull(),
    path: text("path").notNull(),
    remoteUrl: text("remote_url"),
    headCommit: text("head_commit"),
    branch: text("branch"),
    isPublic: integer("is_public", { mode: "boolean" }),
    lastCheckedAt: text("last_checked_at").notNull(),
  },
  (table) => [
    uniqueIndex("copies_slug_host_uniq").on(table.projectSlug, table.host),
    index("copies_remote_url_idx").on(table.remoteUrl),
  ]
);
