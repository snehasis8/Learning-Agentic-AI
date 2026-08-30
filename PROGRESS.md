# 📊 Progress Tracker

> Source of truth for **what's done** and **what's next**. Tick `- [ ]` → `- [x]` as you go.
> The 👉 marker shows where you are now — move it to your current module.
> Run `npm run focus` any time for a live dashboard (streak, next step, due reviews, finish date).

**Module status legend:** module lines are `**N.N**`, sub-bullets are exercises/projects.

---

## Phase 1 — LangChain Foundations
- [x] **1.1** Chat Models
  - [x] Exercise: News article analyzer
- [x] **1.2** Prompt Templates
- [x] **1.3** Structured Output
- [x] **1.4** Chains (LCEL)
- [x] **1.5** Tools
  - [x] Exercise: Unit converter / word counter / days calculator
- [x] **1.6** Simple Agent
  - [x] Exercise: Travel query agent

> ✅ **Azure auth resolved** (2026-08-11): moved to the Foundry `prompt-store` resource
> using the **v1 API** (`<endpoint>/openai/v1`, no `api-version` needed). Key auth works.
> All models go through `lib/llm.ts` — import `{ llm, embeddings }` from there.
> ⚠️ Legacy `02-rag-memory/*.ts` still use `AzureChatOpenAI` and need swapping to `lib/llm.ts`.

## ✅ DONE — Phase 3 — LangGraph Fundamentals
- [x] **3.1** Hello Graph — State / Node / Edge, streamMode
- [x] **3.2** State Management — reducers, MessagesAnnotation, zod + withLangGraph
- [x] **3.3** Conditional Edges — routing, path maps, cycles, recursionLimit
- [x] **3.4** Tool-Calling Agent — bindTools, tool_calls, ToolNode, the ReAct loop
- [x] **3.5** Checkpointing — MemorySaver, thread_id, getStateHistory, time travel
- [x] **3.6** Human-in-the-Loop — interrupt/Command, interruptBefore, updateState
- [x] 🏗️ Mini-Project: Support Ticket Triage Agent (3.2 + 3.3 combined)
      `03-langgraph/exercises/03-triage-agent.ts` — LLM routing, parallel
      enrichment, retry cycle. Reference solution alongside it.

## 🔴 ACTIVE — Phase 3.5 — AG-UI Protocol
> **Stack:** `@ag-ui/core` (event schemas) · `@ag-ui/client` · `@ag-ui/langgraph`
> **Approach:** terminal-first. No frontend until A.3/A.4, and then only a
> single static HTML file with `EventSource` — no React, no build step.

- [x] **A.1** Why AG-UI
      The problem: `streamMode` events are LangGraph-specific. Any frontend has
      to be rewritten per framework. AG-UI standardises the wire format.
- [x] **A.2** The Event Protocol
      The event catalogue: lifecycle (RunStarted/Finished/Error, Step*),
      text (TextMessageStart/Content/End), tools (ToolCallStart/Args/End/Result),
      state (StateSnapshot, StateDelta via RFC-6902 JSON Patch, MessagesSnapshot),
      reasoning, and Raw/Custom escape hatches.
- [x] **A.3** LangGraph + AG-UI integration
      Map 3.1's streamMode output onto AG-UI events; serve over SSE.
      First (tiny) HTML client appears here.
- [x] **A.4** Shared State & HITL over AG-UI
      StateDelta for shared state; carrying 3.6's interrupt payloads to the
      browser so a human can approve/edit from the UI.

## 🔴 ACTIVE — Module 4.7 — MCP (pulled forward)
- [ ] **4.7** MCP (Model Context Protocol) 👉 YOU ARE HERE
  - [ ] Exercise: Raw MCP server → rebuild with mcp-use

## 🔴 ACTIVE — Phase 3.6 — Generative UI / Widgets
- [ ] **W.1** Generative UI Fundamentals
- [ ] **W.2** Tool-Rendered Widgets
- [ ] **W.3** Interactive Widgets → Agent

---

## Phase 2 — RAG & Memory (partly done; rest = backlog)
- [x] **2.1** Document Loaders
  - [x] Exercise: Load + split a text file
- [x] **2.2** Embeddings & Vector Stores
  - [x] Exercise: Embed chunks, similarity search
- [x] **2.3** Basic RAG
  - [x] Exercise: Q&A over a document
- [x] **2.4** Advanced RAG (concepts + 3 interview Qs done)
  - [ ] Exercise: Improve RAG with multi-query + measure with RAGAS
- [ ] **2.4b** Elasticsearch as Vector Store (also in project — promote on demand)
  - [ ] Exercise: Migrate 2.3 pipeline to ES with hybrid retrieval
- [ ] **2.4c** pgvector as Vector Store (POC / simpler stacks)
  - [ ] Exercise: Migrate 2.3 pipeline to pgvector
- [ ] **2.5** Conversational Memory (+ Postgres checkpointer)
  - [ ] Exercise: Chatbot with memory (in-memory AND pg-backed)
- [ ] **2.6** GraphRAG (Neo4j / FalkorDB)
  - [ ] Exercise: GraphRAG pipeline over a document set
- [ ] 🏗️ Mini-Project: RAG Chatbot over documents (deploy + README + push)

## Phase 4 — Agentic Patterns (rest)
- [ ] **4.1** Streaming
- [ ] **4.2** Subgraphs
- [ ] **4.3** Multi-Agent
- [ ] **4.4** Plan-and-Execute
- [ ] **4.5** Reflection
- [ ] **4.6** Long-Term Memory
- [ ] 🏗️ Mini-Project: Multi-Agent Research Assistant with React UI

## Phase 5 — Production & Deep Agents
- [ ] **5.1** Deep Agents
- [ ] **5.2** Evaluation (LangSmith + RAGAS)
- [ ] **5.3** Reliability
- [ ] **5.4** Deployment
- [ ] **5.5** Azure AI Foundry Production Layer
- [ ] **5.6** Claude Agent SDK

## Phase 6 — AI Governance & Security
- [ ] **6.1** Guardrails & Output Validation
- [ ] **6.2** Audit Logging & Observability
- [ ] **6.3** EU AI Act Basics

## Capstone
- [ ] 🎓 Capstone Project — Personal Research Assistant (full agentic app)

---

## Pace & Projection

- **Target pace:** ~5 sessions/week (set in `.claude/hooks/focus.mjs` → `SESSIONS_PER_WEEK`).
- **Effort weights:** module ≈ 1.5 sessions · mini-project ≈ 3 · capstone ≈ 10.
- The dashboard sums the **remaining** weighted units and divides by your weekly pace to project a
  finish date. It self-adjusts every time you check off an item — no manual recalculation needed.
