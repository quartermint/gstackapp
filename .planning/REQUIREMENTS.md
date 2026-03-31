# Requirements: gstackapp

**Defined:** 2026-03-30
**Core Value:** Every PR gets reviewed by five specialized AI brains — each one catches what the others miss. The pipeline visualization makes the review process visible, not a black box.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### GitHub Integration

- [x] **GHUB-01**: User can install GitHub App on their account and select repositories
- [x] **GHUB-02**: App receives PR webhooks on open, synchronize (push), and reopen events
- [x] **GHUB-03**: App creates and refreshes installation access tokens for API calls
- [x] **GHUB-04**: Force-push to a PR triggers a new pipeline run (re-renders comment from latest)
- [x] **GHUB-05**: Webhook handler ACKs within 10 seconds and processes pipeline async

### Pipeline Engine

- [x] **PIPE-01**: PR webhook triggers 5-stage cognitive review pipeline (CEO, Eng, Design, QA, Security)
- [x] **PIPE-02**: All 5 stages execute in parallel via Promise.allSettled
- [x] **PIPE-03**: Each stage runs Claude API with tool_use (read_file, list_files, search_code)
- [x] **PIPE-04**: Shallow clone of repository to /tmp with strict path + symlink sandboxing
- [x] **PIPE-05**: Each stage produces structured findings with typed Zod schema
- [x] **PIPE-06**: Each stage assigns a verdict: PASS, FLAG, BLOCK, or SKIP
- [x] **PIPE-07**: Dedicated prompt file per stage (packages/api/src/pipeline/prompts/*.md)
- [x] **PIPE-08**: Pipeline completes review in under 5 minutes for typical PRs
- [x] **PIPE-09**: Pipeline persists RUNNING status before stages begin (crash recovery)

### Review Output

- [x] **REVW-01**: Pipeline posts a structured PR summary comment with findings from all stages
- [x] **REVW-02**: PR comment updates in-place as each stage completes (incremental rendering)
- [x] **REVW-03**: Per-PR mutex prevents concurrent comment updates from parallel stages
- [ ] **REVW-04**: Inline PR review comments on specific diff lines via GitHub Review API
- [x] **REVW-05**: Findings include severity classification mapped to PASS/FLAG/BLOCK/SKIP
- [x] **REVW-06**: Multi-language support (Claude handles all languages natively)

### Dashboard

- [x] **DASH-01**: Pipeline visualization as hero view (60%+ viewport height)
- [x] **DASH-02**: Pipeline shows 5 stages as connected flow nodes with spectral identity colors
- [x] **DASH-03**: Real-time SSE streaming of pipeline progress to dashboard
- [x] **DASH-04**: Dim-to-bright reveal animation when a stage completes
- [x] **DASH-05**: Running pulse animation on active stages
- [x] **DASH-06**: Reverse-chronological PR feed across all connected repos
- [x] **DASH-07**: PR detail view showing findings grouped by stage
- [x] **DASH-08**: Dashboard is the landing page (no auth required in v1)
- [x] **DASH-09**: Desktop-only layout (1024px min-width), dark mode only
- [x] **DASH-10**: Dashboard follows DESIGN.md aesthetic (industrial precision, electric lime accent)

### Cross-Repo Intelligence

- [x] **XREP-01**: All findings embedded via sqlite-vec on pipeline completion
- [x] **XREP-02**: Cross-repo matches surface "Seen in your other repos" callouts when similarity exceeds threshold
- [x] **XREP-03**: Cross-repo insights appear in both PR comment and dashboard detail view

### Quality & Trends

- [ ] **TRND-01**: Quality scores tracked per repo over time
- [ ] **TRND-02**: Per-stage pass/flag/block rates visualized as trend charts
- [ ] **TRND-03**: Finding frequency trends visible on dashboard

### Onboarding

- [ ] **ONBD-01**: In-app guided setup wizard: install GitHub App → select repos → trigger first review
- [ ] **ONBD-02**: Onboarding detects when no repos are connected and surfaces the wizard
- [ ] **ONBD-03**: First review experience shows pipeline in action with real PR data

### Signal Quality

- [x] **SGNL-01**: Three-tier finding classification filters noise (critical / notable / minor)
- [ ] **SGNL-02**: False positive feedback via thumbs up/down on individual findings
- [x] **SGNL-03**: Feedback stored for future prompt improvement (not auto-applied in v1)

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Authentication & Multi-User

- **AUTH-01**: User can sign in with GitHub OAuth
- **AUTH-02**: Multi-user support with org-scoped repositories
- **AUTH-03**: Per-user dashboard views and settings

### Advanced Integration

- **INTG-01**: GitHub Checks API for opt-in merge blocking
- **INTG-02**: Configurable review rules per repository via dashboard
- **INTG-03**: Webhook retry handling with exponential backoff

### Platform Expansion

- **PLAT-01**: Light mode theme
- **PLAT-02**: Mobile responsive layout
- **PLAT-03**: Multi-provider AI support (Gemini, OpenAI, local models)

### Advanced Intelligence

- **INTL-01**: Auto-improving prompts based on false positive feedback
- **INTL-02**: Per-repo custom instructions (learned preferences)
- **INTL-03**: Finding deduplication across stages

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| IDE extension (VS Code, Cursor, JetBrains) | Different product surface — users already have Claude Code/Cursor/Copilot in IDE |
| Auto-fix / one-click patch generation | Builders want to know WHAT to fix, not have it done for them. Phase 3+ after review quality proven |
| Static analysis rules engine | Claude IS the rules engine — no config files, no rule maintenance |
| Enterprise SSO / SAML / SCIM | Target audience is indie devs, not enterprise procurement |
| Self-hosted / on-premises deployment | SaaS only. Mac Mini Phase 1, cloud Phase 2 |
| GitLab / Bitbucket / Azure DevOps | Target audience uses GitHub exclusively |
| Custom config files (.coderabbit.yaml) | Sensible defaults over YAML config in repos |
| Jira / Linear integration | Focus on PR review experience, not workflow stitching |
| CLI tool for local review | PR review only — local workflow has Cursor/Claude Code already |
| Test generation | QA stage flags missing coverage but does not generate tests |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| GHUB-01 | Phase 1 | Complete |
| GHUB-02 | Phase 1 | Complete |
| GHUB-03 | Phase 1 | Complete |
| GHUB-04 | Phase 1 | Complete |
| GHUB-05 | Phase 1 | Complete |
| PIPE-01 | Phase 2 | Complete |
| PIPE-02 | Phase 2 | Complete |
| PIPE-03 | Phase 2 | Complete |
| PIPE-04 | Phase 2 | Complete |
| PIPE-05 | Phase 2 | Complete |
| PIPE-06 | Phase 2 | Complete |
| PIPE-07 | Phase 2 | Complete |
| PIPE-08 | Phase 2 | Complete |
| PIPE-09 | Phase 2 | Complete |
| REVW-01 | Phase 3 | Complete |
| REVW-02 | Phase 3 | Complete |
| REVW-03 | Phase 3 | Complete |
| REVW-04 | Phase 3 | Pending |
| REVW-05 | Phase 3 | Complete |
| REVW-06 | Phase 3 | Complete |
| DASH-01 | Phase 4 | Complete |
| DASH-02 | Phase 4 | Complete |
| DASH-03 | Phase 4 | Complete |
| DASH-04 | Phase 4 | Complete |
| DASH-05 | Phase 4 | Complete |
| DASH-06 | Phase 4 | Complete |
| DASH-07 | Phase 4 | Complete |
| DASH-08 | Phase 4 | Complete |
| DASH-09 | Phase 4 | Complete |
| DASH-10 | Phase 4 | Complete |
| XREP-01 | Phase 5 | Complete |
| XREP-02 | Phase 5 | Complete |
| XREP-03 | Phase 5 | Complete |
| TRND-01 | Phase 6 | Pending |
| TRND-02 | Phase 6 | Pending |
| TRND-03 | Phase 6 | Pending |
| ONBD-01 | Phase 6 | Pending |
| ONBD-02 | Phase 6 | Pending |
| ONBD-03 | Phase 6 | Pending |
| SGNL-01 | Phase 3 | Complete |
| SGNL-02 | Phase 3 | Pending |
| SGNL-03 | Phase 3 | Complete |

**Coverage:**
- v1 requirements: 42 total
- Mapped to phases: 42
- Unmapped: 0

---
*Requirements defined: 2026-03-30*
*Last updated: 2026-03-30 after roadmap creation*
