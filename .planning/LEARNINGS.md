# Learnings

## Flash-MoE: Local LLM Gateway Design Insights (2026-03-18)

**Source:** github.com/danveloper/flash-moe — SSD-streaming inference engine for large MoE models on Apple Silicon.

**For v1.2 Local LLM Gateway:**

1. **Session-persistent context is critical.** Flash-MoE demonstrates 98% context reuse in 10-turn conversations — second-turn TTFT drops to nearly zero by persisting KV cache and attention state between requests. The Session Orchestrator routes conversations; the local gateway MUST maintain session state across turns, not cold-start each request. Design the gateway API with session IDs from day one.

2. **Provider interface must be protocol-agnostic.** Flash-MoE speaks raw tokens, not OpenAI-compatible API. LM Studio speaks OpenAI-compat. Cloud providers have their own APIs. The gateway abstraction should normalize all of these so the router doesn't care about the backend. Design: thin adapter layer per provider, not one-protocol assumption.

3. **pread() over mmap() for model serving.** If the gateway ever wraps a custom inference engine (replacing LM Studio), use direct I/O. On 24GB Mac Mini, memory pressure from mmap'd model files causes OS compressor thrashing. `vm_stat` diagnostic: watch decompressions during inference.
