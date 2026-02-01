/**
 * Task dispatcher service (stub)
 *
 * Handles dispatching tasks to available compute nodes
 * and tracking their execution status
 */

import { TaskDispatch } from '@mission-control/shared';

/**
 * Compute node information
 */
interface ComputeNode {
  id: string;
  hostname: string;
  url: string;
  status: 'online' | 'offline' | 'busy';
  lastHeartbeat: Date;
  currentTasks: number;
  maxConcurrentTasks: number;
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
}

/**
 * In-memory node registry (stub - replace with Convex)
 */
const nodeRegistry = new Map<string, ComputeNode>();

// Add some mock nodes for development
nodeRegistry.set('node-1', {
  id: 'node-1',
  hostname: 'macmini-1',
  url: 'http://100.64.0.1:3001',
  status: 'online',
  lastHeartbeat: new Date(),
  currentTasks: 0,
  maxConcurrentTasks: 4,
});

nodeRegistry.set('node-2', {
  id: 'node-2',
  hostname: 'macbook-1',
  url: 'http://100.64.0.2:3001',
  status: 'online',
  lastHeartbeat: new Date(),
  currentTasks: 2,
  maxConcurrentTasks: 2,
});

/**
 * Dispatch a task to an available compute node
 *
 * Selection strategy:
 * 1. Filter to online nodes with available capacity
 * 2. Sort by current load (least loaded first)
 * 3. Attempt to dispatch to first available
 * 4. Fall back to next if dispatch fails
 *
 * @param task - The task to dispatch
 * @returns DispatchResult indicating success/failure
 */
export async function dispatchTask(
  task: TaskDispatch
): Promise<DispatchResult> {
  // Get available nodes
  const availableNodes = getAvailableNodes();

  if (availableNodes.length === 0) {
    return {
      dispatched: false,
      error: 'No compute nodes available',
    };
  }

  // Sort by load (least loaded first)
  availableNodes.sort((a, b) => {
    const loadA = a.currentTasks / a.maxConcurrentTasks;
    const loadB = b.currentTasks / b.maxConcurrentTasks;
    return loadA - loadB;
  });

  // Try to dispatch to the least loaded node
  for (const node of availableNodes) {
    const result = await tryDispatchToNode(node, task);
    if (result.success) {
      // Update node task count
      node.currentTasks++;

      return {
        dispatched: true,
        nodeId: node.id,
      };
    }
  }

  return {
    dispatched: false,
    error: 'All available nodes rejected the task',
  };
}

/**
 * Get nodes that are online and have available capacity
 */
function getAvailableNodes(): ComputeNode[] {
  return Array.from(nodeRegistry.values()).filter(
    (node) =>
      node.status === 'online' &&
      node.currentTasks < node.maxConcurrentTasks
  );
}

/**
 * Attempt to dispatch a task to a specific node (stub)
 *
 * In production, this would:
 * 1. Make HTTP POST to node's /tasks endpoint
 * 2. Handle connection errors and timeouts
 * 3. Verify task was accepted
 */
async function tryDispatchToNode(
  node: ComputeNode,
  task: TaskDispatch
): Promise<{ success: boolean; error?: string }> {
  // TODO: Implement actual HTTP dispatch to compute node
  // This is a stub that simulates successful dispatch

  // Simulate network latency
  await new Promise((resolve) => setTimeout(resolve, 50));

  // Stub: 90% success rate for mock
  if (Math.random() > 0.1) {
    console.log(
      `[STUB] Dispatched task ${task.taskId} to node ${node.id} (${node.hostname})`
    );
    return { success: true };
  }

  return {
    success: false,
    error: `Node ${node.id} temporarily unavailable`,
  };
}

/**
 * Register a compute node (stub)
 */
export function registerNode(
  id: string,
  hostname: string,
  url: string
): void {
  nodeRegistry.set(id, {
    id,
    hostname,
    url,
    status: 'online',
    lastHeartbeat: new Date(),
    currentTasks: 0,
    maxConcurrentTasks: 4,
  });
}

/**
 * Update node status (stub)
 */
export function updateNodeStatus(
  id: string,
  status: 'online' | 'offline' | 'busy',
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
 * Handle node heartbeat (stub)
 */
export function handleHeartbeat(
  id: string,
  currentTasks: number
): void {
  const node = nodeRegistry.get(id);
  if (node) {
    node.lastHeartbeat = new Date();
    node.currentTasks = currentTasks;
    node.status = 'online';
  }
}

/**
 * Get all registered nodes
 */
export function getNodes(): ComputeNode[] {
  return Array.from(nodeRegistry.values());
}

/**
 * Get a specific node by ID
 */
export function getNode(id: string): ComputeNode | undefined {
  return nodeRegistry.get(id);
}
