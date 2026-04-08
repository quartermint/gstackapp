---
phase: 13-multi-provider-routing-expansion
plan: 02
subsystem: mlx-proxy
tags: [mlx, local-inference, hono, proxy, mac-mini]
dependency_graph:
  requires: []
  provides: [mlx-proxy-server, local-model-inference, model-hot-swap]
  affects: [harness-openai-provider, pipeline-routing]
tech_stack:
  added: [hono, pino, "@hono/node-server"]
  patterns: [openai-compatible-proxy, metadata-injection, hot-swap-model-management]
key_files:
  created:
    - packages/mlx-proxy/package.json
    - packages/mlx-proxy/tsconfig.json
    - packages/mlx-proxy/src/index.ts
    - packages/mlx-proxy/src/inference.ts
    - packages/mlx-proxy/src/models.ts
    - packages/mlx-proxy/src/health.ts
    - packages/mlx-proxy/src/__tests__/proxy.test.ts
  modified: []
decisions:
  - Bind to Tailscale IP (100.123.8.125) only per T-13-05 threat mitigation
  - ModelManager prevents concurrent loads with loading flag per T-13-06
  - tokensPerSecond returns null when latencyMs is 0 to avoid division errors
metrics:
  duration: 163s
  completed: "2026-04-08T12:28:15Z"
  tasks_completed: 1
  tasks_total: 2
  tests_added: 9
  tests_passing: 9
---

# Phase 13 Plan 02: MLX Proxy Server Summary

Hono-based MLX proxy package wrapping mlx_lm.server with gstackapp-native metadata injection, model hot-swap management, and Tailscale-only network binding.

## Task Results

| Task | Name | Commit | Status | Files |
|------|------|--------|--------|-------|
| 1 | Create mlx-proxy package with Hono server, inference forwarding, and model management | dd450fc | Complete | 7 files created |
| 2 | Verify MLX proxy on Mac Mini | - | Awaiting human verification | - |

## Implementation Details

### packages/mlx-proxy/src/index.ts
Hono server with four endpoints:
- `POST /v1/chat/completions` - Forwards to mlx_lm backend, injects `_gstack` metadata
- `GET /v1/models/status` - Reports loaded model, GPU memory usage
- `POST /v1/models/load` - Hot-swaps models (unloads current, loads requested)
- `GET /health` - Backend reachability check with 5s timeout

### packages/mlx-proxy/src/inference.ts
`forwardCompletion()` measures latency, calculates tokens/second from usage.completion_tokens, and injects `_gstack: { provider: 'local', model, latencyMs, tokensPerSecond }` into every response.

### packages/mlx-proxy/src/models.ts
`ModelManager` class tracks currently loaded model, prevents concurrent loads (loading flag), and supports two models: Qwen3.5-35B-A3B (18GB) and Gemma 4 26B-A4B (9.6GB). Reports GPU memory as 24576MB total with estimated usage from model memory profile.

### packages/mlx-proxy/src/health.ts
`checkHealth()` pings `${backendUrl}/v1/models` with AbortController timeout, returns ok/error status with latency.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Test mock needed delay for tokensPerSecond calculation**
- **Found during:** Task 1 test writing
- **Issue:** Mocked fetch returned instantly (0ms latency), causing tokensPerSecond to be null instead of a number
- **Fix:** Added 10ms delay to mock fetch in test to ensure latencyMs > 0
- **Files modified:** packages/mlx-proxy/src/__tests__/proxy.test.ts
- **Commit:** dd450fc

## Threat Surface Scan

No new threat surface beyond what is documented in the plan's threat model. All mitigations implemented:
- T-13-05: BIND_HOST defaults to 100.123.8.125 (Tailscale only)
- T-13-06: ModelManager.loading flag prevents concurrent loads

## Known Stubs

None - all endpoints are fully implemented with real logic.

## Checkpoint: Human Verification Required

Task 2 requires physical Mac Mini hardware verification. See checkpoint details in executor output.
