/**
 * In-memory request queue for all-providers-degraded scenario.
 *
 * When every provider in the chain is degraded, requests are queued
 * and drained when the first provider recovers from cooldown.
 */

import type { CompletionParams, CompletionResult, LLMProvider } from '../types'
import { AllProvidersDegradedError } from './errors'

interface QueueEntry {
  params: CompletionParams
  resolve: (result: CompletionResult) => void
  reject: (error: Error) => void
  stage?: string
}

export class RequestQueue {
  private queue: QueueEntry[] = []

  constructor(private maxSize: number) {}

  /**
   * Enqueue a request. Returns a Promise that resolves when the request is
   * eventually processed by a recovered provider.
   *
   * Throws AllProvidersDegradedError when queue is full.
   */
  enqueue(params: CompletionParams, stage?: string): Promise<CompletionResult> {
    if (this.queue.length >= this.maxSize) {
      throw new AllProvidersDegradedError(['queue-full'])
    }

    return new Promise<CompletionResult>((resolve, reject) => {
      this.queue.push({ params, resolve, reject, stage })
    })
  }

  /**
   * Process all queued requests sequentially through the given provider.
   * Resolves/rejects each stored promise individually.
   */
  async drain(provider: LLMProvider): Promise<void> {
    const entries = this.queue.splice(0, this.queue.length)

    for (const entry of entries) {
      try {
        const result = await provider.createCompletion(entry.params)
        entry.resolve(result)
      } catch (err) {
        entry.reject(err instanceof Error ? err : new Error(String(err)))
      }
    }
  }

  /** Current number of queued requests. */
  get size(): number {
    return this.queue.length
  }

  /** Reject all queued requests with AllProvidersDegradedError. */
  clear(): void {
    const entries = this.queue.splice(0, this.queue.length)
    for (const entry of entries) {
      entry.reject(new AllProvidersDegradedError(['all-providers']))
    }
  }
}
