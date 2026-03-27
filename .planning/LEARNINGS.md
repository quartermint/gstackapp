# Learnings

## Flash-MoE: Local LLM Gateway Design Insights (2026-03-18)

**Source:** github.com/danveloper/flash-moe — SSD-streaming inference engine for large MoE models on Apple Silicon.

**For v1.2 Local LLM Gateway:**

1. **Session-persistent context is critical.** Flash-MoE demonstrates 98% context reuse in 10-turn conversations — second-turn TTFT drops to nearly zero by persisting KV cache and attention state between requests. The Session Orchestrator routes conversations; the local gateway MUST maintain session state across turns, not cold-start each request. Design the gateway API with session IDs from day one.

2. **Provider interface must be protocol-agnostic.** Flash-MoE speaks raw tokens, not OpenAI-compatible API. LM Studio speaks OpenAI-compat. Cloud providers have their own APIs. The gateway abstraction should normalize all of these so the router doesn't care about the backend. Design: thin adapter layer per provider, not one-protocol assumption.

3. **pread() over mmap() for model serving.** If the gateway ever wraps a custom inference engine (replacing LM Studio), use direct I/O. On 24GB Mac Mini, memory pressure from mmap'd model files causes OS compressor thrashing. `vm_stat` diagnostic: watch decompressions during inference.

## 2026-03-25 -- Cross-Session Learnings

### Event loop starvation from hung filesystem mounts
<!-- problem_type: bug -->
<!-- component: packages/api/scanner -->
<!-- root_cause: D-state processes from hung NFS/SMB/external mounts block Node.js filesystem calls, starving the event loop -->
<!-- resolution_type: workaround -->
<!-- severity: critical -->
<!-- date: 2026-03-25 -->

**Problem:** The API server became unresponsive intermittently, with all endpoints timing out.
**Root Cause:** The project scanner uses `fs.stat`/`fs.readdir` on configured project paths. When an external mount (NFS, SMB, or even a hung USB drive) enters D-state (uninterruptible sleep), Node.js filesystem calls block the libuv thread pool. With the default 4 threads all blocked, the entire event loop starves.
**Solution:** Set `UV_THREADPOOL_SIZE=16` to increase the libuv thread pool. Add timeouts to filesystem operations using `AbortController`. Exclude external mount paths from the scanner config.
**Key Insight:** A single hung filesystem mount can take down an entire Node.js server. The D-state cascade is: mount hangs -> fs call blocks -> libuv thread blocked -> pool exhausted -> event loop starved -> all endpoints dead.

### N+1 query in listCaptures endpoint
<!-- problem_type: performance -->
<!-- component: packages/api/routes/captures -->
<!-- root_cause: Loading related data (tags, enrichments) per capture in a loop instead of batch query -->
<!-- resolution_type: fix -->
<!-- severity: medium -->
<!-- date: 2026-03-25 -->

**Problem:** The listCaptures endpoint was slow with 100+ captures, taking 500ms+ for what should be a simple list query.
**Root Cause:** Each capture loaded its tags and AI enrichment data in separate queries inside a loop. With 100 captures, this generated 200+ queries instead of 3.
**Solution:** Use Drizzle's `with` clause or raw SQL JOINs to batch-load related data in a single query. For the common list view, only load summary fields and lazy-load details on demand.
**Key Insight:** N+1 queries hide in ORMs that make individual loads look cheap. Always check query count on list endpoints. Drizzle's `with` relations feature exists specifically for this.

### No auth in v1: Tailscale boundary is the access control
<!-- problem_type: security -->
<!-- component: packages/api -->
<!-- root_cause: Deliberate design decision for single-user Tailscale-isolated deployment -->
<!-- resolution_type: design_change -->
<!-- severity: low -->
<!-- date: 2026-03-25 -->

**Problem:** No authentication or authorization layer in the API.
**Root Cause:** Deliberate architectural decision. Mission Control runs on a Mac Mini behind Tailscale. Only devices on the Tailscale network can reach it. Adding auth would add complexity with no security benefit for a single-user system.
**Solution:** Accept this as v1 architecture. Document it clearly. If multi-user is ever needed, add Tailscale ACL-based identity.
**Key Insight:** Not every API needs authentication. For single-user, network-isolated services, the network boundary IS the auth layer. Adding JWT/OAuth on top of Tailscale is defense-in-depth theater that costs real development time.
