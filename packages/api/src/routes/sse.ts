import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { pipelineBus, type PipelineEvent } from '../events/bus'

const sseApp = new Hono()

let eventCounter = 0

sseApp.get('/sse', (c) => {
  return streamSSE(c, async (stream) => {
    // Handler for pipeline events
    const handler = (event: PipelineEvent) => {
      eventCounter++
      stream.writeSSE({
        data: JSON.stringify(event),
        event: event.type,
        id: String(eventCounter),
      })
    }

    // Subscribe to pipeline events
    pipelineBus.on('pipeline:event', handler)

    // Cleanup on client disconnect
    stream.onAbort(() => {
      pipelineBus.off('pipeline:event', handler)
    })

    // Heartbeat loop: send every 15 seconds to keep connection alive
    while (true) {
      await stream.writeSSE({
        data: '',
        event: 'heartbeat',
        id: '',
      })
      await stream.sleep(15000)
    }
  })
})

export default sseApp
