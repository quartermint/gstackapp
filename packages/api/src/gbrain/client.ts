/**
 * GbrainClient — MCP client wrapper for gbrain knowledge server.
 *
 * Connects to the gbrain MCP server via SSH to Mac Mini.
 * Maps design-doc tool names to actual gbrain operations:
 *   - gbrain_search -> query (hybrid search)
 *   - gbrain_entity -> get_page (entity lookup)
 *   - gbrain_related -> traverse_graph (graph traversal)
 *
 * T-19-02: SSH command is hardcoded; request text passed as MCP tool arguments (JSON), never shell args.
 * T-19-03: ConnectTimeout=5 on SSH prevents hanging.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { z } from 'zod'
import {
  gbrainSearchResultSchema,
  gbrainEntitySchema,
  gbrainRelatedSchema,
  type GbrainSearchResult,
  type GbrainEntity,
  type GbrainRelated,
} from './types'

export class GbrainClient {
  private client: Client | null = null
  private transport: StdioClientTransport | null = null
  private connected = false

  /**
   * Connect to gbrain MCP server via SSH to Mac Mini.
   * Returns true on success, false on failure (graceful degradation).
   */
  async connect(): Promise<boolean> {
    try {
      this.transport = new StdioClientTransport({
        command: 'ssh',
        args: [
          '-o', 'ConnectTimeout=5',
          'ryans-mac-mini',
          'cd /Volumes/4tb/gbrain && bun run src/cli.ts serve',
        ],
      })
      this.client = new Client(
        { name: 'gstackapp', version: '1.0.0' },
        { capabilities: {} },
      )
      await this.client.connect(this.transport)
      this.connected = true
      return true
    } catch {
      this.connected = false
      return false
    }
  }

  /**
   * Design doc: gbrain_search -> actual tool: query (hybrid search).
   * Returns empty array if not connected or on parse failure.
   */
  async search(query: string, limit = 10): Promise<GbrainSearchResult[]> {
    if (!this.connected) return []
    try {
      const result = await this.client!.callTool({
        name: 'query',
        arguments: { query, limit },
      })
      return this.parseArrayResult(result, gbrainSearchResultSchema)
    } catch (err) {
      console.warn('[gbrain] search failed:', err)
      return []
    }
  }

  /**
   * Design doc: gbrain_entity -> actual tool: get_page.
   * Uses fuzzy=true for slug resolution.
   * Returns null if not connected or on parse failure.
   */
  async getEntity(slug: string): Promise<GbrainEntity | null> {
    if (!this.connected) return null
    try {
      const result = await this.client!.callTool({
        name: 'get_page',
        arguments: { slug, fuzzy: true },
      })
      return this.parseObjectResult(result, gbrainEntitySchema)
    } catch (err) {
      console.warn('[gbrain] getEntity failed:', err)
      return null
    }
  }

  /**
   * Design doc: gbrain_related -> actual tool: traverse_graph.
   * Returns empty array if not connected or on parse failure.
   */
  async getRelated(slug: string, depth = 2): Promise<GbrainRelated[]> {
    if (!this.connected) return []
    try {
      const result = await this.client!.callTool({
        name: 'traverse_graph',
        arguments: { slug, depth },
      })
      return this.parseArrayResult(result, gbrainRelatedSchema)
    } catch (err) {
      console.warn('[gbrain] getRelated failed:', err)
      return []
    }
  }

  /**
   * Close the SSH transport and mark as disconnected.
   */
  async disconnect(): Promise<void> {
    if (this.transport) {
      await this.transport.close()
    }
    this.connected = false
  }

  get isConnected(): boolean {
    return this.connected
  }

  // ── Parse helpers ──────────────────────────────────────────────────────

  /**
   * Extract JSON text from MCP content block and validate as array with Zod.
   * MCP callTool returns { content: [{ type: 'text', text: '...' }] }.
   */
  private parseArrayResult<T>(result: unknown, schema: z.ZodType<T>): T[] {
    try {
      const text = this.extractText(result)
      if (!text) return []
      const parsed = JSON.parse(text)
      const arr = Array.isArray(parsed) ? parsed : [parsed]
      return arr.map(item => schema.parse(item))
    } catch (err) {
      console.warn('[gbrain] parse array failed:', err)
      return []
    }
  }

  /**
   * Extract JSON text from MCP content block and validate as object with Zod.
   */
  private parseObjectResult<T>(result: unknown, schema: z.ZodType<T>): T | null {
    try {
      const text = this.extractText(result)
      if (!text) return null
      const parsed = JSON.parse(text)
      return schema.parse(parsed)
    } catch (err) {
      console.warn('[gbrain] parse object failed:', err)
      return null
    }
  }

  /**
   * Extract text content from MCP tool result.
   * Expected shape: { content: [{ type: 'text', text: '...' }] }
   */
  private extractText(result: unknown): string | null {
    if (!result || typeof result !== 'object') return null
    const r = result as { content?: Array<{ type: string; text: string }> }
    if (!r.content || !Array.isArray(r.content) || r.content.length === 0) return null
    const first = r.content[0]
    if (first.type !== 'text' || typeof first.text !== 'string') return null
    return first.text
  }
}
