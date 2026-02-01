import * as os from 'node:os';

// Export server components
export { createServer, startServer, type ServerConfig } from './server.js';

// Export executor
export { executeTask, type ExecutorConfig } from './executor.js';

// Export sandbox utilities
export {
  COMMAND_ALLOWLIST,
  isCommandAllowed,
  validateCommand,
  validateWorkingDir,
  createSandboxEnv,
  getSandboxConfig,
  SandboxError,
  type SandboxConfig,
  type AllowedCommand,
} from './sandbox.js';

// Export registration utilities
export {
  registerWithHub,
  startHeartbeat,
  stopHeartbeat,
  getNodeId,
  getNodeCapabilities,
  getCurrentLoad,
  updateActiveTasks,
  getActiveTasks,
  type RegistrationConfig,
} from './registration.js';

// Main entry point for CLI execution
const isMainModule = import.meta.url === `file://${process.argv[1]}`;

if (isMainModule) {
  const port = parseInt(process.env['PORT'] ?? '3001', 10);
  const hostname = process.env['HOSTNAME'] ?? os.hostname();
  const hubUrl = process.env['HUB_URL'] ?? 'http://localhost:3000';
  const version = process.env['npm_package_version'] ?? '0.1.0';

  const { startServer } = await import('./server.js');

  startServer({
    port,
    hostname,
    hubUrl,
    version,
  }).catch((error) => {
    console.error('Failed to start compute node:', error);
    process.exit(1);
  });
}
