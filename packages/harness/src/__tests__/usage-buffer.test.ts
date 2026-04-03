import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'

// -- getHarnessDb --------------------------------------------------------------

describe('getHarnessDb', () => {
  it('returns null when dbPath is undefined', async () => {
    const { getHarnessDb } = await import('../db/client')
    expect(getHarnessDb(undefined)).toBeNull()
  })

  it('returns Database instance for valid path', async () => {
    const { getHarnessDb } = await import('../db/client')
    const tmpPath = `/tmp/harness-test-${Date.now()}.db`
    const db = getHarnessDb(tmpPath)
    expect(db).not.toBeNull()
    expect(db).toBeInstanceOf(Database)
    // Verify WAL mode
    const mode = db!.pragma('journal_mode', { simple: true })
    expect(mode).toBe('wal')
    // Verify table exists
    const tables = db!.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='token_usage'").all()
    expect(tables).toHaveLength(1)
    db!.close()
    // Cleanup
    const fs = await import('node:fs')
    try { fs.unlinkSync(tmpPath); fs.unlinkSync(tmpPath + '-wal'); fs.unlinkSync(tmpPath + '-shm'); } catch {}
  })
})

// -- tokenUsage schema ---------------------------------------------------------

describe('tokenUsage schema', () => {
  it('exports tokenUsage table definition', async () => {
    const { tokenUsage } = await import('../db/schema')
    expect(tokenUsage).toBeDefined()
  })
})

// -- UsageBuffer ---------------------------------------------------------------

describe('UsageBuffer', () => {
  let db: InstanceType<typeof Database>

  beforeEach(() => {
    db = new Database(':memory:')
    db.pragma('journal_mode = WAL')
    db.exec(`CREATE TABLE IF NOT EXISTS token_usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      input_tokens INTEGER NOT NULL,
      output_tokens INTEGER NOT NULL,
      cost_estimate REAL,
      stage TEXT
    )`)
    db.exec(`CREATE INDEX IF NOT EXISTS idx_token_usage_provider_ts ON token_usage(provider, timestamp)`)
  })

  afterEach(() => {
    db.close()
  })

  it('record() adds to internal buffer', async () => {
    const { UsageBuffer } = await import('../db/usage-buffer')
    const buffer = new UsageBuffer(db)
    buffer.record('anthropic', { inputTokens: 100, outputTokens: 50 }, 'ceo')
    expect(buffer.getBufferSize()).toBe(1)
  })

  it('record() does not touch DB', async () => {
    const { UsageBuffer } = await import('../db/usage-buffer')
    const buffer = new UsageBuffer(db)
    buffer.record('anthropic', { inputTokens: 100, outputTokens: 50 })
    const rows = db.prepare('SELECT COUNT(*) as count FROM token_usage').get() as any
    expect(rows.count).toBe(0)
  })

  it('flush() writes records to DB and clears buffer', async () => {
    const { UsageBuffer } = await import('../db/usage-buffer')
    const buffer = new UsageBuffer(db)
    buffer.record('anthropic', { inputTokens: 100, outputTokens: 50 }, 'ceo', 0.01)
    buffer.record('gemini', { inputTokens: 200, outputTokens: 100 }, 'eng')
    buffer.flush()
    expect(buffer.getBufferSize()).toBe(0)
    const rows = db.prepare('SELECT * FROM token_usage ORDER BY id').all() as any[]
    expect(rows).toHaveLength(2)
    expect(rows[0].provider).toBe('anthropic')
    expect(rows[0].input_tokens).toBe(100)
    expect(rows[0].output_tokens).toBe(50)
    expect(rows[0].cost_estimate).toBe(0.01)
    expect(rows[0].stage).toBe('ceo')
    expect(rows[1].provider).toBe('gemini')
  })

  it('flush() with empty buffer is no-op', async () => {
    const { UsageBuffer } = await import('../db/usage-buffer')
    const buffer = new UsageBuffer(db)
    // Should not throw
    buffer.flush()
    expect(buffer.getBufferSize()).toBe(0)
  })

  it('flush() with null db is no-op and buffer stays', async () => {
    const { UsageBuffer } = await import('../db/usage-buffer')
    const buffer = new UsageBuffer(null)
    buffer.record('anthropic', { inputTokens: 100, outputTokens: 50 })
    buffer.flush()
    // Buffer should still have the record (silently no-op)
    expect(buffer.getBufferSize()).toBe(1)
  })

  it('flush() on DB error logs warning and retains records', async () => {
    const { UsageBuffer } = await import('../db/usage-buffer')
    const warnFn = vi.fn()
    const logger = { warn: warnFn }
    const buffer = new UsageBuffer(db, 300000, logger)
    buffer.record('anthropic', { inputTokens: 100, outputTokens: 50 })
    // Close DB to force an error
    db.close()
    buffer.flush()
    // Records should be retained for next attempt
    expect(buffer.getBufferSize()).toBe(1)
    expect(warnFn).toHaveBeenCalled()
    // Reopen db for afterEach cleanup
    db = new Database(':memory:')
  })

  it('shutdown() does final flush', async () => {
    const { UsageBuffer } = await import('../db/usage-buffer')
    const buffer = new UsageBuffer(db)
    buffer.record('anthropic', { inputTokens: 100, outputTokens: 50 })
    buffer.start()
    buffer.shutdown()
    expect(buffer.getBufferSize()).toBe(0)
    const rows = db.prepare('SELECT COUNT(*) as count FROM token_usage').get() as any
    expect(rows.count).toBe(1)
  })

  it('start() begins periodic flush interval', async () => {
    vi.useFakeTimers()
    const { UsageBuffer } = await import('../db/usage-buffer')
    const flushMs = 1000
    const buffer = new UsageBuffer(db, flushMs)
    buffer.start()
    buffer.record('anthropic', { inputTokens: 100, outputTokens: 50 })
    expect(buffer.getBufferSize()).toBe(1)
    vi.advanceTimersByTime(flushMs + 10)
    expect(buffer.getBufferSize()).toBe(0)
    buffer.shutdown()
    vi.useRealTimers()
  })
})
