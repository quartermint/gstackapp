/**
 * Timeout monitor — detects requests stalled for >5 minutes.
 *
 * Per OP-08: Requests running for >5 minutes without progress trigger timeout detection.
 * T-18-08: One timer per request; timer cleared on completion; retry validates status.
 */

import { pipelineBus } from '../events/bus'

// Track active timeout timers per request
const activeTimers = new Map<string, ReturnType<typeof setTimeout>>()

/**
 * Start a timeout monitor for a request.
 * If a timer already exists for this requestId, it is replaced.
 *
 * @param requestId - The operator request ID
 * @param timeoutMs - Timeout in milliseconds (default: 5 minutes per OP-08)
 */
export function startTimeoutMonitor(
  requestId: string,
  timeoutMs: number = 300_000, // 5 minutes per OP-08
): void {
  // Clear any existing timer for this request (T-18-08: one timer per request)
  clearTimeoutMonitor(requestId)

  const timer = setTimeout(async () => {
    // Emit operator:error SSE event with timeout type
    pipelineBus.emit('pipeline:event', {
      type: 'operator:error',
      runId: requestId,
      errorType: 'timeout',
      message: 'Taking longer than expected. The system is still working on your request. You can wait or ask Ryan to check on it.',
      timestamp: new Date().toISOString(),
    })

    // Clean up timer reference
    activeTimers.delete(requestId)
  }, timeoutMs)

  activeTimers.set(requestId, timer)
}

/**
 * Clear the timeout monitor for a request.
 * Called on pipeline completion to prevent false timeout events.
 */
export function clearTimeoutMonitor(requestId: string): void {
  const timer = activeTimers.get(requestId)
  if (timer) {
    clearTimeout(timer)
    activeTimers.delete(requestId)
  }
}
