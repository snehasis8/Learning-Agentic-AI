# Project Context

## Who I Am
Senior Tech Lead at HCLTech, ~8 yrs, building a production agentic app
(LangGraph + AG-UI + MCP, RAG on Elasticsearch). I own architecture and POC
decisions at work, so I need every pattern in hand — not just the ones interviews ask.
Target: FDE or full-stack AI engineer role in Europe.

## Start Every Session
1. Read HANDOFF-2026-09-04.md — it overrides the ACTIVE TRACK in LEARNING-PLAN.md.
2. Read PROGRESS.md for the 👉 marker.
3. Run the focus dashboard context (SessionStart hook prints it).

## Rules
- Teaching files (`NN-topic.ts`) and Q&A files (`NN-topic-qa.md`): you write these,
  in the same style as 03-langgraph/05-checkpointing.ts.
- Exercises and solutions: I write these. Never write exercise code for me.
- When I paste broken code, ask me what I think is wrong first.
- Every module ends with: the 3 interview questions (problem solved / how it works
  underneath / what breaks in production), one new Q in the -qa.md, one review card.
- Keep sessions to 30–45 min of scope. If a module needs more, split it.
- Build raw before the abstraction (SSE before AG-UI, JSON-RPC before the MCP SDK).

## Stack
- Runtime: Node.js 20+ / TypeScript. All models via `lib/llm.ts` — import `{ llm, embeddings }`.
- LLM: Azure OpenAI GPT-4.1 (Foundry `prompt-store` resource, v1 API, key auth works).
- Embeddings: text-embedding-3-large (3072 dims).
- Vector store: MemoryVectorStore (learning) → Elasticsearch hybrid BM25+kNN (work) → pgvector (POCs).
- Framework: LangChain JS → LangGraph. Checkpointer: MemorySaver → PostgresSaver.
- Wires: AG-UI (agent↔UI), MCP (agent↔tool), A2A (agent↔agent, upcoming).
- Tracing/eval: LangSmith + RAGAS (not yet wired).
- Postgres via docker-compose.yml.

## Repo Layout
- 01-langchain-basics/ — complete
- 02-rag-memory/ — 2.1–2.4 concepts done; 2.4b/2.4c/2.5/2.6 pending
- 03-langgraph/ — complete, incl. triage-agent mini-project
- 04-agui/ — complete
- 05-mcp/ — M.1 in progress, paused per handoff
- lib/ — shared llm client
- .claude/ — focus dashboard hooks + local UI