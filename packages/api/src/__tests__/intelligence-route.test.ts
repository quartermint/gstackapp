/**
 * Tests for intelligence feed route.
 *
 * Uses PGlite test database with finding_embeddings table to test
 * cross-repo pattern aggregation.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import './helpers/test-db'
import { getTestDb } from './helpers/test-db'
import app from '../index'

describe('Intelligence Feed', () => {
  describe('GET /api/intelligence/feed', () => {
    it('returns empty feed when no data exists', async () => {
      const res = await app.request('/api/intelligence/feed')
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.alerts).toEqual([])
      expect(body.total).toBe(0)
    })

    it('returns cross-repo patterns when findings span multiple repos', async () => {
      const { pg } = getTestDb()

      // Seed prerequisite data
      await pg.exec(`
        INSERT INTO github_installations (id, account_login, account_type, app_id)
        VALUES (1, 'testuser', 'User', 12345);

        INSERT INTO repositories (id, installation_id, full_name)
        VALUES (1, 1, 'testuser/repo-a'), (2, 1, 'testuser/repo-b');

        INSERT INTO pipeline_runs (id, delivery_id, installation_id, head_sha, status)
        VALUES ('run-1', 'del-1', 1, 'abc123', 'COMPLETED'),
               ('run-2', 'del-2', 1, 'def456', 'COMPLETED');

        INSERT INTO stage_results (id, pipeline_run_id, stage, verdict)
        VALUES ('sr-1', 'run-1', 'security', 'FLAG'),
               ('sr-2', 'run-2', 'security', 'FLAG');

        INSERT INTO findings (id, stage_result_id, pipeline_run_id, severity, category, title, description)
        VALUES ('f-1', 'sr-1', 'run-1', 'critical', 'security', 'SQL Injection Risk', 'Unsanitized input in query'),
               ('f-2', 'sr-2', 'run-2', 'critical', 'security', 'SQL Injection Risk', 'Unsanitized input in query');

        INSERT INTO finding_embeddings (finding_id, repo_full_name, stage, severity, title, description, embedding)
        VALUES ('f-1', 'testuser/repo-a', 'security', 'critical', 'SQL Injection Risk', 'Unsanitized input in query', '[0.1,0.2]'),
               ('f-2', 'testuser/repo-b', 'security', 'critical', 'SQL Injection Risk', 'Unsanitized input in query', '[0.1,0.3]');
      `)

      const res = await app.request('/api/intelligence/feed')
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.total).toBe(1)
      expect(body.alerts[0].title).toBe('SQL Injection Risk')
      expect(body.alerts[0].repos).toContain('testuser/repo-a')
      expect(body.alerts[0].repos).toContain('testuser/repo-b')
      expect(body.alerts[0].count).toBe(2)
    })

    it('does not return findings from a single repo', async () => {
      const { pg } = getTestDb()

      await pg.exec(`
        INSERT INTO github_installations (id, account_login, account_type, app_id)
        VALUES (1, 'testuser', 'User', 12345);

        INSERT INTO repositories (id, installation_id, full_name)
        VALUES (1, 1, 'testuser/repo-a');

        INSERT INTO pipeline_runs (id, delivery_id, installation_id, head_sha, status)
        VALUES ('run-1', 'del-1', 1, 'abc123', 'COMPLETED');

        INSERT INTO stage_results (id, pipeline_run_id, stage, verdict)
        VALUES ('sr-1', 'run-1', 'eng', 'FLAG');

        INSERT INTO findings (id, stage_result_id, pipeline_run_id, severity, category, title, description)
        VALUES ('f-1', 'sr-1', 'run-1', 'minor', 'style', 'Unused Import', 'Remove unused import');

        INSERT INTO finding_embeddings (finding_id, repo_full_name, stage, severity, title, description, embedding)
        VALUES ('f-1', 'testuser/repo-a', 'eng', 'minor', 'Unused Import', 'Remove unused import', '[0.5,0.5]');
      `)

      const res = await app.request('/api/intelligence/feed')
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.total).toBe(0)
      expect(body.alerts).toEqual([])
    })
  })
})
