Project: MineTech Operations Intelligence Platform

Candidate: Chukwuma Pascal Onuoha

Architecture Philosophy:  keep the user experience clean, but make the backend disciplined. Zero-cost, fully air-gapped, deterministic degradation.

1. Model Choice, Quantization & Serving
Decision: qwen2.5:3b served via Ollama, utilizing default 4-bit quantization (Q4_0).

The "Why": The constraint was a zero-cost, self-hosted deployment. While 7B+ models produce richer prose, the incident triage workflow strictly requires perfect JSON schema adherence. Instruction-tuned Qwen 2.5 at 3B parameters is uniquely disciplined at structured extraction while remaining small enough to run in CPU RAM without thrashing.

The Trade-off: A smaller model sacrifices conversational nuance for speed and hardware compatibility.

The Path Forward: Because the Ollama REST implementation is model-agnostic, upgrading to a GPU-hosted 8B or 14B model in production requires zero code changes—only an environment variable update.

2. Retrieval Strategy (RAG)
Decision: Hybrid retrieval using PostgreSQL (pgvector) with a deterministic keyword fallback.

The "Why": Documents are chunked, embedded locally using nomic-embed-text, and stored directly in Postgres to avoid the "dual-write" problem of introducing a separate vector database. The system searches for the top chunks above a strict cosine similarity threshold. If the vector search returns zero results, it safely falls back to standard ILIKE SQL keyword matching.

The Trade-off: The strict similarity threshold improves precision but risks missing relevant context on loosely worded questions. The ILIKE fallback acts as a safety net for exact-match queries (e.g., specific equipment IDs) where embeddings often struggle.

3. Handling Malformed Output & Hallucinations
Incident Triage (Graceful Degradation):
I implemented a three-layer deterministic fallback pipeline to ensure the workflow never fails silently:

Validation: Zod parsing and JSON extraction from the raw LLM response.

Correction Loop: If validation fails (e.g., markdown-wrapped output), the bad output is sent back to the model with a targeted repair prompt.

Regex Extraction: If the model repeatedly fails, the system bypasses the LLM entirely and extracts a usable ticket using deterministic Regex on the raw text.

Knowledge Assistant (Hallucination Prevention):
Instead of relying on prompt-engineering to force the model to self-censor, I built hallucination prevention into the architecture. If the hybrid retrieval layer finds zero relevant chunks, the LLM generation step is bypassed completely. A hardcoded refusal is returned instantly. A 3B model hallucinating mine safety protocols is significantly worse than an honest negative.

4. Latency vs. Hardware Trade-offs
Performance: On a constrained CPU, triage takes 4–8s (warm) and 12–25s (cold). RAG answers stream via custom Server-Sent Events (SSE) within ~10s.

The Trade-off: These numbers are unacceptable for consumer SaaS, but acceptable for an internal operations tool where agents process tickets asynchronously.

Optimization: To keep latency predictable, I capped the triage generation budget at 192 tokens. This is enough room for a suggested reply but structurally prevents runaway generation loops. Moving this exact architecture to a basic cloud GPU would cut both paths to under 3 seconds.

5. Ambiguous Spec Decisions
The assessment explicitly left certain domain parameters undefined. I made the following assumptions:

The Triage Schema: I expanded the schema to 24 mining-specific categories (e.g., ventilation_air_quality, geology_geotechnical, water_dewatering). Limiting this to 3 or 4 generic categories forces edge cases into "Other," which ruins dashboard analytics in a real operational environment.

Priority Mapping: Priority is mapped directly to operational consequence, not user sentiment. "Urgent" is strictly reserved for active safety risks, stopped equipment, or loss of critical systems (e.g., braking, ventilation).
