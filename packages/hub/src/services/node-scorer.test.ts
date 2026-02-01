import { describe, it, expect } from 'vitest';
import {
  scoreNodes,
  getBestNode,
  hasCapableNode,
  NodeForScoring,
  TaskRequirements,
  DEFAULT_SCORING_WEIGHTS,
} from './node-scorer.js';

describe('Node Scorer', () => {
  const createNode = (overrides: Partial<NodeForScoring> = {}): NodeForScoring => ({
    id: 'node-1',
    hostname: 'test-node',
    currentTasks: 0,
    maxConcurrentTasks: 4,
    load: 0,
    capabilities: {
      cpuCores: 8,
      memoryMb: 16384,
      sandboxEnabled: true,
      platform: 'darwin',
      arch: 'arm64',
    },
    tags: [],
    ...overrides,
  });

  describe('scoreNodes', () => {
    it('should return empty array for empty input', () => {
      const result = scoreNodes([], {});
      expect(result).toEqual([]);
    });

    it('should score a single node', () => {
      const nodes = [createNode()];
      const result = scoreNodes(nodes, {});

      expect(result).toHaveLength(1);
      expect(result[0]!.node.id).toBe('node-1');
      expect(result[0]!.score).toBeGreaterThan(0);
      expect(result[0]!.meetsRequirements).toBe(true);
    });

    it('should include score breakdown', () => {
      const nodes = [createNode()];
      const result = scoreNodes(nodes, {});

      expect(result[0]!.breakdown).toHaveProperty('load');
      expect(result[0]!.breakdown).toHaveProperty('capabilityMatch');
      expect(result[0]!.breakdown).toHaveProperty('affinity');
    });

    describe('load scoring', () => {
      it('should score lower load nodes higher', () => {
        const nodes = [
          createNode({ id: 'low-load', currentTasks: 0, load: 0.1 }),
          createNode({ id: 'high-load', currentTasks: 3, load: 0.8 }),
        ];

        const result = scoreNodes(nodes, {});

        expect(result[0]!.node.id).toBe('low-load');
        expect(result[0]!.breakdown.load).toBeGreaterThan(result[1]!.breakdown.load);
      });

      it('should consider task load percentage', () => {
        const nodes = [
          createNode({ id: 'low-tasks', currentTasks: 1, maxConcurrentTasks: 4 }),
          createNode({ id: 'high-tasks', currentTasks: 3, maxConcurrentTasks: 4 }),
        ];

        const result = scoreNodes(nodes, {});

        expect(result[0]!.node.id).toBe('low-tasks');
      });
    });

    describe('capability matching', () => {
      it('should match required tags', () => {
        const nodes = [
          createNode({ id: 'has-gpu', tags: ['gpu', 'high-memory'] }),
          createNode({ id: 'no-gpu', tags: ['standard'] }),
        ];

        const requirements: TaskRequirements = {
          requiredCapabilities: ['gpu'],
        };

        const result = scoreNodes(nodes, requirements, { filterDisqualified: false });

        const gpuNode = result.find((r) => r.node.id === 'has-gpu');
        const noGpuNode = result.find((r) => r.node.id === 'no-gpu');

        expect(gpuNode!.breakdown.capabilityMatch).toBeGreaterThan(
          noGpuNode!.breakdown.capabilityMatch
        );
      });

      it('should filter nodes missing all required capabilities', () => {
        const nodes = [
          createNode({ id: 'has-gpu', tags: ['gpu'] }),
          createNode({ id: 'no-gpu', tags: ['standard'] }),
        ];

        const requirements: TaskRequirements = {
          requiredCapabilities: ['gpu'],
        };

        const result = scoreNodes(nodes, requirements, { filterDisqualified: true });

        expect(result).toHaveLength(1);
        expect(result[0].node.id).toBe('has-gpu');
      });

      it('should include disqualification reasons', () => {
        const nodes = [createNode({ id: 'no-gpu', tags: [] })];

        const requirements: TaskRequirements = {
          requiredCapabilities: ['gpu', 'llm-inference'],
        };

        const result = scoreNodes(nodes, requirements, { filterDisqualified: false });

        expect(result[0].meetsRequirements).toBe(false);
        expect(result[0].disqualificationReasons).toContain(
          'Missing required capabilities: gpu, llm-inference'
        );
      });

      it('should prefer matching platform', () => {
        const nodes = [
          createNode({
            id: 'darwin-node',
            capabilities: {
              cpuCores: 8,
              memoryMb: 16384,
              sandboxEnabled: true,
              platform: 'darwin',
              arch: 'arm64',
            },
          }),
          createNode({
            id: 'linux-node',
            capabilities: {
              cpuCores: 8,
              memoryMb: 16384,
              sandboxEnabled: true,
              platform: 'linux',
              arch: 'x64',
            },
          }),
        ];

        const requirements: TaskRequirements = {
          preferredPlatform: 'darwin',
        };

        const result = scoreNodes(nodes, requirements);

        expect(result[0].node.id).toBe('darwin-node');
      });

      it('should check minimum memory requirements', () => {
        const nodes = [
          createNode({
            id: 'low-mem',
            capabilities: {
              cpuCores: 8,
              memoryMb: 4096,
              sandboxEnabled: true,
              platform: 'darwin',
              arch: 'arm64',
            },
          }),
        ];

        const requirements: TaskRequirements = {
          minMemoryMb: 8192,
        };

        const result = scoreNodes(nodes, requirements, { filterDisqualified: false });

        expect(result[0].meetsRequirements).toBe(false);
        expect(result[0].disqualificationReasons).toContain(
          'Insufficient memory: 4096MB < 8192MB'
        );
      });

      it('should check minimum CPU requirements', () => {
        const nodes = [
          createNode({
            id: 'low-cpu',
            capabilities: {
              cpuCores: 2,
              memoryMb: 16384,
              sandboxEnabled: true,
              platform: 'darwin',
              arch: 'arm64',
            },
          }),
        ];

        const requirements: TaskRequirements = {
          minCpuCores: 4,
        };

        const result = scoreNodes(nodes, requirements, { filterDisqualified: false });

        expect(result[0].meetsRequirements).toBe(false);
        expect(result[0].disqualificationReasons).toContain(
          'Insufficient CPU cores: 2 < 4'
        );
      });
    });

    describe('affinity scoring', () => {
      it('should prefer previous node', () => {
        const nodes = [
          createNode({ id: 'node-1' }),
          createNode({ id: 'node-2' }),
        ];

        const requirements: TaskRequirements = {
          previousNodeId: 'node-2',
        };

        const result = scoreNodes(nodes, requirements);

        expect(result[0].node.id).toBe('node-2');
        expect(result[0].breakdown.affinity).toBeGreaterThan(
          result[1].breakdown.affinity
        );
      });

      it('should prefer preferred nodes', () => {
        const nodes = [
          createNode({ id: 'node-1' }),
          createNode({ id: 'node-2' }),
        ];

        const requirements: TaskRequirements = {
          preferredNodeIds: ['node-1'],
        };

        const result = scoreNodes(nodes, requirements);

        const node1 = result.find((r) => r.node.id === 'node-1');
        const node2 = result.find((r) => r.node.id === 'node-2');

        expect(node1!.breakdown.affinity).toBeGreaterThan(node2!.breakdown.affinity);
      });
    });

    describe('weighted scoring', () => {
      it('should use default weights', () => {
        expect(DEFAULT_SCORING_WEIGHTS.load).toBe(0.4);
        expect(DEFAULT_SCORING_WEIGHTS.capabilityMatch).toBe(0.5);
        expect(DEFAULT_SCORING_WEIGHTS.affinity).toBe(0.1);
      });

      it('should allow custom weights', () => {
        const nodes = [
          createNode({
            id: 'low-load',
            currentTasks: 0,
            load: 0,
            tags: [],
          }),
          createNode({
            id: 'has-gpu',
            currentTasks: 2,
            load: 0.5,
            tags: ['gpu'],
          }),
        ];

        const requirements: TaskRequirements = {
          requiredCapabilities: ['gpu'],
        };

        // With high capability weight, the node with GPU should win
        const highCapabilityWeight = scoreNodes(nodes, requirements, {
          weights: { load: 0.1, capabilityMatch: 0.8, affinity: 0.1 },
          filterDisqualified: false,
        });

        expect(highCapabilityWeight[0].node.id).toBe('has-gpu');

        // With high load weight, the low-load node should win
        const highLoadWeight = scoreNodes(nodes, requirements, {
          weights: { load: 0.9, capabilityMatch: 0.05, affinity: 0.05 },
          filterDisqualified: false,
        });

        expect(highLoadWeight[0].node.id).toBe('low-load');
      });
    });
  });

  describe('getBestNode', () => {
    it('should return null for empty input', () => {
      const result = getBestNode([]);
      expect(result).toBeNull();
    });

    it('should return the highest scored node', () => {
      const nodes = [
        createNode({ id: 'high-load', currentTasks: 3, load: 0.8 }),
        createNode({ id: 'low-load', currentTasks: 0, load: 0.1 }),
      ];

      const result = getBestNode(nodes);

      expect(result).not.toBeNull();
      expect(result!.node.id).toBe('low-load');
    });

    it('should return null if no nodes meet requirements', () => {
      const nodes = [createNode({ id: 'no-gpu', tags: [] })];

      const requirements: TaskRequirements = {
        requiredCapabilities: ['gpu'],
      };

      const result = getBestNode(nodes, requirements);

      expect(result).toBeNull();
    });
  });

  describe('hasCapableNode', () => {
    it('should return false for empty input', () => {
      expect(hasCapableNode([])).toBe(false);
    });

    it('should return true when at least one node meets requirements', () => {
      const nodes = [
        createNode({ id: 'has-gpu', tags: ['gpu'] }),
        createNode({ id: 'no-gpu', tags: [] }),
      ];

      const requirements: TaskRequirements = {
        requiredCapabilities: ['gpu'],
      };

      expect(hasCapableNode(nodes, requirements)).toBe(true);
    });

    it('should return false when no nodes meet requirements', () => {
      const nodes = [
        createNode({ id: 'no-gpu-1', tags: [] }),
        createNode({ id: 'no-gpu-2', tags: ['standard'] }),
      ];

      const requirements: TaskRequirements = {
        requiredCapabilities: ['gpu'],
      };

      expect(hasCapableNode(nodes, requirements)).toBe(false);
    });

    it('should return true with no requirements', () => {
      const nodes = [createNode()];
      expect(hasCapableNode(nodes)).toBe(true);
    });
  });
});
