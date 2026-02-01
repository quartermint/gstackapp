/**
 * Node scoring algorithm for intelligent task dispatch
 *
 * Calculates a composite score for each node based on:
 * - Load (40%): Current utilization and capacity
 * - Capability match (50%): Required vs available capabilities
 * - Affinity (10%): Task-node affinity based on tags or history
 */

import { NodeCapabilities } from '@mission-control/shared';

/**
 * Scoring weights configuration
 */
export interface ScoringWeights {
  /** Weight for load score (0-1) */
  load: number;
  /** Weight for capability match score (0-1) */
  capabilityMatch: number;
  /** Weight for affinity score (0-1) */
  affinity: number;
}

/**
 * Default scoring weights
 */
export const DEFAULT_SCORING_WEIGHTS: ScoringWeights = {
  load: 0.4,
  capabilityMatch: 0.5,
  affinity: 0.1,
};

/**
 * Node information for scoring
 */
export interface NodeForScoring {
  /** Node ID */
  id: string;
  /** Node hostname */
  hostname: string;
  /** Current active tasks */
  currentTasks: number;
  /** Maximum concurrent tasks */
  maxConcurrentTasks: number;
  /** System load (0-1) */
  load: number;
  /** Node capabilities */
  capabilities?: NodeCapabilities;
  /** Node tags for matching */
  tags?: string[];
}

/**
 * Task requirements for scoring
 */
export interface TaskRequirements {
  /** Required capabilities (tags) */
  requiredCapabilities?: string[];
  /** Preferred platform */
  preferredPlatform?: 'darwin' | 'linux';
  /** Preferred architecture */
  preferredArch?: 'arm64' | 'x64';
  /** Minimum memory required (MB) */
  minMemoryMb?: number;
  /** Minimum CPU cores required */
  minCpuCores?: number;
  /** Preferred node IDs (for affinity) */
  preferredNodeIds?: string[];
  /** Previous node ID (for affinity) */
  previousNodeId?: string;
}

/**
 * Scored node result
 */
export interface ScoredNode {
  /** The node */
  node: NodeForScoring;
  /** Total composite score (0-100) */
  score: number;
  /** Individual score components */
  breakdown: {
    /** Load score (0-100) */
    load: number;
    /** Capability match score (0-100) */
    capabilityMatch: number;
    /** Affinity score (0-100) */
    affinity: number;
  };
  /** Whether node meets minimum requirements */
  meetsRequirements: boolean;
  /** Reasons if requirements not met */
  disqualificationReasons: string[];
}

/**
 * Node scorer configuration
 */
export interface NodeScorerConfig {
  /** Scoring weights */
  weights: ScoringWeights;
  /** Whether to filter out nodes that don't meet requirements */
  filterDisqualified: boolean;
}

/**
 * Default node scorer configuration
 */
export const DEFAULT_NODE_SCORER_CONFIG: NodeScorerConfig = {
  weights: DEFAULT_SCORING_WEIGHTS,
  filterDisqualified: true,
};

/**
 * Calculate the load score for a node
 * Higher score = better (lower load)
 * @param node - The node to score
 * @returns Load score (0-100)
 */
function calculateLoadScore(node: NodeForScoring): number {
  // Task load percentage (inverted - lower is better)
  const taskLoadPercent = node.currentTasks / node.maxConcurrentTasks;
  const taskScore = (1 - taskLoadPercent) * 100;

  // System load (inverted - lower is better)
  const systemScore = (1 - node.load) * 100;

  // Weighted combination: 70% task load, 30% system load
  return taskScore * 0.7 + systemScore * 0.3;
}

/**
 * Calculate capability match score
 * Higher score = better match
 * @param node - The node to score
 * @param requirements - Task requirements
 * @returns Capability match score (0-100)
 */
function calculateCapabilityMatchScore(
  node: NodeForScoring,
  requirements: TaskRequirements
): { score: number; meetsRequirements: boolean; reasons: string[] } {
  const reasons: string[] = [];
  let score = 100;
  let meetsRequirements = true;

  // Check required capabilities (tags)
  if (requirements.requiredCapabilities && requirements.requiredCapabilities.length > 0) {
    const nodeTags = node.tags || [];
    const missingTags = requirements.requiredCapabilities.filter(
      (tag) => !nodeTags.includes(tag)
    );

    if (missingTags.length > 0) {
      // Reduce score proportionally to missing tags
      const matchRatio =
        1 - missingTags.length / requirements.requiredCapabilities.length;
      score *= matchRatio;

      if (missingTags.length === requirements.requiredCapabilities.length) {
        // No required tags matched - disqualify
        meetsRequirements = false;
        reasons.push(`Missing required capabilities: ${missingTags.join(', ')}`);
      }
    }
  }

  // Check platform preference
  if (requirements.preferredPlatform && node.capabilities) {
    if (node.capabilities.platform === requirements.preferredPlatform) {
      // Bonus for matching platform
      score = Math.min(100, score + 10);
    } else {
      // Penalty for non-matching platform
      score = Math.max(0, score - 20);
    }
  }

  // Check architecture preference
  if (requirements.preferredArch && node.capabilities) {
    if (node.capabilities.arch === requirements.preferredArch) {
      // Bonus for matching architecture
      score = Math.min(100, score + 10);
    } else {
      // Penalty for non-matching architecture
      score = Math.max(0, score - 15);
    }
  }

  // Check minimum memory
  if (requirements.minMemoryMb && node.capabilities) {
    if (node.capabilities.memoryMb < requirements.minMemoryMb) {
      meetsRequirements = false;
      reasons.push(
        `Insufficient memory: ${node.capabilities.memoryMb}MB < ${requirements.minMemoryMb}MB`
      );
    }
  }

  // Check minimum CPU cores
  if (requirements.minCpuCores && node.capabilities) {
    if (node.capabilities.cpuCores < requirements.minCpuCores) {
      meetsRequirements = false;
      reasons.push(
        `Insufficient CPU cores: ${node.capabilities.cpuCores} < ${requirements.minCpuCores}`
      );
    }
  }

  return { score, meetsRequirements, reasons };
}

/**
 * Calculate affinity score
 * Higher score = better affinity
 * @param node - The node to score
 * @param requirements - Task requirements
 * @returns Affinity score (0-100)
 */
function calculateAffinityScore(
  node: NodeForScoring,
  requirements: TaskRequirements
): number {
  let score = 50; // Neutral baseline

  // Check if this node ran the previous instance of this task
  if (requirements.previousNodeId === node.id) {
    // Strong affinity for continuity
    score += 40;
  }

  // Check if this is a preferred node
  if (requirements.preferredNodeIds?.includes(node.id)) {
    score += 30;
  }

  return Math.min(100, Math.max(0, score));
}

/**
 * Score and rank nodes for task dispatch
 * @param nodes - Available nodes
 * @param requirements - Task requirements
 * @param config - Scorer configuration
 * @returns Ranked list of scored nodes (highest score first)
 */
export function scoreNodes(
  nodes: NodeForScoring[],
  requirements: TaskRequirements = {},
  config: Partial<NodeScorerConfig> = {}
): ScoredNode[] {
  const fullConfig: NodeScorerConfig = {
    ...DEFAULT_NODE_SCORER_CONFIG,
    ...config,
    weights: { ...DEFAULT_SCORING_WEIGHTS, ...config.weights },
  };

  const scoredNodes: ScoredNode[] = nodes.map((node) => {
    // Calculate individual scores
    const loadScore = calculateLoadScore(node);
    const capabilityResult = calculateCapabilityMatchScore(node, requirements);
    const affinityScore = calculateAffinityScore(node, requirements);

    // Calculate weighted composite score
    const compositeScore =
      loadScore * fullConfig.weights.load +
      capabilityResult.score * fullConfig.weights.capabilityMatch +
      affinityScore * fullConfig.weights.affinity;

    return {
      node,
      score: Math.round(compositeScore * 100) / 100,
      breakdown: {
        load: Math.round(loadScore * 100) / 100,
        capabilityMatch: Math.round(capabilityResult.score * 100) / 100,
        affinity: Math.round(affinityScore * 100) / 100,
      },
      meetsRequirements: capabilityResult.meetsRequirements,
      disqualificationReasons: capabilityResult.reasons,
    };
  });

  // Filter disqualified nodes if configured
  const filteredNodes = fullConfig.filterDisqualified
    ? scoredNodes.filter((sn) => sn.meetsRequirements)
    : scoredNodes;

  // Sort by score (highest first)
  return filteredNodes.sort((a, b) => b.score - a.score);
}

/**
 * Get the best node for a task
 * @param nodes - Available nodes
 * @param requirements - Task requirements
 * @param config - Scorer configuration
 * @returns The best node, or null if no suitable node found
 */
export function getBestNode(
  nodes: NodeForScoring[],
  requirements: TaskRequirements = {},
  config: Partial<NodeScorerConfig> = {}
): ScoredNode | null {
  const scored = scoreNodes(nodes, requirements, config);
  const best = scored[0];
  return best !== undefined ? best : null;
}

/**
 * Check if any node can handle the task requirements
 * @param nodes - Available nodes
 * @param requirements - Task requirements
 * @returns true if at least one node can handle the task
 */
export function hasCapableNode(
  nodes: NodeForScoring[],
  requirements: TaskRequirements = {}
): boolean {
  const scored = scoreNodes(nodes, requirements, { filterDisqualified: true });
  return scored.length > 0;
}
