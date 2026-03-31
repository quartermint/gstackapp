import { describe, it, expect, vi } from 'vitest'
import {
  buildDiffLineMap,
  mapFindingsToInlineComments,
  createInlineReview,
  MAX_INLINE_COMMENTS,
  type FindingWithStage,
  type DiffFile,
} from '../github/inline-review'

describe('buildDiffLineMap', () => {
  it('parses single hunk and identifies valid lines', () => {
    const files: DiffFile[] = [
      {
        filename: 'src/index.ts',
        patch: '@@ -1,3 +1,4 @@\n line1\n+added\n line2\n line3',
      },
    ]
    const map = buildDiffLineMap(files)
    expect(map.has('src/index.ts:1')).toBe(true)
    expect(map.has('src/index.ts:2')).toBe(true)
    expect(map.has('src/index.ts:3')).toBe(true)
    expect(map.has('src/index.ts:4')).toBe(true)
  })

  it('handles multiple hunks in one file', () => {
    const files: DiffFile[] = [
      {
        filename: 'src/app.ts',
        patch: '@@ -1,2 +1,2 @@\n-old\n+new\n same\n@@ -10,2 +10,3 @@\n context\n+added1\n+added2',
      },
    ]
    const map = buildDiffLineMap(files)
    expect(map.has('src/app.ts:1')).toBe(true) // +new
    expect(map.has('src/app.ts:2')).toBe(true) // same
    expect(map.has('src/app.ts:10')).toBe(true) // context
    expect(map.has('src/app.ts:11')).toBe(true) // +added1
    expect(map.has('src/app.ts:12')).toBe(true) // +added2
  })

  it('deletion lines do not appear in map', () => {
    const files: DiffFile[] = [
      {
        filename: 'src/del.ts',
        patch: '@@ -1,3 +1,2 @@\n line1\n-removed\n line2',
      },
    ]
    const map = buildDiffLineMap(files)
    expect(map.has('src/del.ts:1')).toBe(true)
    expect(map.has('src/del.ts:2')).toBe(true)
    expect(map.size).toBe(2)
  })

  it('file with no patch produces empty set', () => {
    const files: DiffFile[] = [{ filename: 'binary.png' }]
    const map = buildDiffLineMap(files)
    expect(map.size).toBe(0)
  })

  it('handles multiple files', () => {
    const files: DiffFile[] = [
      { filename: 'a.ts', patch: '@@ -1,1 +1,2 @@\n line1\n+added' },
      { filename: 'b.ts', patch: '@@ -1,1 +1,1 @@\n-old\n+new' },
    ]
    const map = buildDiffLineMap(files)
    expect(map.has('a.ts:1')).toBe(true)
    expect(map.has('a.ts:2')).toBe(true)
    expect(map.has('b.ts:1')).toBe(true)
  })
})

describe('mapFindingsToInlineComments', () => {
  const diffFiles: DiffFile[] = [
    {
      filename: 'src/auth.ts',
      patch: '@@ -1,3 +1,5 @@\n import\n+new line 2\n+new line 3\n old line\n+new line 5',
    },
  ]

  const makeFinding = (overrides: Partial<FindingWithStage>): FindingWithStage => ({
    id: 'f1',
    stage: 'security',
    severity: 'critical',
    category: 'auth',
    title: 'Test finding',
    description: 'Description',
    filePath: 'src/auth.ts',
    lineStart: 2,
    ...overrides,
  })

  it('filters out minor findings', () => {
    const findings = [makeFinding({ severity: 'minor' })]
    const comments = mapFindingsToInlineComments(findings, diffFiles)
    expect(comments).toHaveLength(0)
  })

  it('filters out findings without filePath', () => {
    const findings = [makeFinding({ filePath: undefined })]
    const comments = mapFindingsToInlineComments(findings, diffFiles)
    expect(comments).toHaveLength(0)
  })

  it('filters out findings without lineStart', () => {
    const findings = [makeFinding({ lineStart: undefined })]
    const comments = mapFindingsToInlineComments(findings, diffFiles)
    expect(comments).toHaveLength(0)
  })

  it('filters out findings on non-diff lines', () => {
    const findings = [makeFinding({ lineStart: 99 })]
    const comments = mapFindingsToInlineComments(findings, diffFiles)
    expect(comments).toHaveLength(0)
  })

  it('includes critical and notable findings on valid diff lines', () => {
    const findings = [
      makeFinding({ id: 'f1', severity: 'critical', lineStart: 2 }),
      makeFinding({ id: 'f2', severity: 'notable', lineStart: 3 }),
    ]
    const comments = mapFindingsToInlineComments(findings, diffFiles)
    expect(comments).toHaveLength(2)
    expect(comments[0].line).toBe(2)
    expect(comments[1].line).toBe(3)
    expect(comments[0].side).toBe('RIGHT')
  })

  it('caps at MAX_INLINE_COMMENTS with critical first', () => {
    const findings = Array.from({ length: 20 }, (_, i) => (
      makeFinding({
        id: `f${i}`,
        severity: i < 5 ? 'critical' : 'notable',
        lineStart: 2,
      })
    ))
    const comments = mapFindingsToInlineComments(findings, diffFiles)
    expect(comments).toHaveLength(MAX_INLINE_COMMENTS)
  })

  it('returns empty array for empty findings', () => {
    const comments = mapFindingsToInlineComments([], diffFiles)
    expect(comments).toHaveLength(0)
  })

  it('includes stage label in comment body', () => {
    const findings = [makeFinding({ stage: 'security', severity: 'critical' })]
    const comments = mapFindingsToInlineComments(findings, diffFiles)
    expect(comments[0].body).toContain('🔴 Security')
    expect(comments[0].body).toContain('**CRITICAL**')
  })
})

describe('createInlineReview', () => {
  it('returns empty array for empty comments', async () => {
    const octokit = {} as any
    const result = await createInlineReview(octokit, 'owner', 'repo', 1, 'sha', [])
    expect(result).toEqual([])
  })

  it('calls pulls.createReview with correct parameters', async () => {
    const mockOctokit = {
      pulls: {
        createReview: vi.fn().mockResolvedValue({ data: { id: 100 } }),
        listReviewComments: vi.fn().mockResolvedValue({
          data: [
            { id: 201, pull_request_review_id: 100 },
            { id: 202, pull_request_review_id: 100 },
          ],
        }),
      },
    } as any

    const comments = [
      { path: 'src/a.ts', line: 5, side: 'RIGHT' as const, body: 'issue here' },
      { path: 'src/b.ts', line: 10, side: 'RIGHT' as const, body: 'another issue' },
    ]

    const ids = await createInlineReview(mockOctokit, 'owner', 'repo', 42, 'abc123', comments)

    expect(mockOctokit.pulls.createReview).toHaveBeenCalledWith({
      owner: 'owner',
      repo: 'repo',
      pull_number: 42,
      commit_id: 'abc123',
      event: 'COMMENT',
      comments: [
        { path: 'src/a.ts', line: 5, side: 'RIGHT', body: 'issue here' },
        { path: 'src/b.ts', line: 10, side: 'RIGHT', body: 'another issue' },
      ],
    })
    expect(ids).toEqual([201, 202])
  })
})
