// CRITICAL: Redirect console.log to stderr BEFORE any imports
// Prevents stdout pollution that corrupts MCP JSON-RPC protocol
console.log = console.error;

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerProjectHealth } from "./tools/project-health.js";
import { registerProjectRisks } from "./tools/project-risks.js";
import { registerProjectDetail } from "./tools/project-detail.js";
import { registerSyncStatus } from "./tools/sync-status.js";

const server = new McpServer({
  name: "mission-control",
  version: "1.0.0",
});

registerProjectHealth(server);
registerProjectRisks(server);
registerProjectDetail(server);
registerSyncStatus(server);

const transport = new StdioServerTransport();
await server.connect(transport);
