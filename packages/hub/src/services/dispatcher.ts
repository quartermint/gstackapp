/**
 * Task dispatcher service
 *
 * Handles dispatching tasks to available compute nodes
 * and tracking their execution status.
 *
 * Node registry is persisted to Convex, with an in-memory cache
 * for performance during task dispatch.
 */

import {
  TaskDispatch,
  TaskResult,
  TaskResultSchema,
  NodeHeartbeat,
  NodeCapabilities,
  NodeStatus,
  LIMITS,
} from '@mission-control/shared';
import { getConvexClient, isConvexConfigured, api } from './convex.js';
import { logAuditEvent } from './audit.js';

// NodeStatus is imported from shared. The shared type includes 'draining'
// which we map to 'offline' when persisting to Convex (see persistNodeToConvex).

/**
 * Compute node information
 */
export interface ComputeNode {
  id: string;
  hostname: string;
  url: string;
  status: NodeStatus;
  lastHeartbeat: Date;
  currentTasks: number;
  maxConcurrentTasks: number;
  load: number;
  capabilities?: NodeCapabilities;
}

/**
 * Convex node record structure
 */
interface ConvexNode {
  _id: string;
  _creationTime: number;
  hostname: string;
  status: 'online' | 'offline' | 'busy' | 'draining';
  load: number;
  activeTasks: number;
  capabilities: string[];
  lastHeartbeat: number;
  tailscaleIp?: string;
}

/**
 * Task dispatch result
 */
export interface DispatchResult {
  /** Whether the task was successfully dispatched */
  dispatched: boolean;
  /** The node ID if dispatched */
  nodeId?: string;
  /** Error message if dispatch failed */
  error?: string;
  /** Task result if synchronous execution completed */
  result?: TaskResult;
}

/**
 * Dispatcher configuration
 */
export interface DispatcherConfig {
  /** Timeout for HTTP requests to compute nodes (ms) */
  dispatchTimeoutMs?: number;
  /** Heartbeat staleness threshold multiplier */
  heartbeatStalenessMultiplier?: number;
}

const DEFAULT_CONFIG: Required<DispatcherConfig> = {
  dispatchTimeoutMs: 5000,
  heartbeatStalenessMultiplier: LIMITS.NODE_OFFLINE_THRESHOLD,
};

let config: Required<DispatcherConfig> = { ...DEFAULT_CONFIG };

/**
 * Configure the dispatcher
 * @param newConfig - Configuration options
 */
export function configureDispatcher(newConfig: DispatcherConfig): void {
  config = { ...DEFAULT_CONFIG, ...newConfig };
}

/**
 * In-memory node registry cache
 * This is synced with Convex on registration and periodically refreshed
 */
const nodeRegistry = new Map<string, ComputeNode>();

/**
 * Round-robin index for node selection (used as tiebreaker)
 */
let roundRobinIndex = 0;

/**
 * Parse capabilities from Convex string array format
 */
function parseCapabilitiesFromConvex(
  capabilities: string[]
): NodeCapabilities | undefined {
  if (!capabilities || capabilities.length === 0) {
    return undefined;
  }

  const capMap = new Map<string, string>();
  for (const cap of capabilities) {
    const [key, value] = cap.split(':');
    if (key && value) {
      capMap.set(key, value);
    }
  }

  const cpuCores = parseInt(capMap.get('cpuCores') || '4', 10);
  const memoryMb = parseInt(capMap.get('memoryMb') || '8192', 10);
  const platform = capMap.get('platform') as 'darwin' | 'linux' | undefined;
  const arch = capMap.get('arch') as 'arm64' | 'x64' | undefined;
  const sandbox = capMap.get('sandbox');

  if (!platform || !arch) {
    return undefined;
  }

  return {
    cpuCores,
    memoryMb,
    sandboxEnabled: sandbox === 'enabled',
    platform,
    arch,
  };
}

/**
 * Convert Convex node to local ComputeNode format
 */
function toComputeNode(convexNode: ConvexNode, url?: string): ComputeNode {
  return {
    id: convexNode._id,
    hostname: convexNode.hostname,
    url: url || `http://${convexNode.tailscaleIp || convexNode.hostname}:3001`,
    status: convexNode.status,
    lastHeartbeat: new Date(convexNode.lastHeartbeat),
    currentTasks: convexNode.activeTasks,
    maxConcurrentTasks: 4, // Default, could be part of capabilities
    load: convexNode.load,
    capabilities: parseCapabilitiesFromConvex(convexNode.capabilities),
  };
}

/**
 * Sync nodes from Convex to local cache
 */
async function syncNodesFromConvex(): Promise<void> {
  if (!isConvexConfigured()) {
    return;
  }

  try {
    const client = getConvexClient();
    const convexNodes = (await client.query(
      api.nodes.listOnline,
      {}
    )) as ConvexNode[];

    // Update local cache
    for (const convexNode of convexNodes) {
      const existingNode = nodeRegistry.get(convexNode._id);
      if (existingNode) {
        // Update existing node but preserve URL
        const updated = toComputeNode(convexNode, existingNode.url);
        nodeRegistry.set(convexNode._id, updated);
      } else {
        // Add new node
        nodeRegistry.set(convexNode._id, toComputeNode(convexNode));
      }
    }

    // Mark nodes not in Convex as offline
    const convexNodeIds = new Set(convexNodes.map((n) => n._id));
    for (const [id, node] of nodeRegistry) {
      if (!convexNodeIds.has(id) && node.status !== 'offline') {
        node.status = 'offline';
      }
    }
  } catch (error) {
    console.error('[dispatcher] Failed to sync nodes from Convex:', error);
  }
}

/**
 * Convert NodeCapabilities to Convex string array format
 * Exported for use in node routes heartbeat handler
 */
export function capabilitiesToConvex(capabilities?: NodeCapabilities): string[] {
  if (!capabilities) {
    return [];
  }

  return [
    `platform:${capabilities.platform}`,
    `arch:${capabilities.arch}`,
    `cpuCores:${capabilities.cpuCores}`,
    `memoryMb:${capabilities.memoryMb}`,
    capabilities.sandboxEnabled ? 'sandbox:enabled' : 'sandbox:disabled',
  ];
}

/**
 * Persist node to Convex
 */
async function persistNodeToConvex(node: ComputeNode): Promise<string | null> {
  if (!isConvexConfigured()) {
    return null;
  }

  try {
    const client = getConvexClient();
    const convexId = await client.mutation(api.nodes.upsert, {
      hostname: node.hostname,
      status: node.status === 'draining' ? 'offline' : node.status,
      load: node.load,
      activeTasks: node.currentTasks,
      capabilities: capabilitiesToConvex(node.capabilities),
      tailscaleIp: node.url.match(/http:\/\/([\d.]+)/)?.[1],
    });
    return convexId;
  } catch (error) {
    console.error('[dispatcher] Failed to persist node to Convex:', error);
    return null;
  }
}

/**
 * Mark node offline in Convex
 */
async function markNodeOfflineInConvex(hostname: string): Promise<void> {
  if (!isConvexConfigured()) {
    return;
  }

  try {
    const client = getConvexClient();
    await client.mutation(api.nodes.markOffline, { hostname });
  } catch (error) {
    console.error('[dispatcher] Failed to mark node offline in Convex:', error);
  }
}

/**
 * Dispatch a task to an available compute node
 *
 * Selection strategy:
 * 1. Filter to healthy online nodes with available capacity
 * 2. Sort by current load (least loaded first)
 * 3. Use round-robin as tiebreaker for equally loaded nodes
 * 4. Attempt to dispatch to selected node
 * 5. Fall back to next if dispatch fails
 *
 * @param task - The task to dispatch
 * @returns DispatchResult indicating success/failure
 */
export async function dispatchTask(
  task: TaskDispatch
): Promise<DispatchResult> {
  // Sync nodes from Convex before dispatch
  await syncNodesFromConvex();

  // Check node health before selection
  updateNodeHealthStatus();

  // Get available nodes
  const availableNodes = getAvailableNodes();

  if (availableNodes.length === 0) {
    await logAuditEvent({
      requestId: task.requestId,
      action: 'dispatch.no_nodes_available',
      details: JSON.stringify({ taskId: task.taskId }),
    });

    return {
      dispatched: false,
      error: 'No compute nodes available',
    };
  }

  // Sort by load (least loaded first), then use round-robin for ties
  const sortedNodes = sortNodesByLoadAndRoundRobin(availableNodes);

  // Try to dispatch to nodes in order of preference
  for (const node of sortedNodes) {
    const result = await tryDispatchToNode(node, task);
    if (result.success) {
      // Update node task count locally
      node.currentTasks++;

      // Persist update to Convex
      await persistNodeToConvex(node);

      // Advance round-robin index
      roundRobinIndex = (roundRobinIndex + 1) % nodeRegistry.size;

      return {
        dispatched: true,
        nodeId: node.id,
        result: result.taskResult,
      };
    }

    // Log dispatch failure for debugging
    console.warn(
      `[dispatcher] Failed to dispatch task ${task.taskId} to node ${node.id}: ${result.error}`
    );
  }

  return {
    dispatched: false,
    error: 'All available nodes rejected the task',
  };
}

/**
 * Sort nodes by load with round-robin tiebreaker
 * @param nodes - Array of nodes to sort
 * @returns Sorted array of nodes
 */
function sortNodesByLoadAndRoundRobin(nodes: ComputeNode[]): ComputeNode[] {
  const nodeArray = [...nodes];

  return nodeArray.sort((a, b) => {
    // Primary sort: by load percentage (least loaded first)
    const loadA = a.currentTasks / a.maxConcurrentTasks;
    const loadB = b.currentTasks / b.maxConcurrentTasks;

    if (loadA !== loadB) {
      return loadA - loadB;
    }

    // Secondary sort: by system load if available
    if (a.load !== b.load) {
      return a.load - b.load;
    }

    // Tertiary sort: round-robin based on node index
    const indexA = Array.from(nodeRegistry.keys()).indexOf(a.id);
    const indexB = Array.from(nodeRegistry.keys()).indexOf(b.id);

    // Favor node that comes after current round-robin index
    const distA =
      (indexA - roundRobinIndex + nodeRegistry.size) % nodeRegistry.size;
    const distB =
      (indexB - roundRobinIndex + nodeRegistry.size) % nodeRegistry.size;

    return distA - distB;
  });
}

/**
 * Update health status of all nodes based on heartbeat timestamps
 */
function updateNodeHealthStatus(): void {
  const now = Date.now();
  const heartbeatIntervalMs = LIMITS.NODE_HEARTBEAT_INTERVAL_MS;
  const stalenessThreshold =
    heartbeatIntervalMs * config.heartbeatStalenessMultiplier;

  for (const node of nodeRegistry.values()) {
    const timeSinceHeartbeat = now - node.lastHeartbeat.getTime();

    if (timeSinceHeartbeat > stalenessThreshold) {
      // Node is stale, mark as offline
      if (node.status !== 'offline') {
        console.warn(
          `[dispatcher] Node ${node.id} (${node.hostname}) marked offline: ` +
            `no heartbeat for ${Math.round(timeSinceHeartbeat / 1000)}s`
        );
        node.status = 'offline';

        // Persist offline status to Convex (fire and forget)
        markNodeOfflineInConvex(node.hostname).catch(() => {});
      }
    }
  }
}

/**
 * Get nodes that are online, healthy, and have available capacity
 */
function getAvailableNodes(): ComputeNode[] {
  return Array.from(nodeRegistry.values()).filter((node) => {
    // Must be online
    if (node.status !== 'online') {
      return false;
    }

    // Must have capacity
    if (node.currentTasks >= node.maxConcurrentTasks) {
      return false;
    }

    // Must have recent heartbeat
    const timeSinceHeartbeat = Date.now() - node.lastHeartbeat.getTime();
    const heartbeatIntervalMs = LIMITS.NODE_HEARTBEAT_INTERVAL_MS;
    const stalenessThreshold =
      heartbeatIntervalMs * config.heartbeatStalenessMultiplier;

    if (timeSinceHeartbeat > stalenessThreshold) {
      return false;
    }

    return true;
  });
}

/**
 * Attempt to dispatch a task to a specific node via HTTP POST
 *
 * @param node - The target compute node
 * @param task - The task to dispatch
 * @returns Result indicating success or failure
 */
async function tryDispatchToNode(
  node: ComputeNode,
  task: TaskDispatch
): Promise<{ success: boolean; error?: string; taskResult?: TaskResult }> {
  const url = `${node.url}/api/tasks/execute`;

  try {
    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, config.dispatchTimeoutMs);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Request-ID': task.requestId,
      },
      body: JSON.stringify(task),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      // Handle HTTP error responses
      let errorMessage = `HTTP ${response.status}`;

      try {
        const errorBody = (await response.json()) as {
          error?: { message?: string; code?: string };
        };
        if (errorBody.error?.message) {
          errorMessage = errorBody.error.message;
        }
      } catch {
        // Ignore JSON parse errors
      }

      // Mark node as busy if it returned 503
      if (response.status === 503) {
        node.status = 'busy';
        await persistNodeToConvex(node);
      }

      return {
        success: false,
        error: errorMessage,
      };
    }

    // Parse successful response
    const responseBody = (await response.json()) as {
      success: boolean;
      data?: TaskResult;
      error?: { message: string };
    };

    if (!responseBody.success) {
      return {
        success: false,
        error: responseBody.error?.message || 'Unknown error from compute node',
      };
    }

    // Validate task result
    if (responseBody.data) {
      const parseResult = TaskResultSchema.safeParse(responseBody.data);
      if (parseResult.success) {
        return {
          success: true,
          taskResult: parseResult.data,
        };
      }
    }

    // Task was accepted but no result yet (async execution)
    return { success: true };
  } catch (error) {
    // Handle network errors
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        return {
          success: false,
          error: `Request timeout after ${config.dispatchTimeoutMs}ms`,
        };
      }

      // Connection errors likely mean node is down
      if (
        error.message.includes('ECONNREFUSED') ||
        error.message.includes('ENOTFOUND') ||
        error.message.includes('EHOSTUNREACH')
      ) {
        node.status = 'offline';
        await persistNodeToConvex(node);
        return {
          success: false,
          error: `Node unreachable: ${error.message}`,
        };
      }

      return {
        success: false,
        error: `Network error: ${error.message}`,
      };
    }

    return {
      success: false,
      error: 'Unknown error during dispatch',
    };
  }
}

/**
 * Register a compute node
 * @param id - Node ID
 * @param hostname - Node hostname
 * @param url - Node URL for task dispatch
 * @param capabilities - Optional node capabilities
 * @param maxConcurrentTasks - Maximum concurrent tasks (defaults to 4)
 */
export async function registerNode(
  id: string,
  hostname: string,
  url: string,
  capabilities?: NodeCapabilities,
  maxConcurrentTasks: number = 4
): Promise<void> {
  const existingNode = nodeRegistry.get(id);

  const node: ComputeNode = existingNode
    ? {
        ...existingNode,
        hostname,
        url,
        status: 'online',
        lastHeartbeat: new Date(),
        capabilities,
        maxConcurrentTasks,
      }
    : {
        id,
        hostname,
        url,
        status: 'online',
        lastHeartbeat: new Date(),
        currentTasks: 0,
        maxConcurrentTasks,
        load: 0,
        capabilities,
      };

  nodeRegistry.set(id, node);

  // Persist to Convex and update ID if needed
  const convexId = await persistNodeToConvex(node);
  if (convexId && convexId !== id) {
    // Update with Convex ID
    nodeRegistry.delete(id);
    node.id = convexId;
    nodeRegistry.set(convexId, node);
  }

  await logAuditEvent({
    requestId: crypto.randomUUID(),
    action: 'node.registered',
    details: JSON.stringify({ nodeId: node.id, hostname, url }),
  });

  console.log(`[dispatcher] Node ${node.id} (${hostname}) registered at ${url}`);
}

/**
 * Unregister a compute node
 * @param id - Node ID
 */
export async function unregisterNode(id: string): Promise<void> {
  const node = nodeRegistry.get(id);
  if (node) {
    nodeRegistry.delete(id);

    // Mark offline in Convex
    await markNodeOfflineInConvex(node.hostname);

    await logAuditEvent({
      requestId: crypto.randomUUID(),
      action: 'node.unregistered',
      details: JSON.stringify({ nodeId: id, hostname: node.hostname }),
    });

    console.log(`[dispatcher] Node ${id} (${node.hostname}) unregistered`);
  }
}

/**
 * Update node status
 * @param id - Node ID
 * @param status - New status
 * @param currentTasks - Optional current task count
 */
export async function updateNodeStatus(
  id: string,
  status: NodeStatus,
  currentTasks?: number
): Promise<void> {
  const node = nodeRegistry.get(id);
  if (node) {
    node.status = status;
    node.lastHeartbeat = new Date();
    if (currentTasks !== undefined) {
      node.currentTasks = currentTasks;
    }

    // Persist to Convex
    await persistNodeToConvex(node);
  }
}

/**
 * Handle node heartbeat
 * @param id - Node ID
 * @param heartbeat - Heartbeat data
 */
export async function handleHeartbeat(
  id: string,
  heartbeat: NodeHeartbeat
): Promise<void> {
  const node = nodeRegistry.get(id);
  if (node) {
    node.lastHeartbeat = new Date();
    node.currentTasks = heartbeat.activeTasks;
    node.load = heartbeat.load;
    node.capabilities = heartbeat.capabilities;

    // Update status based on heartbeat
    if (heartbeat.status === 'online' || heartbeat.status === 'busy') {
      node.status = heartbeat.status;
    }

    // Persist to Convex
    await persistNodeToConvex(node);
  }
}

/**
 * Handle task completion callback from compute node
 * Updates the node's task count
 * @param nodeId - Node ID
 * @param taskId - Task ID
 */
export async function handleTaskComplete(
  nodeId: string,
  taskId: string
): Promise<void> {
  const node = nodeRegistry.get(nodeId);
  if (node && node.currentTasks > 0) {
    node.currentTasks--;

    // Persist to Convex
    await persistNodeToConvex(node);

    console.log(
      `[dispatcher] Task ${taskId} completed on node ${nodeId}, ` +
        `active tasks: ${node.currentTasks}/${node.maxConcurrentTasks}`
    );
  }
}

/**
 * Get all registered nodes
 * @returns Array of all nodes
 */
export function getNodes(): ComputeNode[] {
  return Array.from(nodeRegistry.values());
}

/**
 * Get a specific node by ID
 * @param id - Node ID
 * @returns Node if found, undefined otherwise
 */
export function getNode(id: string): ComputeNode | undefined {
  return nodeRegistry.get(id);
}

/**
 * Get all healthy nodes (online with recent heartbeat)
 * @returns Array of healthy nodes
 */
export function getHealthyNodes(): ComputeNode[] {
  updateNodeHealthStatus();
  return Array.from(nodeRegistry.values()).filter(
    (node) => node.status === 'online' || node.status === 'busy'
  );
}

/**
 * Get node statistics
 * @returns Statistics about registered nodes
 */
export function getNodeStats(): {
  total: number;
  online: number;
  offline: number;
  busy: number;
  totalCapacity: number;
  usedCapacity: number;
} {
  updateNodeHealthStatus();

  const nodes = Array.from(nodeRegistry.values());

  return {
    total: nodes.length,
    online: nodes.filter((n) => n.status === 'online').length,
    offline: nodes.filter((n) => n.status === 'offline').length,
    busy: nodes.filter((n) => n.status === 'busy').length,
    totalCapacity: nodes.reduce((sum, n) => sum + n.maxConcurrentTasks, 0),
    usedCapacity: nodes.reduce((sum, n) => sum + n.currentTasks, 0),
  };
}

/**
 * Clear all registered nodes (for testing)
 */
export function clearNodes(): void {
  nodeRegistry.clear();
  roundRobinIndex = 0;
}

/**
 * Force sync nodes from Convex (useful after initialization)
 */
export async function syncNodes(): Promise<void> {
  await syncNodesFromConvex();
}
