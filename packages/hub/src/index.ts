/**
 * Hub package - Orchestration server for Mission Control
 *
 * This is the main entry point that exports the server instance
 * and starts the server when run directly.
 */

export { createServer, startServer } from './server.js';
export type { HubServer } from './server.js';

// Start server when run directly
import { startServer } from './server.js';

const PORT = parseInt(process.env['PORT'] || '3000', 10);

startServer(PORT).catch((error: unknown) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
