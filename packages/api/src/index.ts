import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { getDatabase } from "./db/index.js";
import { loadConfig } from "./lib/config.js";
import {
  scanAllProjects,
  startBackgroundPoll,
} from "./services/project-scanner.js";
import { startSessionReaper } from "./services/session-service.js";
import { startLmStudioProbe } from "./services/lm-studio.js";
import { startDiscoveryScanner } from "./services/discovery-scanner.js";
import { startStarSync } from "./services/star-service.js";
import { startKnowledgeScan } from "./services/knowledge-aggregator.js";
import { startIMessageMonitor } from "./services/imessage-monitor.js";
import { purgeExpiredKeys } from "./db/queries/idempotency.js";
import { validatePromptExamples } from "./services/prompt-validator.js";
import { startIntelligenceDaemon } from "./services/intelligence-daemon.js";

const PORT = Number(process.env["PORT"] ?? 3000);
const HOST = process.env["HOST"] ?? "0.0.0.0";

// User sets GEMINI_API_KEY in .env; @ai-sdk/google expects GOOGLE_GENERATIVE_AI_API_KEY.
// We map one to the other at startup. All user-facing messages reference GEMINI_API_KEY.
if (process.env["GEMINI_API_KEY"] && !process.env["GOOGLE_GENERATIVE_AI_API_KEY"]) {
  process.env["GOOGLE_GENERATIVE_AI_API_KEY"] = process.env["GEMINI_API_KEY"];
}

// Warn about missing AI API key at startup
if (!process.env["GOOGLE_GENERATIVE_AI_API_KEY"]) {
  console.warn(
    "Warning: GEMINI_API_KEY not set — AI enrichment and smart search will be disabled"
  );
}

// Load config (optional -- scanner won't run without it)
let config = null;
try {
  config = loadConfig();
  console.log(
    `Loaded config with ${config.projects.length} project(s)`
  );
} catch (err) {
  console.warn(
    "Config not loaded -- project scanning disabled:",
    err instanceof Error ? err.message : err
  );
}

// Create app with config for project routes
const app = createApp(undefined, config);

const server = serve(
  { fetch: app.fetch, port: PORT, hostname: HOST },
  (info) => {
    console.log(
      `Mission Control API running on http://${HOST}:${info.port}`
    );
  }
);

// Start background scan if config is available
let pollTimer: ReturnType<typeof setInterval> | null = null;
let discoveryTimer: ReturnType<typeof setInterval> | null = null;
let starSyncTimer: ReturnType<typeof setInterval> | null = null;
let knowledgeTimer: ReturnType<typeof setInterval> | null = null;
let imessageTimer: ReturnType<typeof setInterval> | null = null;
let intelligenceCleanup: (() => void) | null = null;

if (config) {
  // Delay scanner startup by 5 seconds to let the HTTP server fully
  // initialize before the scan workload (33 projects + SSH + GitHub API)
  // saturates the event loop. Without this delay, the concurrent execFile
  // burst on startup can cause @hono/node-server to stop draining socket
  // read buffers, leaving connections in CLOSE_WAIT and freezing the API.
  setTimeout(() => {
    const { db, sqlite } = getDatabase();

    // Run initial scan (with sqlite for commit persistence + search indexing)
    scanAllProjects(config, db, sqlite).catch((err) =>
      console.error("Initial scan failed:", err)
    );

    // Start background poll (every 5 minutes)
    pollTimer = startBackgroundPoll(config, db, 300_000, sqlite);
    console.log("Background project scanning started (5-minute interval)");

    // Start discovery scanner (independent timer, NOT inside project scan)
    const { db: discoveryDb } = getDatabase();
    discoveryTimer = startDiscoveryScanner(config, discoveryDb);
    console.log(`Discovery scanner started (${config.discovery?.scanIntervalMinutes ?? 60}-minute interval)`);

    // Start star sync (configurable interval, default 6 hours)
    const { db: starDb } = getDatabase();
    starSyncTimer = startStarSync(config, starDb);
    const starIntervalHours = config.discovery?.starSyncIntervalHours ?? 6;
    console.log(`Star sync started (${starIntervalHours}-hour interval)`);

    // Start knowledge scanner (independent hourly timer, per KNOW-03)
    const { db: knowledgeDb, sqlite: knowledgeSqlite } = getDatabase();
    knowledgeTimer = startKnowledgeScan(config, knowledgeDb, knowledgeSqlite);
    console.log("Knowledge scanner started (1-hour interval)");

    // Validate few-shot prompt examples (fire-and-forget, per D-03)
    validatePromptExamples(db).catch((err) =>
      console.error("Prompt validation failed:", err)
    );

    // Start iMessage monitor if configured (ambient capture, per D-12/D-13/D-14)
    const imConfig = config.ambientCapture?.imessage;
    if (imConfig) {
      const { db: imDb } = getDatabase();
      imessageTimer = startIMessageMonitor(imDb, {
        chatDbPath: imConfig.chatDbPath.replace("~", process.env["HOME"] ?? ""),
        contacts: imConfig.contacts,
        pollIntervalMs: (imConfig.pollIntervalMinutes ?? 5) * 60 * 1000,
        enabled: imConfig.enabled ?? false,
      });
      if (imessageTimer) {
        console.log(`iMessage monitor started (${imConfig.pollIntervalMinutes ?? 5}-minute interval, contacts: ${imConfig.contacts.join(", ")})`);
      }
    }

    // Start intelligence daemon (narratives + daily digest + cache cleanup)
    const { db: intelDb } = getDatabase();
    const intelDaemon = startIntelligenceDaemon(intelDb, {
      digestCron: "0 6 * * *",
    });
    intelligenceCleanup = intelDaemon.stop;
    console.log("Intelligence daemon started (narratives + daily digest + cache cleanup)");
  }, 5_000);
}

// Purge expired idempotency keys daily
let purgeTimer: ReturnType<typeof setInterval> | null = null;
{
  const { db: purgeDb } = getDatabase();
  purgeExpiredKeys(purgeDb); // Run once at startup
  purgeTimer = setInterval(() => purgeExpiredKeys(purgeDb), 86_400_000); // 24 hours
  console.log("Idempotency key purge scheduled (24-hour interval)");
}

// Start session reaper (marks stale sessions as abandoned)
let reaperTimer: ReturnType<typeof setInterval> | null = null;
{
  const { db: reaperDb, sqlite: reaperSqlite } = getDatabase();
  reaperTimer = startSessionReaper(reaperDb, 180_000, reaperSqlite); // 3 minutes
  console.log("Session reaper started (3-minute interval)");
}

// Start LM Studio health probe
let lmProbeTimer: ReturnType<typeof setInterval> | null = null;
{
  const lmConfig = config?.lmStudio;
  lmProbeTimer = startLmStudioProbe(lmConfig?.probeIntervalMs ?? 30_000, lmConfig);
  console.log(`LM Studio probe started (${(lmConfig?.probeIntervalMs ?? 30_000) / 1000}s interval)`);
}

function shutdown() {
  console.log("\nShutting down gracefully...");

  // Stop intelligence daemon
  if (intelligenceCleanup) {
    intelligenceCleanup();
    intelligenceCleanup = null;
    console.log("Intelligence daemon stopped.");
  }

  // Stop idempotency key purge
  if (purgeTimer) {
    clearInterval(purgeTimer);
    purgeTimer = null;
    console.log("Idempotency key purge stopped.");
  }

  // Stop iMessage monitor
  if (imessageTimer) {
    clearInterval(imessageTimer);
    imessageTimer = null;
    console.log("iMessage monitor stopped.");
  }

  // Stop knowledge scanner
  if (knowledgeTimer) {
    clearInterval(knowledgeTimer);
    knowledgeTimer = null;
    console.log("Knowledge scanner stopped.");
  }

  // Stop star sync
  if (starSyncTimer) {
    clearInterval(starSyncTimer);
    starSyncTimer = null;
    console.log("Star sync stopped.");
  }

  // Stop discovery scanner
  if (discoveryTimer) {
    clearInterval(discoveryTimer);
    discoveryTimer = null;
    console.log("Discovery scanner stopped.");
  }

  // Stop LM Studio probe
  if (lmProbeTimer) {
    clearInterval(lmProbeTimer);
    lmProbeTimer = null;
    console.log("LM Studio probe stopped.");
  }

  // Stop session reaper
  if (reaperTimer) {
    clearInterval(reaperTimer);
    reaperTimer = null;
    console.log("Session reaper stopped.");
  }

  // Stop background poll
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
    console.log("Background scanner stopped.");
  }

  server.close(() => {
    console.log("Server closed.");
    process.exit(0);
  });
  // Force exit after 5 seconds
  setTimeout(() => process.exit(1), 5000);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
