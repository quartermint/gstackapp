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
    sourceType: text("source_type", {
      enum: ["manual", "capacities", "imessage", "cli"],
    })
      .notNull()
      .default("manual"),
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

// -- Auto-Discovery --

export const discoveries = sqliteTable(
  "discoveries",
  {
    id: text("id").primaryKey(),
    path: text("path").notNull(),
    host: text("host", { enum: ["local", "mac-mini", "github"] }).notNull(),
    status: text("status", { enum: ["found", "tracked", "dismissed"] })
      .notNull()
      .default("found"),
    remoteUrl: text("remote_url"),
    name: text("name"),
    lastCommitAt: integer("last_commit_at", { mode: "timestamp" }),
    discoveredAt: integer("discovered_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    uniqueIndex("discoveries_path_host_uniq").on(table.path, table.host),
    index("discoveries_status_idx").on(table.status),
    index("discoveries_host_idx").on(table.host),
  ]
);

// -- GitHub Star Intelligence --

export const stars = sqliteTable(
  "stars",
  {
    githubId: integer("github_id").primaryKey(),
    fullName: text("full_name").notNull(),
    description: text("description"),
    language: text("language"),
    topics: text("topics"),
    htmlUrl: text("html_url").notNull(),
    intent: text("intent", {
      enum: ["reference", "tool", "try", "inspiration"],
    }),
    aiConfidence: real("ai_confidence"),
    userOverride: integer("user_override", { mode: "boolean" }).default(false),
    starredAt: integer("starred_at", { mode: "timestamp" }).notNull(),
    lastSyncedAt: integer("last_synced_at", { mode: "timestamp" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    uniqueIndex("stars_github_id_uniq").on(table.githubId),
    index("stars_intent_idx").on(table.intent),
    index("stars_language_idx").on(table.language),
    index("stars_starred_at_idx").on(table.starredAt),
  ]
);

// -- Session Tracking --

export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    source: text("source", { enum: ["claude-code", "aider"] }).notNull(),
    model: text("model"),
    tier: text("tier", { enum: ["opus", "sonnet", "local", "unknown"] }).notNull(),
    projectSlug: text("project_slug"),
    cwd: text("cwd").notNull(),
    status: text("status", {
      enum: ["active", "completed", "abandoned"],
    }).notNull().default("active"),
    filesJson: text("files_json"),
    taskDescription: text("task_description"),
    stopReason: text("stop_reason"),
    startedAt: integer("started_at", { mode: "timestamp" }).notNull(),
    lastHeartbeatAt: integer("last_heartbeat_at", { mode: "timestamp" }),
    endedAt: integer("ended_at", { mode: "timestamp" }),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    index("sessions_status_idx").on(table.status),
    index("sessions_project_slug_idx").on(table.projectSlug),
    index("sessions_started_at_idx").on(table.startedAt),
    index("sessions_tier_idx").on(table.tier),
  ]
);

// -- Knowledge Aggregation --

export const projectKnowledge = sqliteTable(
  "project_knowledge",
  {
    projectSlug: text("project_slug").primaryKey(),
    content: text("content").notNull(),
    contentHash: text("content_hash").notNull(),
    fileSize: integer("file_size").notNull(),
    lastModified: text("last_modified").notNull(),
    commitsSinceUpdate: integer("commits_since_update").notNull().default(0),
    lastScannedAt: text("last_scanned_at").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("knowledge_last_modified_idx").on(table.lastModified),
  ]
);

// -- Idempotency Keys --

// -- Client Visits --

export const clientVisits = sqliteTable("client_visits", {
  clientId: text("client_id").primaryKey(),
  lastVisitAt: text("last_visit_at").notNull(),
  previousVisitAt: text("previous_visit_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// -- Idempotency Keys --

export const idempotencyKeys = sqliteTable(
  "idempotency_keys",
  {
    key: text("key").primaryKey(),
    captureId: text("capture_id").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    index("idempotency_created_at_idx").on(table.createdAt),
  ]
);

// -- Capture Intelligence (Phase 33) --

export const fewShotExamples = sqliteTable(
  "few_shot_examples",
  {
    id: text("id").primaryKey(),
    captureContent: text("capture_content").notNull(),
    projectSlug: text("project_slug").notNull(),
    extractionType: text("extraction_type", {
      enum: ["project_ref", "action_item", "idea", "link", "question"],
    })
      .notNull()
      .default("project_ref"),
    isCorrection: integer("is_correction", { mode: "boolean" }).default(false),
    sourceCaptureId: text("source_capture_id"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    index("few_shot_project_slug_idx").on(table.projectSlug),
    index("few_shot_extraction_type_idx").on(table.extractionType),
  ]
);

export const captureExtractions = sqliteTable(
  "capture_extractions",
  {
    id: text("id").primaryKey(),
    captureId: text("capture_id").notNull(),
    extractionType: text("extraction_type", {
      enum: ["project_ref", "action_item", "idea", "link", "question"],
    }).notNull(),
    content: text("content").notNull(),
    confidence: real("confidence").notNull().default(0),
    groundingJson: text("grounding_json"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    index("extractions_capture_id_idx").on(table.captureId),
    index("extractions_type_idx").on(table.extractionType),
  ]
);

export const correctionStats = sqliteTable(
  "correction_stats",
  {
    id: text("id").primaryKey(),
    predictedSlug: text("predicted_slug").notNull(),
    actualSlug: text("actual_slug").notNull(),
    correctionCount: integer("correction_count").notNull().default(1),
    lastCorrectedAt: integer("last_corrected_at", { mode: "timestamp" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    uniqueIndex("correction_pair_uniq").on(table.predictedSlug, table.actualSlug),
  ]
);
