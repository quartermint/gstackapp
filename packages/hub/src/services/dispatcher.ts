/**
 * Task dispatcher service
 *
 * Handles dispatching tasks to available compute nodes
 * and tracking their execution status
 */

import {
  TaskDispatch,
  TaskResult,
  TaskResultSchema,
  NodeHeartbeat,
  NodeCapabilities,
  LIMITS,
} from '@mission-control/shared';

/**
 * Node status type
 */
type NodeStatus = 'online' | 'offline' | 'busy' | 'draining';

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
 * In-memory node registry
 */
const nodeRegistry = new Map<string, ComputeNode>();

/**
 * Round-robin index for node selection (used as tiebreaker)
 */
let roundRobinIndex = 0;

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
  // Check node health before selection
  updateNodeHealthStatus();

  // Get available nodes
  const availableNodes = getAvailableNodes();

  if (availableNodes.length === 0) {
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
      // Update node task count
      node.currentTasks++;

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
    const distA = (indexA - roundRobinIndex + nodeRegistry.size) % nodeRegistry.size;
    const distB = (indexB - roundRobinIndex + nodeRegistry.size) % nodeRegistry.size;

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
export function registerNode(
  id: string,
  hostname: string,
  url: string,
  capabilities?: NodeCapabilities,
  maxConcurrentTasks: number = 4
): void {
  const existingNode = nodeRegistry.get(id);

  if (existingNode) {
    // Update existing node
    existingNode.hostname = hostname;
    existingNode.url = url;
    existingNode.status = 'online';
    existingNode.lastHeartbeat = new Date();
    existingNode.capabilities = capabilities;
    existingNode.maxConcurrentTasks = maxConcurrentTasks;
  } else {
    // Create new node
    nodeRegistry.set(id, {
      id,
      hostname,
      url,
      status: 'online',
      lastHeartbeat: new Date(),
      currentTasks: 0,
      maxConcurrentTasks,
      load: 0,
      capabilities,
    });
  }

  console.log(`[dispatcher] Node ${id} (${hostname}) registered at ${url}`);
}

/**
 * Unregister a compute node
 * @param id - Node ID
 */
export function unregisterNode(id: string): void {
  const node = nodeRegistry.get(id);
  if (node) {
    nodeRegistry.delete(id);
    console.log(`[dispatcher] Node ${id} (${node.hostname}) unregistered`);
  }
}

/**
 * Update node status
 * @param id - Node ID
 * @param status - New status
 * @param currentTasks - Optional current task count
 */
export function updateNodeStatus(
  id: string,
  status: NodeStatus,
  currentTasks?: number
): void {
  const node = nodeRegistry.get(id);
  if (node) {
    node.status = status;
    node.lastHeartbeat = new Date();
    if (currentTasks !== undefined) {
      node.currentTasks = currentTasks;
    }
  }
}

/**
 * Handle node heartbeat
 * @param id - Node ID
 * @param heartbeat - Heartbeat data
 */
export function handleHeartbeat(id: string, heartbeat: NodeHeartbeat): void {
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
  }
}

/**
 * Handle task completion callback from compute node
 * Updates the node's task count
 * @param nodeId - Node ID
 * @param taskId - Task ID
 */
export function handleTaskComplete(nodeId: string, taskId: string): void {
  const node = nodeRegistry.get(nodeId);
  if (node && node.currentTasks > 0) {
    node.currentTasks--;
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
