# gstackapp

> Cognitive code review platform that runs five specialized AI review stages on every GitHub PR.

![Status: Alpha](https://img.shields.io/badge/status-alpha-orange)
![Node 22+](https://img.shields.io/badge/node-22+-339933)
![Hono](https://img.shields.io/badge/hono-4.x-E36002)

Every pull request gets reviewed by five AI brains -- CEO (product direction), Eng (architecture + correctness), Design (UI/UX), QA (coverage + edge cases), Security (trust boundaries + injection). The pipeline runs automatically on PR open/update via a GitHub App webhook and streams results to a real-time dashboard with quality trends across repos.

**Who it's for:** Developers who ship daily and want structured AI review that catches what the others miss, visualized in a dashboard rather than buried in comment threads.

---

## Quickstart

```bash
# Install dependencies (npm workspaces)
npm install

# Copy and configure env vars
cp .env.example .env

# Start API server (port 3000)
npm run dev

# Start web dashboard (separate terminal)
npm run dev:web

# Forward GitHub webhooks in dev (requires SMEE_URL)
npm run dev:webhook
```

The API runs on port 3000. The dashboard (Vite + React) runs on a separate port. GitHub webhook endpoint: `POST /api/webhook`.

---

## Architecture

```
gstackapp/
├── packages/
│   ├── api/          # Hono backend -- webhook handler, pipeline runner, SSE stream
│   ├── web/          # React + Vite dashboard -- pipeline view, quality trends
│   ├── harness/      # @gstackapp/harness -- multi-provider LLM abstraction layer
│   └── shared/       # Shared Zod schemas and TypeScript types
├── drizzle.config.ts # Drizzle ORM config (Neon Postgres)
└── vitest.workspace.ts
```

### Review Pipeline

When a PR is opened or updated, the webhook handler:

1. Clones the repo at the PR head (shallow clone via `simple-git`)
2. Runs five review stages in sequence, each backed by Claude
3. Streams stage status updates (RUNNING / PASS / FLAG / BLOCK) to connected dashboards via SSE
4. Posts a structured summary comment to the GitHub PR

| Stage | Focus |
|-------|-------|
| CEO | Product direction, scope, does this belong here |
| Eng | Architecture, correctness, race conditions, SQL safety |
| Design | UI/UX consistency, WCAG, token adherence |
| QA | Test coverage, edge cases, regression risk |
| Security | Trust boundaries, injection risks, auth checks |

### Stack

- **Backend:** Hono 4 on Node.js 22, `@hono/node-server`
- **Database:** Neon Postgres via `@neondatabase/serverless`, Drizzle ORM, drizzle-kit migrations
- **AI:** Anthropic Claude via `@anthropic-ai/sdk` (direct SDK, no abstraction layer), `@anthropic-ai/claude-agent-sdk`
- **Harness:** `@gstackapp/harness` -- multi-provider LLM router (Anthropic, Gemini, OpenAI) with model profiles, token tracking, and eval tooling
- **GitHub:** `@octokit/webhooks` (webhook verification), `@octokit/rest` (API), `@octokit/auth-app` (GitHub App JWT auth)
- **Frontend:** React 19, Vite 8 (Rolldown), Tailwind CSS 4, TanStack Query, Recharts for trend charts
- **Real-time:** Hono `streamSSE` pushing pipeline stage updates; browser `EventSource` consuming them
- **Testing:** Vitest 3 across all packages
- **Deploy:** Mac Mini via Tailscale Funnel (public HTTPS webhook endpoint, no cloud infra)

### @gstackapp/harness

The `harness` package is a standalone multi-provider LLM abstraction. It handles:

- Provider routing (Anthropic, Gemini, OpenAI, local via adapter)
- Model profiles (quality / balanced / budget)
- Token usage tracking in SQLite (local, separate from Neon)
- Skill execution and eval tooling
- CLI (`harness` bin) for running review stages directly

---

## Configuration

```bash
# GitHub App credentials
GITHUB_APP_ID=...
GITHUB_PRIVATE_KEY_PATH=./private-key.pem
GITHUB_WEBHOOK_SECRET=...

# AI
ANTHROPIC_API_KEY=sk-ant-...

# Database (Neon Postgres)
NEON_CONNECTION_STRING=postgresql://...

# Optional (harness additional providers)
GOOGLE_API_KEY=...
OPENAI_API_KEY=...
```

---

## Development

```bash
# Run all tests
npm test

# Database migrations
npm run db:push         # Push schema changes to Neon
npm run db:generate     # Generate migration files
npm run db:studio       # Open Drizzle Studio

# Build all packages
npm run build
```

---

## License

Private project. Not licensed for redistribution.
