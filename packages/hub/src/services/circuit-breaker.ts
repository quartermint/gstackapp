/**
 * Circuit breaker implementation for node failure handling
 *
 * Implements the circuit breaker pattern to prevent cascading failures
 * when compute nodes become unavailable or unreliable.
 *
 * State machine:
 * - CLOSED: Normal operation, requests pass through
 * - OPEN: Circuit tripped, requests fail immediately
 * - HALF_OPEN: Testing recovery, limited requests allowed
 */

/**
 * Circuit breaker state
 */
export type CircuitState = 'closed' | 'open' | 'half-open';

/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerConfig {
  /** Number of failures before opening the circuit */
  failureThreshold: number;
  /** Time in ms before attempting recovery (half-open state) */
  recoveryTimeoutMs: number;
  /** Number of successful probes required to close the circuit */
  halfOpenSuccessThreshold: number;
  /** Time window for counting failures (ms) */
  failureWindowMs: number;
}

/**
 * Default circuit breaker configuration
 */
export const DEFAULT_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  recoveryTimeoutMs: 30_000,
  halfOpenSuccessThreshold: 2,
  failureWindowMs: 60_000,
};

/**
 * Per-node circuit state
 */
interface NodeCircuitState {
  /** Current state */
  state: CircuitState;
  /** Failure timestamps within the window */
  failures: number[];
  /** Timestamp when circuit opened */
  openedAt: number | null;
  /** Consecutive successes in half-open state */
  halfOpenSuccesses: number;
  /** Total failures since creation */
  totalFailures: number;
  /** Total successes since creation */
  totalSuccesses: number;
}

/**
 * Circuit breaker for managing node availability
 */
export class CircuitBreaker {
  private readonly config: CircuitBreakerConfig;
  private readonly circuits: Map<string, NodeCircuitState>;

  constructor(config: Partial<CircuitBreakerConfig> = {}) {
    this.config = { ...DEFAULT_CIRCUIT_BREAKER_CONFIG, ...config };
    this.circuits = new Map();
  }

  /**
   * Get or create circuit state for a node
   */
  private getCircuit(nodeId: string): NodeCircuitState {
    let circuit = this.circuits.get(nodeId);
    if (!circuit) {
      circuit = {
        state: 'closed',
        failures: [],
        openedAt: null,
        halfOpenSuccesses: 0,
        totalFailures: 0,
        totalSuccesses: 0,
      };
      this.circuits.set(nodeId, circuit);
    }
    return circuit;
  }

  /**
   * Clean up old failures outside the window
   */
  private cleanupFailures(circuit: NodeCircuitState): void {
    const now = Date.now();
    const windowStart = now - this.config.failureWindowMs;
    circuit.failures = circuit.failures.filter((ts) => ts > windowStart);
  }

  /**
   * Check if a node is available for requests
   * @param nodeId - The node ID to check
   * @returns true if requests should be allowed, false otherwise
   */
  isAvailable(nodeId: string): boolean {
    const circuit = this.getCircuit(nodeId);

    switch (circuit.state) {
      case 'closed':
        return true;

      case 'open': {
        // Check if recovery timeout has passed
        const now = Date.now();
        if (
          circuit.openedAt &&
          now - circuit.openedAt >= this.config.recoveryTimeoutMs
        ) {
          // Transition to half-open
          circuit.state = 'half-open';
          circuit.halfOpenSuccesses = 0;
          console.log(
            `[circuit-breaker] Node ${nodeId} transitioning to half-open state`
          );
          return true;
        }
        return false;
      }

      case 'half-open':
        // Allow limited requests to test recovery
        return true;

      default:
        return true;
    }
  }

  /**
   * Record a successful request to a node
   * @param nodeId - The node ID
   */
  recordSuccess(nodeId: string): void {
    const circuit = this.getCircuit(nodeId);
    circuit.totalSuccesses++;

    switch (circuit.state) {
      case 'closed':
        // Reset failures on success
        this.cleanupFailures(circuit);
        break;

      case 'half-open':
        circuit.halfOpenSuccesses++;
        if (circuit.halfOpenSuccesses >= this.config.halfOpenSuccessThreshold) {
          // Close the circuit
          circuit.state = 'closed';
          circuit.failures = [];
          circuit.openedAt = null;
          circuit.halfOpenSuccesses = 0;
          console.log(
            `[circuit-breaker] Node ${nodeId} circuit closed after successful recovery`
          );
        }
        break;

      case 'open':
        // Should not happen, but handle gracefully
        break;
    }
  }

  /**
   * Record a failed request to a node
   * @param nodeId - The node ID
   */
  recordFailure(nodeId: string): void {
    const circuit = this.getCircuit(nodeId);
    const now = Date.now();

    circuit.totalFailures++;
    circuit.failures.push(now);
    this.cleanupFailures(circuit);

    switch (circuit.state) {
      case 'closed':
        if (circuit.failures.length >= this.config.failureThreshold) {
          // Open the circuit
          circuit.state = 'open';
          circuit.openedAt = now;
          console.log(
            `[circuit-breaker] Node ${nodeId} circuit opened after ${circuit.failures.length} failures`
          );
        }
        break;

      case 'half-open':
        // Single failure in half-open state reopens the circuit
        circuit.state = 'open';
        circuit.openedAt = now;
        circuit.halfOpenSuccesses = 0;
        console.log(
          `[circuit-breaker] Node ${nodeId} circuit reopened after failure in half-open state`
        );
        break;

      case 'open':
        // Already open, just update timestamp
        circuit.openedAt = now;
        break;
    }
  }

  /**
   * Get the current state of a node's circuit
   * @param nodeId - The node ID
   * @returns The circuit state
   */
  getState(nodeId: string): CircuitState {
    // First check if we need to transition from open to half-open
    this.isAvailable(nodeId);
    return this.getCircuit(nodeId).state;
  }

  /**
   * Get detailed circuit statistics for a node
   * @param nodeId - The node ID
   * @returns Circuit statistics
   */
  getStats(nodeId: string): {
    state: CircuitState;
    recentFailures: number;
    totalFailures: number;
    totalSuccesses: number;
    halfOpenSuccesses: number;
    openedAt: number | null;
  } {
    const circuit = this.getCircuit(nodeId);
    this.cleanupFailures(circuit);

    return {
      state: circuit.state,
      recentFailures: circuit.failures.length,
      totalFailures: circuit.totalFailures,
      totalSuccesses: circuit.totalSuccesses,
      halfOpenSuccesses: circuit.halfOpenSuccesses,
      openedAt: circuit.openedAt,
    };
  }

  /**
   * Get all circuit states
   * @returns Map of node IDs to their circuit states
   */
  getAllStates(): Map<string, CircuitState> {
    const states = new Map<string, CircuitState>();
    for (const [nodeId] of this.circuits) {
      states.set(nodeId, this.getState(nodeId));
    }
    return states;
  }

  /**
   * Reset a node's circuit to closed state
   * @param nodeId - The node ID
   */
  reset(nodeId: string): void {
    const circuit = this.getCircuit(nodeId);
    circuit.state = 'closed';
    circuit.failures = [];
    circuit.openedAt = null;
    circuit.halfOpenSuccesses = 0;
    console.log(`[circuit-breaker] Node ${nodeId} circuit manually reset`);
  }

  /**
   * Reset all circuits
   */
  resetAll(): void {
    this.circuits.clear();
    console.log('[circuit-breaker] All circuits reset');
  }

  /**
   * Force open a circuit (for testing or maintenance)
   * @param nodeId - The node ID
   */
  forceOpen(nodeId: string): void {
    const circuit = this.getCircuit(nodeId);
    circuit.state = 'open';
    circuit.openedAt = Date.now();
    console.log(`[circuit-breaker] Node ${nodeId} circuit force opened`);
  }

  /**
   * Get the current configuration
   */
  getConfig(): CircuitBreakerConfig {
    return { ...this.config };
  }
}
