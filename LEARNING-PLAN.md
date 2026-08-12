# Agentic AI Engineer Learning Roadmap

**TL;DR**: A structured, hands-on curriculum going from LangChain fundamentals → LangGraph → Agentic AI patterns, using Node.js + Azure OpenAI (GPT-4.1 + text-embedding-3-large). Each module has a concept explanation followed by a small code exercise. Mini-projects at phase boundaries. End goal: strong agentic AI engineer.

---

## Teaching Approach: First-Principles Learning

Every module follows this pattern:
1. **Why?** — What problem does this solve? What pain exists without it?
2. **How does it work underneath?** — The mechanics (e.g., what an embedding vector actually is, how the agent loop works step-by-step)
3. **Build it raw first** — Before using LangChain abstractions, understand the underlying pattern (e.g., manually call LLM → parse tool calls → execute → loop, before using `createAgent`)
4. **Then use the abstraction** — Now the library API makes sense because you know what it hides
5. **Exercise** — Hands-on code that reinforces the fundamentals, not just copy-paste API usage

---

## Phase 1: LangChain Foundations (Week 1-2)

**Objective**: Understand the core building blocks that everything else is built on.

| # | Module | Key Concepts | Exercise |
|---|--------|-------------|----------|
| 1.1 | Chat Models | LLMs as chat completions, message roles, temperature, tokens | Connect to Azure OpenAI GPT-4.1, send prompt, get response |
| 1.2 | Prompt Templates | `ChatPromptTemplate`, variables, few-shot prompting | Reusable translation prompt template |
| 1.3 | Structured Output | JSON from LLMs, Zod schemas, `.withStructuredOutput()` | Extract product info from unstructured text |
| 1.4 | Chains (LCEL) | `.pipe()`, `RunnableSequence`, composing prompt → model → parser | Topic → blog outline → JSON chain |
| 1.5 | Tools | `tool()`, Zod schemas, how LLMs decide to call tools | Calculator + date tools |
| 1.6 | Simple Agent | Agent loop (reason → act → observe), `createAgent` | Multi-tool agent for multi-step questions |

**Module 1 Bar — Before Moving to Phase 2, You Must:**
- Explain what an embedding vector is without Googling
- Build a simple ReAct agent from a blank file with no tutorial open
- Explain every line of your agent code if asked

---

## Phase 2: RAG & Memory (Week 3-4)

**Objective**: Build real-world patterns — retrieval-augmented generation and conversational memory.

| # | Module | Key Concepts | Exercise |
|---|--------|-------------|----------|
| 2.1 | Document Loaders | Loading files, `TextLoader`, `RecursiveCharacterTextSplitter` | Load + split a text file |
| 2.2 | Embeddings & Vector Stores | Semantic similarity, `AzureOpenAIEmbeddings`, vector DB | Embed chunks, similarity search |
| 2.3 | Basic RAG | Retrieve → Augment → Generate, retriever chains | Q&A over a document |
| 2.4 | Advanced RAG | Multi-query retrieval, re-ranking, hybrid search, RAGAS evaluation | Improve RAG with multi-query + measure quality with RAGAS |
| 2.4b | **Elasticsearch as Vector Store** (enterprise / production) | `dense_vector` fields, HNSW approximate kNN, `num_candidates` vs `k` (recall/latency tradeoff), inverted index + BM25, **hybrid search** (BM25 + kNN), **Reciprocal Rank Fusion (RRF)**, index mapping (`dims`, `similarity`) | Migrate your 2.3 RAG pipeline from `MemoryVectorStore` to Elasticsearch. Chunk + embed in your own code, index into ES, retrieve with **hybrid** (BM25 + kNN + RRF). Build from scratch — no Copilot |
| 2.4c | **pgvector as Vector Store** (POCs / simpler stacks) | Postgres `vector` extension, `vector` column type, index types (IVFFlat vs HNSW), similarity operators (`<->` L2, `<=>` cosine, `<#>` inner product), vectors alongside relational data | Migrate the same 2.3 RAG pipeline to **pgvector**. Then write down: when would you pick pgvector over Elastic, and why? |
| 2.5 | Conversational Memory | `MemorySaver`, message history, summarization, **PostgreSQL checkpointer** (persists conversation *state* — NOT vectors; different job from pgvector in 2.4c) | Chatbot with memory — implement both in-memory AND pg-backed |
| 2.6 | GraphRAG | Knowledge graphs, Neo4j/FalkorDB, entity extraction, graph traversal + vector hybrid retrieval | Build a GraphRAG pipeline over a document set — explain why graph beats plain vector store |

> **Why 2.4b matters**: This is your **enterprise production stack right now**. `MemoryVectorStore` is brute-force and in-memory — fine for learning, useless at scale. Elasticsearch uses HNSW approximate kNN over millions of vectors — navigate a hierarchy (city → neighbourhood → street) instead of comparing against every vector — plus **hybrid** BM25 + kNN fused with **RRF**, so exact terms (codes, names, IDs) AND semantic meaning both surface. Explaining HNSW, the `num_candidates` recall/latency dial, and RRF fusion signals real production RAG experience — most candidates can't. Build it yourself; don't let Copilot own your retrieval layer.

> **Why 2.4c matters**: pgvector is your **POC stack**, and the most common vector store in the wider job market — Postgres is everywhere, pgvector is just an extension. It puts vectors *next to* your relational data: one database instead of two, simpler ops, no second system to run.
>
> **The senior answer to "which one?"**: *"If the app already runs on Postgres and scale is moderate, pgvector avoids operating a second system. If you need hybrid lexical + semantic search at scale, Elastic earns its keep."* Pick the store by the shape of the problem — same principle as vector-vs-graph.

> **Why 2.6 matters**: GraphRAG is your biggest differentiator for European AI roles. Most engineers only know vector stores. Graph + vector hybrid is what enterprise clients actually need for complex document relationships. Remember the rule: **similarity questions → vector/search engine (Elastic); relationship/traversal questions → graph DB (Neo4j).**

**Mini-Project** 🏗️: RAG Chatbot over documents — deploy it, write a README, push to GitHub

---

## 🔴 ACTIVE TRACK — Project-Driven Priority (reordered 2026-08-03)

Priority now follows the **live project stack** (LangGraph → AG-UI → MCP → Generative UI widgets).
Nothing is dropped — Phase 2 leftovers (2.4b Elastic, 2.4c, 2.5, 2.6) move to the backlog and get
pulled forward whenever the project needs them (Elastic is also in the project — promote on demand).

| Order | What | Why now |
|-------|------|---------|
| 1 | **Phase 3 — LangGraph** (3.1–3.6) | Building it at work right now |
| 2 | **Phase 3.5 — AG-UI Protocol** (A.1–A.4) | Agent↔frontend layer of the project |
| 3 | **Module 4.7 — MCP** (pulled forward) | Project uses MCP server + `mcp-use` |
| 4 | **Phase 3.6 — Generative UI / Widgets** (W.1–W.3) | Agent-rendered React components |
| — | *Backlog*: 2.4b, 2.4c, 2.5, 2.6, rest of P4, P5, P6, capstone | Resume after, or on project demand |

> **Prerequisite for everything**: Azure OpenAI now rejects key auth (`AuthenticationTypeDisabled`).
> Must finish the **Entra ID token auth** migration (`az login` + `azureADTokenProvider`) before any
> module code runs.

---

## Phase 3: LangGraph Fundamentals (Week 5-6)

**Objective**: Understand the graph-based orchestration framework that powers complex agents.

| # | Module | Key Concepts | Exercise |
|---|--------|-------------|----------|
| 3.1 | Hello Graph | `StateGraph`, `START`, `END`, why graphs matter | Minimal graph with single node |
| 3.2 | State Management | `StateSchema`, custom state, reducers | Graph with counter + messages |
| 3.3 | Conditional Edges | `addConditionalEdges`, routing, branching | Route by user intent |
| 3.4 | Tool-Calling Agent | ReAct loop as a graph: LLM → tool → conditional | Build agent from scratch |
| 3.5 | Checkpointing | `MemorySaver`, durable execution, thread IDs | Interrupt and resume agent |
| 3.6 | Human-in-the-Loop | Interrupts, approval workflows, state editing | Pause for human approval |

> **Why 3.5 + 3.6 matter for Europe**: EU AI Act requires human oversight for high-risk AI decisions. HITL is not optional in enterprise European deployments — it's a compliance requirement. Interviewers at Dutch and Irish enterprise companies will ask about this.

---

## Phase 3.5: AG-UI Protocol (Agent ↔ Frontend) — PROJECT PRIORITY

**Objective**: Standardised, event-based streaming between your LangGraph agent and the UI.
Docs: https://docs.ag-ui.com/introduction

| # | Module | Key Concepts | Exercise |
|---|--------|-------------|----------|
| A.1 | Why AG-UI | Why REST/GraphQL break for agents (long-running, nondeterministic, streaming, multi-turn); AG-UI as an abstraction over HTTP/WebSockets | Write down 3 things a request/response API cannot express about an agent run |
| A.2 | The Event Protocol | The event stream as the contract: message/token events, tool-call events, state events, lifecycle; bidirectional flow | Consume a raw AG-UI event stream and log every event type in order |
| A.3 | LangGraph + AG-UI | 1st-party LangGraph integration; mapping graph nodes/state to AG-UI events; the AG-UI Dojo demos | Expose your Phase 3 LangGraph agent over AG-UI |
| A.4 | Shared State & HITL | Shared agent↔app state + conflict resolution; interrupts, approvals, edits over the protocol | Add an approval interrupt driven from the frontend |

> **Why this matters**: AG-UI is becoming the standard agent↔UI layer (CopilotKit is the 1st-party
> client; LangGraph is a partner integration). It's the piece most backend-heavy AI engineers skip —
> and it's exactly what makes an agent feel like a product instead of a curl call.

---

## Phase 3.6: Generative UI / Widgets — PROJECT PRIORITY

**Objective**: The agent renders real interactive React components, not just text.

| # | Module | Key Concepts | Exercise |
|---|--------|-------------|----------|
| W.1 | Generative UI Fundamentals | Static typed components vs declarative//language-driven UI; when the agent should render a widget instead of prose | Render one typed component from a tool result |
| W.2 | Tool-Rendered Widgets | Mapping tool calls → React components; streaming tool output into a live widget; frontend vs backend tools | Build 2–3 widgets (e.g. chart, form, card) driven by agent tool calls |
| W.3 | Interactive Widgets → Agent | Widgets that send user input *back* into the agent (forms, approvals, selections); state sync | A form widget whose submission resumes the graph |

---

## Phase 4: Agentic Patterns (Week 7-8)

**Objective**: Master multi-agent patterns and production-grade agentic architectures.

| # | Module | Key Concepts | Exercise |
|---|--------|-------------|----------|
| 4.1 | Streaming | Stream tokens, events, intermediate steps | Real-time streaming agent |
| 4.2 | Subgraphs | Nested graphs, modular design | Parent delegates to child graphs |
| 4.3 | Multi-Agent | Supervisor pattern, swarm, handoffs | Supervisor → researcher + writer |
| 4.4 | Plan-and-Execute | Task decomposition, sequential execution, re-planning | Complex task breakdown agent |
| 4.5 | Reflection | Self-evaluation, retry with feedback, critique loops | Code gen + self-correction |
| 4.6 | Long-Term Memory | Cross-session memory, user profiles | Remembers preferences across sessions |
| 4.7 | MCP (Model Context Protocol) | MCP fundamentals: hosts, clients, servers; the three primitives (tools, resources, prompts); the **mcp-use** framework (server + client + agent, LangChain-compatible); MCP Inspector for debugging; Foundry-hosted MCP tools | Build a **raw MCP server first** (understand the protocol), THEN rebuild it with **mcp-use** — feel what the framework hides. Connect it to a LangChain/LangGraph agent |

> **Why 4.7 matters**: MCP is becoming the standard for agent-tool communication. Your office project uses the **mcp-use** library and GitHub MCP. Understanding MCP from the protocol up means you can explain and extend it — not just use it as a black box. `mcp-use` is a LangChain-compatible wrapper, so it sits directly on the stack you're already learning; learn raw MCP first and the framework becomes obvious.

**Mini-Project** 🏗️: Multi-Agent Research Assistant with React UI

---

## Phase 5: Production & Deep Agents (Week 9-10)

**Objective**: Learn production patterns, evaluation, and enterprise-grade deployment.

| # | Module | Key Concepts | Exercise |
|---|--------|-------------|----------|
| 5.1 | Deep Agents | Planning, virtual filesystem, subagent-spawning | Compare Deep Agent vs LangChain agent |
| 5.2 | Evaluation | Agent quality testing, LangSmith traces, RAGAS scoring (faithfulness, answer relevancy, context precision) | Write eval tests + RAGAS scores for your RAG pipeline |
| 5.3 | Reliability | Retry logic, fallbacks, timeout, graceful degradation | Add error handling to existing agent |
| 5.4 | Deployment | LangGraph Platform, API servers, containers | Package agent as API |
| 5.5 | Azure AI Foundry Production Layer | Foundry Agent Service vs LangGraph tradeoffs, built-in guardrails configuration, Model Router for cost optimization, `azure-ai-projects` SDK for evaluation, **Foundry tool registration** (agents move to Foundry, custom ops stay on your own server) | Deploy your Phase 4 agent through Foundry Agent Service and compare with your LangGraph implementation. Map the hybrid pattern: which parts run in Foundry vs on your server |
| 5.6 | Claude Agent SDK | Agent SDK vs LangGraph tradeoffs, `allowedTools`, `permissionMode`, `maxTurns`, streaming output | Refactor one LangGraph agent using Claude Agent SDK — document the tradeoff |

> **Why 5.5 + 5.6 matter**: You're already using Azure OpenAI SDK and Claude Agent SDK in production at HCLTech. But you need to be able to explain *why* you chose each approach and what the tradeoffs are. Interviewers will ask. Your project's direction — agentic layer moving to Foundry with custom operations on your own server — is exactly the 5.5 hybrid pattern.

---

## Phase 6: AI Governance & Security (Week 10 — Cross-Cutting)

**Objective**: This is your Europe-specific edge. EU AI Act is live. Enterprise clients demand this.

| # | Module | Key Concepts | Exercise |
|---|--------|-------------|----------|
| 6.1 | Guardrails & Output Validation | Prompt injection defense, output validation, content filtering, Azure built-in guardrails | Add a validation layer to your Phase 4 capstone agent |
| 6.2 | Audit Logging & Observability | Structured logging for AI decisions, LangSmith tracing, monitoring agent behaviour | Add full audit trail to your multi-agent system |
| 6.3 | EU AI Act Basics | High-risk AI classification, transparency requirements, HITL obligations, security compliance | Map your capstone project against EU AI Act requirements — identify what's compliant and what needs work |

> **Why Phase 6 matters**: Most AI engineers can build Box 2 and Box 3 of the Agentic AI Architecture diagram. Very few can speak to Box 6 — Orchestration & Governance. This is your competitive advantage for European enterprise roles in Netherlands, Germany, and Ireland.

---

## Capstone Project (Week 11-12)

**Full Agentic Application** combining everything:

- Multi-agent system with supervisor pattern
- GraphRAG for knowledge base
- Human-in-the-loop for approvals
- Long-term memory for user context
- Streaming React UI
- LangSmith tracing + RAGAS evaluation
- EU AI Act compliance layer (guardrails, audit logging)
- Deployed — not just running locally

**Recommended Project**: **Personal Research Assistant**
- Searches web, summarises documents, builds knowledge graphs
- Naturally incorporates GraphRAG + knowledge graphs
- HITL before publishing any output
- Memory across sessions
- This becomes the centrepiece of every European interview conversation

---

## Stack

- **Runtime**: Node.js 20+ with TypeScript
- **LLM**: Azure OpenAI GPT-4.1
- **Embeddings**: Azure OpenAI text-embedding-3-large
- **Vector DB**: MemoryVectorStore (learning) → **Elasticsearch — hybrid BM25 + kNN (Phase 2.4b, your production stack)** → pgvector (Phase 2.5) → Azure AI Search (Capstone)
- **Graph DB**: Neo4j or FalkorDB (Phase 2.6)
- **MCP**: `mcp-use` (server + client + agent, LangChain-compatible) + GitHub MCP
- **Packages**: `langchain`, `@langchain/core`, `@langchain/openai`, `@langchain/langgraph`, `@anthropic-ai/claude-agent-sdk`, `mcp-use`, `zod`, `dotenv`
- **UI** (when needed): React with Vite
- **Tracing**: LangSmith + RAGAS
- **Deployment**: Azure AI Foundry / LangGraph Platform

---

## Certifications (Do In Parallel — Not Instead Of Building)

| Cert | When | Why |
|---|---|---|
| **Claude Certified Architect, Foundations (CCA-F)** | ASAP — confirm exam deadline with office | Office-nominated (partner access is the hard part — you have it). Overlaps your Module 4.7 (MCP), 5.6 (Agent SDK), and VibePath project. Study while you build |
| **AZ-204** Azure Developer Associate | Month 6 | European enterprise hiring managers trust this — directly validates your Azure stack |
| **AI-102** Azure AI Engineer Associate | Month 8 | Covers Azure AI Foundry, OpenAI, cognitive services — your production stack |

---

## Open Questions / To Verify (Confirm At Work — Don't Assume)

These are things heard at work but NOT yet confirmed. Verify before treating as fact (or writing into an interview answer):

1. **Elastic hybrid fusion** — is it Reciprocal Rank Fusion (RRF) or a weighted score blend?
2. **Elastic index mapping** — what is the `dims` value (should be 3072 for `text-embedding-3-large`) and is `similarity` cosine / dot_product / l2_norm?
3. **Foundry tool registration** — are tools being registered/catalogued in Azure AI Foundry? If so, is `mcp-use` exposing them as MCP servers that Foundry catalogs, or is it separate Foundry-native registration?
4. **mcp-use usage** — which part is the team using: MCP server, client, or agent?

> The habit that matters: track the unknown, then go verify it with the domain owner. This is what separates engineers who understand their systems from those who guess.

---

## Interview Readiness Checklist (Ask Yourself After Every Module)

After each module, answer these three questions without notes:

1. What problem does this solve that the previous approach didn't?
2. How does it work underneath — not the API, the mechanics?
3. What breaks first when you put this in production?

If you can't answer all three — you don't own the module yet.
