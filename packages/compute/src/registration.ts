import * as os from 'node:os';
import type {
  NodeHeartbeat,
  NodeCapabilities,
  NodeStatus,
  NodeRegistrationResponse,
} from '@mission-control/shared';
import { NodeHeartbeatSchema, LIMITS } from '@mission-control/shared';
import { getSandboxConfig } from './sandbox.js';

/**
 * Registration configuration
 */
export interface RegistrationConfig {
  /** Hub URL for registration */
  hubUrl: string;
  /** Hostname for this node */
  hostname: string;
  /** Node version */
  version?: string;
  /** Maximum concurrent tasks */
  maxTasks?: number;
}

/**
 * Registration state
 */
interface RegistrationState {
  nodeId: string | null;
  heartbeatIntervalMs: number;
  heartbeatTimer: NodeJS.Timeout | null;
  activeTasks: number;
}

const state: RegistrationState = {
  nodeId: null,
  heartbeatIntervalMs: LIMITS.NODE_HEARTBEAT_INTERVAL_MS,
  heartbeatTimer: null,
  activeTasks: 0,
};

/**
 * Get node capabilities from system information
 * @returns Node capabilities
 */
export function getNodeCapabilities(): NodeCapabilities {
  const cpus = os.cpus();
  const totalMemMb = Math.floor(os.totalmem() / (1024 * 1024));
  const sandboxConfig = getSandboxConfig();

  // Determine platform
  const platform = os.platform();
  if (platform !== 'darwin' && platform !== 'linux') {
    throw new Error(`Unsupported platform: ${platform}`);
  }

  // Determine architecture
  const arch = os.arch();
  if (arch !== 'arm64' && arch !== 'x64') {
    throw new Error(`Unsupported architecture: ${arch}`);
  }

  return {
    cpuCores: cpus.length,
    memoryMb: totalMemMb,
    sandboxEnabled: sandboxConfig.enabled,
    platform,
    arch,
  };
}

/**
 * Calculate current system load (0-1)
 * @returns Load average normalized to 0-1
 */
export function getCurrentLoad(): number {
  const loadAvg = os.loadavg()[0] ?? 0; // 1-minute load average
  const cpuCount = os.cpus().length;

  // Normalize load to 0-1 range based on CPU count
  const normalizedLoad = loadAvg / cpuCount;

  // Clamp to 0-1
  return Math.min(1, Math.max(0, normalizedLoad));
}

/**
 * Determine node status based on current state
 * @param maxTasks - Maximum concurrent tasks
 * @returns Current node status
 */
export function determineNodeStatus(maxTasks: number): NodeStatus {
  if (state.activeTasks >= maxTasks) {
    return 'busy';
  }
  return 'online';
}

/**
 * Build a heartbeat payload
 * @param config - Registration configuration
 * @returns Validated heartbeat payload
 */
export function buildHeartbeat(config: RegistrationConfig): NodeHeartbeat {
  const maxTasks = config.maxTasks ?? os.cpus().length;

  const heartbeat = {
    hostname: config.hostname,
    status: determineNodeStatus(maxTasks),
    load: getCurrentLoad(),
    activeTasks: state.activeTasks,
    capabilities: getNodeCapabilities(),
    version: config.version,
  };

  // Validate against schema
  return NodeHeartbeatSchema.parse(heartbeat);
}

/**
 * Send heartbeat to hub
 * @param config - Registration configuration
 * @returns Registration response or null on failure
 */
async function sendHeartbeat(
  config: RegistrationConfig
): Promise<NodeRegistrationResponse | null> {
  try {
    const heartbeat = buildHeartbeat(config);

    const response = await fetch(`${config.hubUrl}/api/nodes/heartbeat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(heartbeat),
    });

    if (!response.ok) {
      console.error(
        `[registration] Heartbeat failed: ${response.status} ${response.statusText}`
      );
      return null;
    }

    const data = await response.json() as NodeRegistrationResponse;

    // Update node ID if received
    if (data.success && data.data.nodeId) {
      state.nodeId = data.data.nodeId;
    }

    return data;
  } catch (error) {
    console.error('[registration] Heartbeat error:', error);
    return null;
  }
}

/**
 * Register with hub and get initial configuration
 * @param config - Registration configuration
 * @returns Node ID if successful, null otherwise
 */
export async function registerWithHub(
  config: RegistrationConfig
): Promise<string | null> {
  console.log(`[registration] Registering with hub at ${config.hubUrl}`);

  const response = await sendHeartbeat(config);

  if (response?.success) {
    state.nodeId = response.data.nodeId;
    state.heartbeatIntervalMs = response.data.heartbeatIntervalMs;
    console.log(
      `[registration] Registered successfully. Node ID: ${state.nodeId}, ` +
      `Heartbeat interval: ${state.heartbeatIntervalMs}ms`
    );
    return state.nodeId;
  }

  console.error('[registration] Failed to register with hub');
  return null;
}

/**
 * Start periodic heartbeat
 * @param config - Registration configuration
 */
export function startHeartbeat(config: RegistrationConfig): void {
  // Stop existing heartbeat if any
  stopHeartbeat();

  console.log(
    `[registration] Starting heartbeat with interval ${state.heartbeatIntervalMs}ms`
  );

  state.heartbeatTimer = setInterval(async () => {
    await sendHeartbeat(config);
  }, state.heartbeatIntervalMs);

  // Ensure timer doesn't prevent process exit
  state.heartbeatTimer.unref();
}

/**
 * Stop periodic heartbeat
 */
export function stopHeartbeat(): void {
  if (state.heartbeatTimer) {
    clearInterval(state.heartbeatTimer);
    state.heartbeatTimer = null;
    console.log('[registration] Heartbeat stopped');
  }
}

/**
 * Get the current node ID
 * @returns Node ID or null if not registered
 */
export function getNodeId(): string | null {
  return state.nodeId;
}

/**
 * Update active task count
 * @param delta - Change in active tasks (positive or negative)
 */
export function updateActiveTasks(delta: number): void {
  state.activeTasks = Math.max(0, state.activeTasks + delta);
}

/**
 * Get current active task count
 * @returns Number of active tasks
 */
export function getActiveTasks(): number {
  return state.activeTasks;
}
