// ── Repo Scaffolding Templates ───────────────────────────────────────────────
// Stack-specific templates for creating new project repos from ideation output.
// Per D-18, D-19, D-20: generates CLAUDE.md + .planning/ structure.

import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { execSync } from 'node:child_process'

export interface ScaffoldContext {
  name: string
  description: string
  stack: string
  ideationExcerpt?: string
}

export interface TemplateFile {
  path: string
  content: (ctx: ScaffoldContext) => string
}

// ── Shared template files (all stacks) ───────────────────────────────────────

function claudeMd(ctx: ScaffoldContext): string {
  return `# CLAUDE.md -- ${ctx.name}

${ctx.description}

## Stack

${ctx.stack}

## Conventions

Conventions not yet established. Will populate as patterns emerge during development.

## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
`
}

function projectMd(ctx: ScaffoldContext): string {
  return `# ${ctx.name}

## What This Is

${ctx.description}

## Core Value

${ctx.ideationExcerpt || 'To be defined during ideation.'}

## Requirements

### Active

(To be defined)

### Out of Scope

(To be defined)

## Constraints

- **Stack**: ${ctx.stack}

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|

## Evolution

This document evolves at phase transitions and milestone boundaries.

---
*Created: ${new Date().toISOString().split('T')[0]}*
`
}

function roadmapMd(ctx: ScaffoldContext): string {
  return `# ${ctx.name} Roadmap

## Milestone: v0.1 MVP

| Phase | Name | Plans | Status |
|-------|------|-------|--------|

---
*Created: ${new Date().toISOString().split('T')[0]}*
`
}

function stateMd(ctx: ScaffoldContext): string {
  return `---
gsd_state_version: 1.0
milestone: v0.1
milestone_name: MVP
status: planning
stopped_at: Project initialized
last_updated: "${new Date().toISOString()}"
last_activity: ${new Date().toISOString().split('T')[0]}
progress:
  total_phases: 0
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# Project State

## Current Position

Phase: 0 (not started)
Plan: 0
Status: Planning

## Accumulated Context

### Decisions

None yet.

### Blockers/Concerns

None yet.
`
}

// ── Stack-specific templates ─────────────────────────────────────────────────

const reactTemplateFiles: TemplateFile[] = [
  { path: 'CLAUDE.md', content: claudeMd },
  { path: '.planning/PROJECT.md', content: projectMd },
  { path: '.planning/ROADMAP.md', content: roadmapMd },
  { path: '.planning/STATE.md', content: stateMd },
  {
    path: 'package.json',
    content: (ctx) => JSON.stringify({
      name: ctx.name,
      version: '0.0.1',
      type: 'module',
      scripts: {
        dev: 'vite',
        build: 'tsc && vite build',
        preview: 'vite preview',
      },
      dependencies: {
        react: '^19.2.0',
        'react-dom': '^19.2.0',
      },
      devDependencies: {
        '@types/react': '^19.2.0',
        '@types/react-dom': '^19.2.0',
        typescript: '^5.8.0',
        vite: '^8.0.0',
        '@vitejs/plugin-react': '^4.5.0',
      },
    }, null, 2) + '\n',
  },
  {
    path: 'tsconfig.json',
    content: () => JSON.stringify({
      compilerOptions: {
        target: 'ES2022',
        module: 'ESNext',
        moduleResolution: 'bundler',
        strict: true,
        jsx: 'react-jsx',
        esModuleInterop: true,
        skipLibCheck: true,
        outDir: 'dist',
      },
      include: ['src'],
    }, null, 2) + '\n',
  },
  {
    path: 'src/App.tsx',
    content: (ctx) => `export default function App() {
  return (
    <div>
      <h1>${ctx.name}</h1>
      <p>${ctx.description}</p>
    </div>
  )
}
`,
  },
]

const pythonTemplateFiles: TemplateFile[] = [
  { path: 'CLAUDE.md', content: claudeMd },
  { path: '.planning/PROJECT.md', content: projectMd },
  { path: '.planning/ROADMAP.md', content: roadmapMd },
  { path: '.planning/STATE.md', content: stateMd },
  {
    path: 'pyproject.toml',
    content: (ctx) => `[project]
name = "${ctx.name}"
version = "0.0.1"
description = "${ctx.description}"
requires-python = ">=3.11"

[project.optional-dependencies]
dev = ["pytest", "ruff"]

[tool.ruff]
target-version = "py311"
`,
  },
  {
    path: 'src/main.py',
    content: (ctx) => `"""${ctx.name} - ${ctx.description}"""

from fastapi import FastAPI

app = FastAPI(title="${ctx.name}")


@app.get("/health")
async def health():
    return {"status": "ok"}
`,
  },
]

const swiftTemplateFiles: TemplateFile[] = [
  { path: 'CLAUDE.md', content: claudeMd },
  { path: '.planning/PROJECT.md', content: projectMd },
  { path: '.planning/ROADMAP.md', content: roadmapMd },
  { path: '.planning/STATE.md', content: stateMd },
  {
    path: 'Package.swift',
    content: (ctx) => `// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "${ctx.name}",
    platforms: [.iOS(.v17)],
    targets: [
        .executableTarget(name: "${ctx.name}", path: "Sources"),
    ]
)
`,
  },
  {
    path: 'Sources/App.swift',
    content: (ctx) => `import SwiftUI

@main
struct ${ctx.name.replace(/-/g, '_').replace(/\b\w/g, c => c.toUpperCase())}App: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }
}

struct ContentView: View {
    var body: some View {
        Text("${ctx.name}")
            .font(.largeTitle)
    }
}
`,
  },
]

const goTemplateFiles: TemplateFile[] = [
  { path: 'CLAUDE.md', content: claudeMd },
  { path: '.planning/PROJECT.md', content: projectMd },
  { path: '.planning/ROADMAP.md', content: roadmapMd },
  { path: '.planning/STATE.md', content: stateMd },
  {
    path: 'go.mod',
    content: (ctx) => `module github.com/user/${ctx.name}

go 1.22
`,
  },
  {
    path: 'main.go',
    content: (ctx) => `package main

import "fmt"

func main() {
\tfmt.Println("${ctx.name}")
}
`,
  },
]

// ── Stack template registry ──────────────────────────────────────────────────

export const STACK_TEMPLATES: Record<string, TemplateFile[]> = {
  react: reactTemplateFiles,
  python: pythonTemplateFiles,
  swift: swiftTemplateFiles,
  go: goTemplateFiles,
}

// ── Scaffold function ────────────────────────────────────────────────────────

/**
 * Scaffold a new repo from ideation output.
 * Per D-18, D-19, D-20: creates CLAUDE.md + .planning/ structure.
 * Per T-15-07: validates name with regex, rejects if path exists.
 */
export async function scaffoldRepo(config: {
  name: string
  path: string
  stack: 'react' | 'python' | 'swift' | 'go'
  description: string
  ideationExcerpt?: string
}): Promise<{ path: string; filesCreated: string[] }> {
  // T-15-07: Validate name — alphanumeric + hyphens only
  if (!/^[a-z0-9-]+$/.test(config.name)) {
    throw new Error('Invalid project name: only lowercase alphanumeric and hyphens allowed')
  }

  const targetPath = resolve(config.path)

  // T-15-07: Reject if path already exists
  if (existsSync(targetPath)) {
    throw new Error(`Path already exists: ${targetPath}`)
  }

  const templates = STACK_TEMPLATES[config.stack]
  if (!templates) {
    throw new Error(`Unknown stack: ${config.stack}`)
  }

  const ctx: ScaffoldContext = {
    name: config.name,
    description: config.description,
    stack: config.stack,
    ideationExcerpt: config.ideationExcerpt,
  }

  const filesCreated: string[] = []

  // Create directory structure and write template files
  for (const template of templates) {
    const filePath = join(targetPath, template.path)
    const dirPath = resolve(filePath, '..')

    mkdirSync(dirPath, { recursive: true })
    writeFileSync(filePath, template.content(ctx), 'utf-8')
    filesCreated.push(template.path)
  }

  // Create .planning/phases/ directory
  mkdirSync(join(targetPath, '.planning', 'phases'), { recursive: true })

  // Initialize git repo
  try {
    execSync('git init', { cwd: targetPath, stdio: 'pipe' })
  } catch {
    // Git init failure is non-fatal
  }

  return { path: targetPath, filesCreated }
}
