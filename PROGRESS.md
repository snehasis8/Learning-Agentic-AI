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

## Phase 2 — RAG & Memory
- [x] **2.1** Document Loaders
  - [x] Exercise: Load + split a text file
- [x] **2.2** Embeddings & Vector Stores
  - [x] Exercise: Embed chunks, similarity search
- [x] **2.3** Basic RAG
  - [x] Exercise: Q&A over a document
- [ ] **2.4** Advanced RAG (multi-query, re-ranking, hybrid, RAGAS) 👉 YOU ARE HERE
  - [ ] Exercise: Improve RAG with multi-query + measure with RAGAS
- [ ] **2.4b** Elasticsearch as Vector Store (production — HNSW kNN, BM25, RRF)
  - [ ] Exercise: Migrate 2.3 pipeline to ES with hybrid retrieval
- [ ] **2.4c** pgvector as Vector Store (POC / simpler stacks)
  - [ ] Exercise: Migrate 2.3 pipeline to pgvector
- [ ] **2.5** Conversational Memory (+ Postgres checkpointer)
  - [ ] Exercise: Chatbot with memory (in-memory AND pg-backed)
- [ ] **2.6** GraphRAG (Neo4j / FalkorDB)
  - [ ] Exercise: GraphRAG pipeline over a document set
- [ ] 🏗️ Mini-Project: RAG Chatbot over documents (deploy + README + push)

## Phase 3 — LangGraph Fundamentals
- [ ] **3.1** Hello Graph
- [ ] **3.2** State Management
- [ ] **3.3** Conditional Edges
- [ ] **3.4** Tool-Calling Agent
- [ ] **3.5** Checkpointing
- [ ] **3.6** Human-in-the-Loop

## Phase 4 — Agentic Patterns
- [ ] **4.1** Streaming
- [ ] **4.2** Subgraphs
- [ ] **4.3** Multi-Agent
- [ ] **4.4** Plan-and-Execute
- [ ] **4.5** Reflection
- [ ] **4.6** Long-Term Memory
- [ ] **4.7** MCP (Model Context Protocol)
  - [ ] Exercise: Raw MCP server → rebuild with mcp-use
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
