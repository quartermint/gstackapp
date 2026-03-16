/**
 * Seed script for port registry.
 * Run with: pnpm exec tsx packages/api/src/scripts/seed-ports.ts
 */

import { nanoid } from "nanoid";
import { createDatabase } from "../db/index.js";

const instance = createDatabase();
const { sqlite } = instance;

const now = new Date();

// ── Machines ───────────────────────────────────────────────────────

const machineData = [
  {
    id: "mba",
    hostname: "mba",
    tailnetIp: null,
    os: "darwin",
    arch: "arm64",
  },
  {
    id: "mac-mini",
    hostname: "mac-mini",
    tailnetIp: "100.x.x.x",
    os: "darwin",
    arch: "arm64",
  },
  {
    id: "hetzner",
    hostname: "hetzner",
    tailnetIp: "100.x.x.x",
    os: "linux",
    arch: "amd64",
  },
] as const;

for (const m of machineData) {
  sqlite
    .prepare(
      `INSERT OR REPLACE INTO machines (id, hostname, tailnet_ip, os, arch, last_seen_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      m.id,
      m.hostname,
      m.tailnetIp,
      m.os,
      m.arch,
      Math.floor(now.getTime() / 1000),
      Math.floor(now.getTime() / 1000),
      Math.floor(now.getTime() / 1000)
    );
}

console.log(`Seeded ${machineData.length} machines`);

// ── Port Allocations ───────────────────────────────────────────────

const allocations = [
  { port: 3000, machine: "mac-mini", service: "Mission Control API", project: "mission-control" },
  { port: 3100, machine: "mac-mini", service: "Streamline", project: "streamline" },
  { port: 5173, machine: "mba", service: "TaxNav Web Dev", project: "taxnav" },
  { port: 5174, machine: "mba", service: "Vegas Eats Web Dev", project: "vegas-eats" },
  { port: 5175, machine: "mba", service: "Foundry Web Dev", project: "foundry" },
  { port: 8000, machine: "mba", service: "TaxNav API", project: "taxnav" },
  { port: 8001, machine: "mba", service: "Vegas Eats API", project: "vegas-eats" },
  { port: 8787, machine: "mba", service: "Foundry API", project: "foundry" },
  { port: 11235, machine: "mac-mini", service: "Crawl4AI", project: "crawl4ai" },
  { port: 11236, machine: "mac-mini", service: "Mac Mini Bridge", project: "mac-mini-bridge" },
  { port: 4000, machine: "hetzner", service: "ZeroClaw", project: "nexusclaw" },
] as const;

for (const a of allocations) {
  sqlite
    .prepare(
      `INSERT OR REPLACE INTO port_allocations (id, port, protocol, machine_id, service_name, project_slug, status, created_at, updated_at)
     VALUES (?, ?, 'tcp', ?, ?, ?, 'active', ?, ?)`
    )
    .run(
      nanoid(),
      a.port,
      a.machine,
      a.service,
      a.project,
      Math.floor(now.getTime() / 1000),
      Math.floor(now.getTime() / 1000)
    );
}

console.log(`Seeded ${allocations.length} port allocations`);

// ── Port Ranges ────────────────────────────────────────────────────

const ranges = [
  { name: "Web Apps (Production/Next.js)", start: 3000, end: 3099, desc: "Production web apps and Next.js servers" },
  { name: "Vite Dev Servers", start: 5170, end: 5199, desc: "Vite development servers for frontend apps" },
  { name: "Python APIs", start: 8000, end: 8099, desc: "FastAPI and other Python API servers" },
  { name: "Utility APIs", start: 8700, end: 8799, desc: "Utility and specialized API servers" },
  { name: "Infrastructure/MCP", start: 11200, end: 11299, desc: "Infrastructure services and MCP servers" },
] as const;

for (const r of ranges) {
  sqlite
    .prepare(
      `INSERT OR REPLACE INTO port_ranges (id, name, start_port, end_port, description, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      nanoid(),
      r.name,
      r.start,
      r.end,
      r.desc,
      Math.floor(now.getTime() / 1000)
    );
}

console.log(`Seeded ${ranges.length} port ranges`);

sqlite.close();
console.log("Done!");
