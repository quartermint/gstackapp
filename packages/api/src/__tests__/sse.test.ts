import { describe, it, expect } from 'vitest'
import './helpers/test-db'
import app from '../index'
import { pipelineBus } from '../events/bus'

describe('GET /api/sse', () => {
  it('returns response with Content-Type text/event-stream', async () => {
    const res = await app.request('/api/sse')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/event-stream')
  })

  it('delivers pipeline events emitted on the bus to SSE clients', async () => {
    const res = await app.request('/api/sse')
    expect(res.status).toBe(200)

    // Read from the stream body
    const reader = res.body!.getReader()
    const decoder = new TextDecoder()

    // Read the first chunk (heartbeat)
    const firstChunk = await reader.read()
    const heartbeatText = decoder.decode(firstChunk.value)
    expect(heartbeatText).toContain('event: heartbeat')

    // Emit a pipeline event
    pipelineBus.emit('pipeline:event', {
      type: 'pipeline:started',
      runId: 'test-run-123',
      timestamp: '2026-03-31T00:00:00Z',
    })

    // Read the next chunk (should contain our event)
    const secondChunk = await reader.read()
    const eventText = decoder.decode(secondChunk.value)
    expect(eventText).toContain('event: pipeline:started')
    expect(eventText).toContain('test-run-123')

    // Cancel the reader to clean up
    await reader.cancel()
  })
})
