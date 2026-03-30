# Domain Pitfalls

**Domain:** AI code review platform (GitHub App + Claude API pipeline + dashboard)
**Researched:** 2026-03-30

## Critical Pitfalls

Mistakes that cause rewrites, security incidents, or product abandonment.

---

### Pitfall 1: Review Comment Noise Destroys Trust Before It Builds

**What goes wrong:** The AI pipeline generates 10-20 comments per PR, but 70-90% are style nitpicks, subjective opinions, or micro-optimizations. Developers learn to ignore ALL comments -- including the real security/architecture findings. An independent benchmark found CodeRabbit scored 1/5 on completeness and 2/5 on depth, with 28% of comments being outright noise. At scale, one study showed 200-400 AI comments per week, with median PR merge time increasing from 6 hours to 2-3 days.

**Why it happens:** Five parallel stages each trying to justify their existence. Each stage finds *something* to say, even on clean code. No confidence threshold or severity filter. The system optimizes for coverage ("we found things!") rather than signal ("we found things that matter").

**Consequences:** Developer fatigue within days. Users disable the app or stop reading comments. The core value proposition -- "five brains catch what others miss" -- inverts into "five brains spam me five times harder." A tool with <30% action rate is counterproductive -- worse than no tool.

**Prevention:**
- Implement a three-tier finding classification from day 1: Tier 1 (runtime errors, security vulns, breaking changes), Tier 2 (architecture issues, measurable perf problems), Tier 3 (style, subjective). Only Tier 1 and Tier 2 appear in PR comments by default.
- Each stage MUST support a SKIP verdict for "nothing notable found." Silence is a valid review outcome.
- Target Signal Ratio > 60% (Tier 1 + Tier 2 / Total findings). Track this metric from launch.
- Add a user-facing "Was this helpful?" reaction mechanism on findings to build a feedback loop.

**Detection:** Action rate on findings drops below 40%. Users uninstalling within first week. PR merge times increasing after install.

**Phase:** Must be addressed in pipeline design (Phase 2-3, wherever prompts and finding schemas are built). Retrofitting noise filters after launch is much harder than designing for signal from the start.

---

### Pitfall 2: Webhook Reliability Without a Job Queue

**What goes wrong:** With in-process execution (no BullMQ/Redis), a webhook arrives, triggers 5 parallel Claude API calls, and the process crashes mid-pipeline (OOM, unhandled rejection, Mac Mini restart, Tailscale reconnection). The webhook is lost. GitHub retries, but you now have partial results from run 1 and a new run 2 starting. Stale `RUNNING` status entries accumulate in the database.

**Why it happens:** The PROJECT.md explicitly scopes out BullMQ/Redis for Phase 1. In-process execution means jobs exist only in memory. A single process crash loses all in-flight work. GitHub webhooks are at-least-once delivery, so retries create duplicate processing without idempotency guards.

**Consequences:** Ghost pipeline runs stuck in RUNNING forever. Duplicate PR comments on the same push. Lost reviews that never complete. Users see unreliable results and lose trust.

**Prevention:**
- Use the `X-GitHub-Delivery` header as an idempotency key. Store it in `pipeline_runs` with a UNIQUE constraint. Use `INSERT ... ON CONFLICT DO NOTHING` for atomic deduplication -- never query-then-insert.
- Persist `RUNNING` status to DB *before* starting any stage (already in architecture decisions -- enforce it).
- Implement a stale run detector: any `RUNNING` pipeline older than 10 minutes on process restart gets marked `STALE` and the PR comment updated.
- Return `200 OK` to GitHub within 2 seconds. Do the actual work asynchronously (even without Redis, use a simple in-memory queue with persistence checkpoints).
- Add a startup reconciliation routine: on process start, find all `RUNNING` pipelines and either restart or mark stale.

**Detection:** Pipeline runs stuck in RUNNING state for >10 minutes. Duplicate pipeline_runs for the same PR+SHA combination. PR comments that never update past "Running..." state.

**Phase:** Must be addressed in webhook handler implementation (Phase 1-2). The idempotency key and stale detection are day-1 requirements, not optimizations.

---

### Pitfall 3: Sandbox Escape via Symlink or Path Traversal

**What goes wrong:** The AI's file-reading tools (read_file, list_files, search_code) are given access to a shallow clone in `/tmp`. A malicious repo contains symlinks pointing to `/etc/passwd`, `~/.ssh/id_rsa`, or other sensitive host files. Naive path validation (string prefix check) passes because the path *looks* like it's inside the clone dir, but `fs.realpathSync` resolves to outside it. CVE-2025-53109 and CVE-2025-53110 demonstrated exactly this attack on Anthropic's own filesystem MCP server -- simple prefix matching was bypassed through symlink exploitation, enabling reads of `/etc/sudoers` and writes to macOS Launch Agents.

**Why it happens:** Path validation that only performs lexical checks (does the string start with `/tmp/clone-dir/`) without resolving the actual filesystem path. The git clone can contain arbitrary symlinks that the cloner doesn't control. Additionally, TOCTOU (time-of-check-time-of-use) races can occur if symlinks are created between validation and access.

**Consequences:** Host system compromise. Private key exfiltration. Arbitrary file read on the Mac Mini. Since this runs on a personal Mac Mini (not an isolated container), the blast radius is the entire machine -- all projects, SSH keys, credentials.

**Prevention:**
- Resolve path with `fs.realpathSync()` BEFORE validation, then verify the resolved path starts with the clone directory. Never validate the raw path string.
- After cloning, scan for and remove all symlinks in the cloned repo before granting AI access: `find /tmp/clone-dir -type l -delete`.
- Run the clone + AI tools under a restricted user account with no access to sensitive directories.
- Set `--no-checkout` + `--filter=blob:none` clone flags to minimize exposure, then selectively checkout only needed files.
- Consider macOS Seatbelt sandbox profiles (Anthropic's Claude Code uses these) to enforce filesystem boundaries at the OS level.
- Block all network egress from AI tool execution context -- prevent exfiltration even if file read succeeds.

**Detection:** AI tool requests for paths outside the expected clone directory. Resolved paths that differ from requested paths (symlink indicator). Clone directories containing symlinks.

**Phase:** Must be addressed in the sandbox/tool implementation phase. This is a security-critical path -- get it wrong and the Mac Mini is compromised.

---

### Pitfall 4: GitHub Installation Token Expiration Mid-Pipeline

**What goes wrong:** Installation access tokens expire after exactly 1 hour. A pipeline starts, acquires a token, and the 5 stages run. If Claude API is slow (rate-limited, large diff, retries), the pipeline might take 10-30 minutes per stage. By stage 4-5, the token has expired. The PR comment update fails silently. The clone repo can't fetch additional context.

**Why it happens:** Token is acquired once at pipeline start and reused. No refresh logic. No expiration check before API calls. The Octokit SDK handles this if configured correctly, but raw API calls don't.

**Consequences:** Silent failures on late-stage PR comment updates. Partial reviews posted. Error states that are hard to diagnose because the first 3 stages succeeded.

**Prevention:**
- Use Octokit with the built-in installation token refresh (`@octokit/auth-app`). The SDK regenerates tokens automatically before expiration.
- If using raw API calls, check `X-RateLimit-Reset` and token expiry before each GitHub API call. Regenerate if <5 minutes remain.
- Cache tokens with their expiration time. Generate new tokens proactively at 50-minute mark (10-minute buffer on the 60-minute TTL).
- Log token refresh events for debugging pipeline timing issues.

**Detection:** HTTP 401 errors from GitHub API during stages 4-5 but not stages 1-2. PR comments that stop updating mid-pipeline.

**Phase:** Must be addressed in GitHub API client setup (early infrastructure phase).

---

### Pitfall 5: Claude API Cost Explosion

**What goes wrong:** 5 stages * tool_use conversations * multiple tool calls per stage * full file contents as tool results = massive token consumption. A single PR review could consume 100K-500K tokens across all stages. At Opus pricing ($15/M input, $75/M output), a busy repo with 10 PRs/day costs $15-75/day -- $450-2,250/month for a single-user tool.

**Why it happens:** Each stage gets the full diff + file contents via tool_use. Tool results (file contents) are expensive input tokens that compound across the conversation. No caching between stages that might read the same files. Output tokens cost 5x input tokens, and verbose AI reviews generate a lot of output.

**Consequences:** API costs make the product unviable for personal/indie use. Budget exhaustion during demo periods. Reluctance to install on active repos.

**Prevention:**
- Use Claude Sonnet (not Opus) for the pipeline stages. Opus is 5x the cost with marginal quality improvement for structured review tasks. Reserve Opus for cross-repo intelligence synthesis only.
- Implement prompt caching aggressively: system prompts + tool definitions should be cached (90% cost reduction on cached reads). Use the `token-efficient-tools-2025-02-19` beta header for 60-80% savings on tool-heavy conversations.
- Share file contents across stages: clone once, read files once, pass summaries to stages that don't need full content.
- Set `max_tokens` limits on each stage's response to prevent verbose output (output tokens are 5x more expensive).
- Implement per-repo daily/weekly cost caps with alerts.
- Track cost per pipeline run in the database from day 1. Display in dashboard.
- Diff-only review for small changes; full-context review only when the diff touches >5 files or critical paths.

**Detection:** Monthly API bill exceeding budget. Average cost per review exceeding $1. Token usage trending upward over time.

**Phase:** Must be designed into the pipeline architecture from Phase 1. Prompt caching headers and model selection are one-line changes but have 5-10x cost impact.

---

## Moderate Pitfalls

---

### Pitfall 6: PR Comment Formatting and Update Races

**What goes wrong:** The in-place comment update pattern (find existing comment by hidden marker, PATCH to update) creates race conditions when 5 stages complete near-simultaneously. Stage 3 reads the comment, stage 4 reads the comment, stage 3 writes its update, stage 4 writes its update -- stage 3's results are overwritten. Additionally, GitHub has secondary rate limits on comment creation/updates -- making requests too quickly results in 403 responses.

**Why it happens:** No mutex/lock around comment updates. Each stage independently calls the GitHub API. GitHub's secondary rate limiting kicks in when making multiple POST/PATCH requests within seconds.

**Prevention:**
- Serialize comment updates through a single queue/function. Stages write results to the database; a separate comment-renderer reads all current results and renders the full comment.
- Use optimistic locking: read the comment, compute the update, PATCH with `If-Match` etag header.
- Add 1-second minimum delay between comment update API calls (GitHub's documented recommendation for avoiding secondary rate limits).
- Keep the comment body under 65,536 characters (GitHub's comment body limit). Five verbose stages can easily exceed this.

**Detection:** Missing stage results in PR comments. 403 "secondary rate limit" errors from GitHub API. Comment body truncation.

**Phase:** Pipeline result aggregation phase. Design the comment renderer as a separate concern from stage execution.

---

### Pitfall 7: Shallow Clone Limitations for Code Understanding

**What goes wrong:** Shallow clones (`--depth 1`) contain only the latest commit. The AI can't run `git blame`, examine file history, understand when code was introduced, or determine if a pattern is new or longstanding. Cross-file analysis is limited to current state only. The AI asks "when was this function added?" and gets no answer.

**Why it happens:** Shallow clones are used for speed and disk savings, which is correct for the primary use case. But some review stages (especially CEO and Eng) benefit from historical context.

**Consequences:** Reviews that flag longstanding patterns as "new issues." Inability to distinguish between intentional technical debt and accidental bugs. Missing context for "this was changed 3 times in 2 weeks" pattern detection.

**Prevention:**
- Use `--depth 1` as default but fetch additional history on demand: `git fetch --deepen=N` when a stage needs blame/history.
- For cross-repo intelligence, rely on sqlite-vec embeddings (previous PR findings) rather than git history -- this is already in the architecture.
- Provide the PR diff metadata (base SHA, file change counts, author) as structured context to each stage without requiring git history.
- Accept the limitation explicitly: document that stages review the *current state of the diff*, not historical patterns. This is how CodeRabbit and most competitors work too.

**Detection:** AI stages producing findings about code that existed long before the PR. Stages requesting git blame/log via tools and getting errors.

**Phase:** Tool implementation phase. Define tool capabilities clearly so prompts don't attempt operations the shallow clone can't support.

---

### Pitfall 8: AI Self-Assessment Inflation

**What goes wrong:** When the AI evaluates its own review quality, it consistently overestimates. One study showed AI self-assessment at 98.6% valid, but independent validation found only 69% fully valid -- a 30-point gap. If you use AI confidence scores to filter findings, you'll let through low-quality findings because the AI thinks they're all high quality.

**Why it happens:** LLMs are trained to be helpful and confident. They don't naturally hedge or admit uncertainty about their own outputs. Tool_use structured outputs (JSON schemas) encourage definitive answers -- every finding gets a verdict, not "I'm not sure."

**Consequences:** PASS/FLAG/BLOCK verdicts that don't correlate with actual severity. Users can't trust the verdict system. BLOCK findings that are false positives erode trust fastest.

**Prevention:**
- Never use a stage's self-assessed confidence as the sole filter. Use structural heuristics: does the finding reference specific line numbers? Does it quote actual code from the diff? Does it explain *why* it's a problem?
- Implement a finding-quality heuristic separate from the AI: findings without code references, specific line numbers, or actionable suggestions get auto-downgraded.
- BLOCK verdicts should require the AI to cite the specific code and explain the exploit/failure scenario. If it can't, downgrade to FLAG.
- Track false positive rates per stage over time. Tune prompts for stages with >15% false positive rates.

**Detection:** BLOCK verdicts on obviously correct code. Findings that describe code not present in the diff. Findings with vague descriptions like "consider improving" without specifics.

**Phase:** Prompt design and finding schema phase. Build the quality heuristics into the Zod schema validators.

---

### Pitfall 9: Tailscale Funnel as Production Webhook Endpoint

**What goes wrong:** Tailscale Funnel has undocumented bandwidth limits, only supports ports 443/8443/10000, has no uptime SLA, and DNS propagation can take up to 10 minutes. Exceeding Let's Encrypt cert request rates results in 34-hour lockouts. If the Mac Mini sleeps, loses Tailscale connection, or restarts, GitHub webhooks fail silently and may or may not retry.

**Why it happens:** Funnel is designed for development and personal projects, not production webhook ingestion. There's no monitoring, no redundancy, no automatic failover.

**Consequences:** Missed PR reviews during Mac Mini downtime. No alerting when the funnel goes down. GitHub may stop retrying after too many failures (though GitHub does retry for several days).

**Prevention:**
- Accept this limitation for Phase 1 single-user use. Document it as a known constraint.
- Implement a "health check" endpoint that the dashboard polls. If the webhook endpoint is unreachable, show a banner.
- Log every webhook receipt with timestamp. Add a "last webhook received" indicator to the dashboard to detect silent failures.
- Keep the Mac Mini on a UPS and disable sleep. Configure Tailscale to auto-start on boot.
- Plan the Fly.io/Cloudflare migration for Phase 2 if the product gains users.
- Use GitHub's webhook delivery log (Settings > Webhooks > Recent Deliveries) for manual re-delivery of missed events.

**Detection:** Gap in webhook receipts during expected activity. Dashboard showing stale data. GitHub webhook delivery log showing failed deliveries.

**Phase:** Infrastructure setup. Monitoring should be built from day 1 even if the infra is scrappy.

---

### Pitfall 10: Drizzle ORM + SQLite Concurrent Write Locking

**What goes wrong:** SQLite allows only one writer at a time. With 5 parallel stages completing near-simultaneously and writing to `stage_results` and `findings` tables, you get `SQLITE_BUSY` errors. The default busy timeout is 0ms -- immediate failure. WAL mode helps but doesn't eliminate the problem under concurrent writes.

**Why it happens:** SQLite is single-writer by design. Running 5 parallel pipeline stages that all write results is a concurrent write pattern. Drizzle ORM may not surface SQLite busy errors clearly.

**Consequences:** Lost stage results. Silent write failures. Incomplete pipeline data in the dashboard.

**Prevention:**
- Enable WAL mode (`PRAGMA journal_mode=WAL`) from the start -- allows concurrent reads during writes.
- Set a busy timeout (`PRAGMA busy_timeout=5000`) so writers wait up to 5 seconds instead of failing immediately.
- Serialize database writes through a single write queue/function, even if stage execution is parallel. Stages produce results in memory; a single writer persists them.
- Use Drizzle transactions for multi-table writes (stage_result + findings in one transaction).
- Test with 5 concurrent writes in CI to catch this before production.

**Detection:** `SQLITE_BUSY` errors in logs. Missing stage results in the database. Intermittent failures that only appear under parallel load.

**Phase:** Database setup phase. WAL mode and busy timeout are one-line config changes but must be set from the first migration.

---

## Minor Pitfalls

---

### Pitfall 11: Webhook Signature Verification Ordering

**What goes wrong:** The webhook handler parses the JSON body (via Hono middleware) before verifying the GitHub webhook signature. Once the body is parsed, the raw bytes change, and signature verification fails. Or worse, verification is skipped entirely, and anyone can send fake webhook payloads to trigger pipeline runs.

**Prevention:**
- In Hono, use `c.req.raw.clone()` or `c.req.text()` to get the raw body BEFORE any JSON parsing middleware runs. Verify signature against raw bytes.
- Place webhook route before global JSON parsing middleware, or use Hono's route-specific middleware to exclude it.
- Use `crypto.timingSafeEqual()` for comparison -- never `===`.
- Include the `sha256=` prefix in comparison (GitHub's header includes it).

**Phase:** Webhook handler implementation. Get this right in the first commit.

---

### Pitfall 12: Cross-Repo Embedding Drift

**What goes wrong:** sqlite-vec embeddings are generated with a specific embedding model. If the model changes (version update, provider switch), old embeddings become incompatible with new ones. Similarity scores between old and new embeddings are meaningless.

**Prevention:**
- Store the embedding model identifier alongside each embedding vector.
- When changing models, either re-embed all historical data or maintain separate vector spaces.
- Pin the embedding model version in configuration.

**Phase:** Cross-repo intelligence implementation. Small upfront cost, massive pain to fix later.

---

### Pitfall 13: Force-Push Handling Creates Orphaned Runs

**What goes wrong:** Architecture says "new pipeline_run per force-push, re-render comment from latest." But if a force-push arrives while a previous run is still executing, you now have two runs for the same PR. The old run's stages complete and try to update the comment with stale results.

**Prevention:**
- On new pipeline_run for the same PR, mark all previous RUNNING runs as CANCELLED.
- Stage completion should check if its pipeline_run is still the latest for that PR before writing to the comment.
- The comment renderer should always query the latest pipeline_run, never use a run_id passed from stage completion.

**Phase:** Pipeline orchestration phase. This is a state machine concern.

---

### Pitfall 14: Large Diffs Exceeding Claude Context Window

**What goes wrong:** A PR with 50+ changed files and thousands of lines of diff exceeds Claude's context window when stuffed into the prompt. Tool_use mitigates this (AI reads files on demand), but the initial diff summary + tool definitions + system prompt still consume significant context.

**Prevention:**
- Never send the full diff as prompt content. Send a diff summary (files changed, insertions/deletions counts) and let the AI use tools to read specific files.
- Implement file prioritization: changed files sorted by risk (security-relevant > core logic > tests > config).
- Set a per-stage file read limit (e.g., max 20 files per stage).
- For PRs with >100 changed files, split into logical groups and run focused reviews.

**Phase:** Pipeline prompt design. Build the diff summarization before sending to Claude.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| GitHub App + Webhook Setup | Signature verification ordering (#11), duplicate delivery (#2) | Verify raw body before parse; idempotency key on X-GitHub-Delivery |
| Pipeline Architecture | Comment noise (#1), cost explosion (#5), concurrent writes (#10) | Three-tier findings, Sonnet not Opus, WAL mode + write serialization |
| Sandbox/Tool Implementation | Symlink escape (#3), shallow clone limits (#7) | realpathSync + symlink removal post-clone; accept history limitations |
| Claude API Integration | Token expiration (#4), cost (#5), self-assessment inflation (#8) | Octokit auth-app; prompt caching + token-efficient headers; structural quality heuristics |
| PR Comment Rendering | Update races (#6), formatting (#6), large diffs (#14) | Serialize comment updates; 1s delay between API calls; diff summarization |
| Cross-Repo Intelligence | Embedding drift (#12) | Pin model version, store model ID with embeddings |
| Infrastructure/Deploy | Tailscale Funnel reliability (#9), crash recovery (#2) | Health check endpoint; startup reconciliation; last-webhook indicator |
| Force-Push Handling | Orphaned runs (#13) | Cancel previous RUNNING runs; always render from latest pipeline_run |

## Sources

- [State of AI Code Review Tools in 2025](https://www.devtoolsacademy.com/blog/state-of-ai-code-review-tools-2025/)
- [Drowning in AI Code Review Noise: Signal vs. Noise Framework](https://dev.to/jet_xu/drowning-in-ai-code-review-noise-a-framework-to-measure-signal-vs-noise-304e)
- [I Ran 449 AI Code Reviews in 9 Days](https://dev.to/alexey-pelykh/i-ran-449-ai-code-reviews-in-9-days-then-i-almost-got-banned-17h5)
- [How Many False Positives Are Too Many](https://www.codeant.ai/blogs/ai-code-review-false-positives)
- [How Accurate Is AI Code Review in 2026](https://www.codeant.ai/blogs/ai-code-review-accuracy)
- [EscapeRoute: CVE-2025-53109 & CVE-2025-53110 -- Anthropic Filesystem MCP Sandbox Escape](https://cymulate.com/blog/cve-2025-53109-53110-escaperoute-anthropic/)
- [GitHub Docs: Troubleshooting Webhooks](https://docs.github.com/en/webhooks/testing-and-troubleshooting-webhooks/troubleshooting-webhooks)
- [GitHub Docs: Best Practices for Using Webhooks](https://docs.github.com/en/webhooks/using-webhooks/best-practices-for-using-webhooks)
- [GitHub Docs: Rate Limits for the REST API](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api)
- [GitHub Docs: Authenticating as a GitHub App Installation](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/authenticating-as-a-github-app-installation)
- [GitHub Docs: Best Practices for Creating a GitHub App](https://docs.github.com/en/apps/creating-github-apps/about-creating-github-apps/best-practices-for-creating-a-github-app)
- [Claude API: Prompt Caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)
- [Claude API: Token-Efficient Tool Use](https://claudelab.net/en/articles/api-sdk/claude-api-token-saving-updates-cost-optimization)
- [Claude API: Parallel Tool Use](https://platform.claude.com/docs/en/agents-and-tools/tool-use/parallel-tool-use)
- [Tailscale Funnel Docs](https://tailscale.com/kb/1223/funnel)
- [sqlite-vec Stable Release](https://alexgarcia.xyz/blog/2024/sqlite-vec-stable-release/index.html)
- [Webhook Idempotency Patterns](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/idempotency.md)
- [Production Webhook Idempotency Guard](https://github.com/momomonda/production-webhook-idempotency-guard)
- [Sandboxing Autonomous Agents Guide](https://www.ikangai.com/the-complete-guide-to-sandboxing-autonomous-agents-tools-frameworks-and-safety-essentials/)
- [NVIDIA: Sandboxing Agentic Workflows](https://developer.nvidia.com/blog/practical-security-guidance-for-sandboxing-agentic-workflows-and-managing-execution-risk/)
- [BullMQ vs In-Process Queues](https://judoscale.com/blog/node-task-queues)
