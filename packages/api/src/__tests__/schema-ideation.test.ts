/**
 * Ideation schema tests — validates the 4 new tables:
 * ideationSessions, ideationArtifacts, autonomousRuns, decisionGates
 */

import { describe, it, expect } from 'vitest'
import { getTestDb } from './helpers/test-db'
import { nanoid } from 'nanoid'
import {
  ideationSessions,
  ideationArtifacts,
  autonomousRuns,
  decisionGates,
  sessions,
} from '../db/schema'
import { eq } from 'drizzle-orm'

describe('ideationSessions table', () => {
  it('insert/select round-trips with all fields', () => {
    const { db } = getTestDb()
    const id = nanoid()

    db.insert(ideationSessions).values({
      id,
      userIdea: 'A todo app with AI sorting',
      status: 'pending',
    }).run()

    const row = db.select().from(ideationSessions).where(eq(ideationSessions.id, id)).get()

    expect(row).toBeDefined()
    expect(row!.id).toBe(id)
    expect(row!.userIdea).toBe('A todo app with AI sorting')
    expect(row!.status).toBe('pending')
    expect(row!.sessionId).toBeNull()
    expect(row!.currentStage).toBeNull()
    expect(row!.createdAt).toBeInstanceOf(Date)
  })
})

describe('ideationArtifacts table', () => {
  it('insert/select round-trips with FK to ideationSessions', () => {
    const { db } = getTestDb()
    const sessionId = nanoid()
    const artifactId = nanoid()

    db.insert(ideationSessions).values({
      id: sessionId,
      userIdea: 'test idea',
      status: 'running',
    }).run()

    db.insert(ideationArtifacts).values({
      id: artifactId,
      ideationSessionId: sessionId,
      stage: 'office-hours',
      artifactPath: '/home/user/.gstack/projects/test/design.md',
      title: 'Office Hours Design Doc',
      excerpt: 'First 500 chars of the design doc...',
    }).run()

    const row = db.select().from(ideationArtifacts).where(eq(ideationArtifacts.id, artifactId)).get()

    expect(row).toBeDefined()
    expect(row!.ideationSessionId).toBe(sessionId)
    expect(row!.stage).toBe('office-hours')
    expect(row!.artifactPath).toBe('/home/user/.gstack/projects/test/design.md')
    expect(row!.title).toBe('Office Hours Design Doc')
    expect(row!.excerpt).toBe('First 500 chars of the design doc...')
    expect(row!.createdAt).toBeInstanceOf(Date)
  })
})

describe('autonomousRuns table', () => {
  it('insert/select round-trips with FK to sessions and ideationSessions', () => {
    const { db } = getTestDb()
    const agentSessionId = nanoid()
    const ideationId = nanoid()
    const runId = nanoid()

    // Create parent session
    db.insert(sessions).values({
      id: agentSessionId,
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
    }).run()

    // Create parent ideation session
    db.insert(ideationSessions).values({
      id: ideationId,
      userIdea: 'autonomous test',
      status: 'complete',
    }).run()

    db.insert(autonomousRuns).values({
      id: runId,
      sessionId: agentSessionId,
      ideationSessionId: ideationId,
      projectPath: '/Users/test/project',
      status: 'running',
      totalPhases: 5,
    }).run()

    const row = db.select().from(autonomousRuns).where(eq(autonomousRuns.id, runId)).get()

    expect(row).toBeDefined()
    expect(row!.sessionId).toBe(agentSessionId)
    expect(row!.ideationSessionId).toBe(ideationId)
    expect(row!.projectPath).toBe('/Users/test/project')
    expect(row!.status).toBe('running')
    expect(row!.totalPhases).toBe(5)
    expect(row!.completedPhases).toBe(0)
    expect(row!.totalCommits).toBe(0)
    expect(row!.createdAt).toBeInstanceOf(Date)
  })
})

describe('decisionGates table', () => {
  it('insert/select round-trips with FK to autonomousRuns, options as JSON string', () => {
    const { db } = getTestDb()
    const agentSessionId = nanoid()
    const runId = nanoid()
    const gateId = nanoid()

    db.insert(sessions).values({
      id: agentSessionId,
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
    }).run()

    db.insert(autonomousRuns).values({
      id: runId,
      sessionId: agentSessionId,
      projectPath: '/Users/test/project',
      status: 'running',
    }).run()

    const options = JSON.stringify([
      { id: 'opt1', label: 'PostgreSQL', description: 'Full RDBMS' },
      { id: 'opt2', label: 'SQLite', description: 'Embedded DB' },
    ])

    db.insert(decisionGates).values({
      id: gateId,
      autonomousRunId: runId,
      title: 'Database Choice',
      description: 'Choose a database engine for the project',
      options,
      blocking: true,
    }).run()

    const row = db.select().from(decisionGates).where(eq(decisionGates.id, gateId)).get()

    expect(row).toBeDefined()
    expect(row!.autonomousRunId).toBe(runId)
    expect(row!.title).toBe('Database Choice')
    expect(row!.description).toBe('Choose a database engine for the project')
    expect(JSON.parse(row!.options)).toHaveLength(2)
    expect(row!.blocking).toBe(true)
    expect(row!.response).toBeNull()
    expect(row!.respondedAt).toBeNull()
    expect(row!.createdAt).toBeInstanceOf(Date)
  })
})
