import { serve } from "@hono/node-server";
import { app } from "./app.js";

const PORT = Number(process.env["PORT"] ?? 3000);

const server = serve(
  { fetch: app.fetch, port: PORT },
  (info) => {
    console.log(`Mission Control API running on http://localhost:${info.port}`);
  }
);

function shutdown() {
  console.log("\nShutting down gracefully...");
  server.close(() => {
    console.log("Server closed.");
    process.exit(0);
  });
  // Force exit after 5 seconds
  setTimeout(() => process.exit(1), 5000);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
