import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  CircuitBreaker,
  CircuitBreakerConfig,
  DEFAULT_CIRCUIT_BREAKER_CONFIG,
} from './circuit-breaker.js';

describe('CircuitBreaker', () => {
  let circuitBreaker: CircuitBreaker;

  beforeEach(() => {
    vi.useFakeTimers();
    circuitBreaker = new CircuitBreaker();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('initial state', () => {
    it('should start in closed state for new nodes', () => {
      expect(circuitBreaker.getState('node-1')).toBe('closed');
    });

    it('should allow requests when closed', () => {
      expect(circuitBreaker.isAvailable('node-1')).toBe(true);
    });

    it('should use default configuration', () => {
      const config = circuitBreaker.getConfig();
      expect(config).toEqual(DEFAULT_CIRCUIT_BREAKER_CONFIG);
    });
  });

  describe('failure tracking', () => {
    it('should remain closed after failures below threshold', () => {
      const nodeId = 'node-1';

      // Record failures below threshold (default is 5)
      for (let i = 0; i < 4; i++) {
        circuitBreaker.recordFailure(nodeId);
      }

      expect(circuitBreaker.getState(nodeId)).toBe('closed');
      expect(circuitBreaker.isAvailable(nodeId)).toBe(true);
    });

    it('should open circuit after reaching failure threshold', () => {
      const nodeId = 'node-1';

      // Record failures to reach threshold (default is 5)
      for (let i = 0; i < 5; i++) {
        circuitBreaker.recordFailure(nodeId);
      }

      expect(circuitBreaker.getState(nodeId)).toBe('open');
      expect(circuitBreaker.isAvailable(nodeId)).toBe(false);
    });

    it('should track total failures', () => {
      const nodeId = 'node-1';

      circuitBreaker.recordFailure(nodeId);
      circuitBreaker.recordFailure(nodeId);

      const stats = circuitBreaker.getStats(nodeId);
      expect(stats.totalFailures).toBe(2);
    });
  });

  describe('success tracking', () => {
    it('should track total successes', () => {
      const nodeId = 'node-1';

      circuitBreaker.recordSuccess(nodeId);
      circuitBreaker.recordSuccess(nodeId);

      const stats = circuitBreaker.getStats(nodeId);
      expect(stats.totalSuccesses).toBe(2);
    });

    it('should not transition closed circuit on success', () => {
      const nodeId = 'node-1';

      circuitBreaker.recordSuccess(nodeId);

      expect(circuitBreaker.getState(nodeId)).toBe('closed');
    });
  });

  describe('state transitions', () => {
    it('should transition from open to half-open after recovery timeout', () => {
      const nodeId = 'node-1';
      const config: Partial<CircuitBreakerConfig> = {
        failureThreshold: 2,
        recoveryTimeoutMs: 1000,
      };
      circuitBreaker = new CircuitBreaker(config);

      // Open the circuit
      circuitBreaker.recordFailure(nodeId);
      circuitBreaker.recordFailure(nodeId);
      expect(circuitBreaker.getState(nodeId)).toBe('open');

      // Advance time past recovery timeout
      vi.advanceTimersByTime(1100);

      // Check availability triggers transition
      expect(circuitBreaker.isAvailable(nodeId)).toBe(true);
      expect(circuitBreaker.getState(nodeId)).toBe('half-open');
    });

    it('should transition from half-open to closed after success threshold', () => {
      const nodeId = 'node-1';
      const config: Partial<CircuitBreakerConfig> = {
        failureThreshold: 2,
        recoveryTimeoutMs: 1000,
        halfOpenSuccessThreshold: 2,
      };
      circuitBreaker = new CircuitBreaker(config);

      // Open the circuit
      circuitBreaker.recordFailure(nodeId);
      circuitBreaker.recordFailure(nodeId);

      // Transition to half-open
      vi.advanceTimersByTime(1100);
      circuitBreaker.isAvailable(nodeId);

      // Record successes to close
      circuitBreaker.recordSuccess(nodeId);
      expect(circuitBreaker.getState(nodeId)).toBe('half-open');

      circuitBreaker.recordSuccess(nodeId);
      expect(circuitBreaker.getState(nodeId)).toBe('closed');
    });

    it('should transition from half-open back to open on failure', () => {
      const nodeId = 'node-1';
      const config: Partial<CircuitBreakerConfig> = {
        failureThreshold: 2,
        recoveryTimeoutMs: 1000,
      };
      circuitBreaker = new CircuitBreaker(config);

      // Open the circuit
      circuitBreaker.recordFailure(nodeId);
      circuitBreaker.recordFailure(nodeId);

      // Transition to half-open
      vi.advanceTimersByTime(1100);
      circuitBreaker.isAvailable(nodeId);
      expect(circuitBreaker.getState(nodeId)).toBe('half-open');

      // Fail in half-open state
      circuitBreaker.recordFailure(nodeId);
      expect(circuitBreaker.getState(nodeId)).toBe('open');
    });
  });

  describe('failure window', () => {
    it('should only count failures within the window', () => {
      const nodeId = 'node-1';
      const config: Partial<CircuitBreakerConfig> = {
        failureThreshold: 3,
        failureWindowMs: 5000,
      };
      circuitBreaker = new CircuitBreaker(config);

      // Record 2 failures
      circuitBreaker.recordFailure(nodeId);
      circuitBreaker.recordFailure(nodeId);

      // Advance time to expire the first failures
      vi.advanceTimersByTime(6000);

      // Record 1 more failure
      circuitBreaker.recordFailure(nodeId);

      // Should still be closed because old failures are outside the window
      expect(circuitBreaker.getState(nodeId)).toBe('closed');

      const stats = circuitBreaker.getStats(nodeId);
      expect(stats.recentFailures).toBe(1);
      expect(stats.totalFailures).toBe(3);
    });
  });

  describe('reset', () => {
    it('should reset a single node circuit', () => {
      const nodeId = 'node-1';

      // Open the circuit
      for (let i = 0; i < 5; i++) {
        circuitBreaker.recordFailure(nodeId);
      }
      expect(circuitBreaker.getState(nodeId)).toBe('open');

      // Reset
      circuitBreaker.reset(nodeId);

      expect(circuitBreaker.getState(nodeId)).toBe('closed');
      expect(circuitBreaker.isAvailable(nodeId)).toBe(true);
    });

    it('should reset all circuits', () => {
      // Open multiple circuits
      for (let i = 0; i < 5; i++) {
        circuitBreaker.recordFailure('node-1');
        circuitBreaker.recordFailure('node-2');
      }
      expect(circuitBreaker.getState('node-1')).toBe('open');
      expect(circuitBreaker.getState('node-2')).toBe('open');

      // Reset all
      circuitBreaker.resetAll();

      expect(circuitBreaker.getState('node-1')).toBe('closed');
      expect(circuitBreaker.getState('node-2')).toBe('closed');
    });
  });

  describe('forceOpen', () => {
    it('should force a circuit open', () => {
      const nodeId = 'node-1';

      circuitBreaker.forceOpen(nodeId);

      expect(circuitBreaker.getState(nodeId)).toBe('open');
      expect(circuitBreaker.isAvailable(nodeId)).toBe(false);
    });
  });

  describe('getAllStates', () => {
    it('should return all circuit states', () => {
      circuitBreaker.recordSuccess('node-1');
      circuitBreaker.recordSuccess('node-2');

      // Open node-2
      for (let i = 0; i < 5; i++) {
        circuitBreaker.recordFailure('node-2');
      }

      const states = circuitBreaker.getAllStates();

      expect(states.get('node-1')).toBe('closed');
      expect(states.get('node-2')).toBe('open');
    });
  });

  describe('custom configuration', () => {
    it('should respect custom failure threshold', () => {
      const config: Partial<CircuitBreakerConfig> = {
        failureThreshold: 2,
      };
      circuitBreaker = new CircuitBreaker(config);

      circuitBreaker.recordFailure('node-1');
      expect(circuitBreaker.getState('node-1')).toBe('closed');

      circuitBreaker.recordFailure('node-1');
      expect(circuitBreaker.getState('node-1')).toBe('open');
    });

    it('should respect custom recovery timeout', () => {
      const config: Partial<CircuitBreakerConfig> = {
        failureThreshold: 1,
        recoveryTimeoutMs: 500,
      };
      circuitBreaker = new CircuitBreaker(config);

      circuitBreaker.recordFailure('node-1');
      expect(circuitBreaker.getState('node-1')).toBe('open');

      // Not enough time passed
      vi.advanceTimersByTime(400);
      expect(circuitBreaker.isAvailable('node-1')).toBe(false);

      // Enough time passed
      vi.advanceTimersByTime(200);
      expect(circuitBreaker.isAvailable('node-1')).toBe(true);
    });
  });
});
