import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { getDatabase } from "./db/index.js";
import { loadConfig } from "./lib/config.js";
import {
  scanAllProjects,
  startBackgroundPoll,
} from "./services/project-scanner.js";

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

if (config) {
  const { db, sqlite } = getDatabase();

  // Run initial scan (with sqlite for commit persistence + search indexing)
  scanAllProjects(config, db, sqlite).catch((err) =>
    console.error("Initial scan failed:", err)
  );

  // Start background poll (every 5 minutes)
  pollTimer = startBackgroundPoll(config, db, 300_000, sqlite);
  console.log("Background project scanning started (5-minute interval)");
}

function shutdown() {
  console.log("\nShutting down gracefully...");

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
