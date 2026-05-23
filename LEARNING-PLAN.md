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

---

## Phase 2: RAG & Memory (Week 3-4)

**Objective**: Build real-world patterns — retrieval-augmented generation and conversational memory.

| # | Module | Key Concepts | Exercise |
|---|--------|-------------|----------|
| 2.1 | Document Loaders | Loading files, `TextLoader`, `RecursiveCharacterTextSplitter` | Load + split a text file |
| 2.2 | Embeddings & Vector Stores | Semantic similarity, `AzureOpenAIEmbeddings`, vector DB | Embed chunks, similarity search |
| 2.3 | Basic RAG | Retrieve → Augment → Generate, retriever chains | Q&A over a document |
| 2.4 | Advanced RAG | Multi-query retrieval, re-ranking, hybrid search | Improve RAG with multi-query |
| 2.5 | Conversational Memory | `MemorySaver`, message history, summarization | Chatbot with memory |
| 🏗️ | **Mini-Project** | RAG Chatbot over documents | |

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
| 🏗️ | **Mini-Project** | Multi-Agent Research Assistant with React UI | |

---

## Phase 5: Production & Deep Agents (Week 9-10)

**Objective**: Learn production patterns, evaluation, and the Deep Agents abstraction.

| # | Module | Key Concepts | Exercise |
|---|--------|-------------|----------|
| 5.1 | Deep Agents | Planning, virtual filesystem, subagent-spawning | Compare Deep Agent vs LangChain agent |
| 5.2 | Evaluation | Agent quality testing, LangSmith traces | Write eval tests for an agent |
| 5.3 | Reliability | Retry logic, fallbacks, timeout, graceful degradation | Add error handling to existing agent |
| 5.4 | Deployment | LangGraph Platform, API servers, containers | Package agent as API |

---

## Capstone Project (Week 11-12)

**Full Agentic Application** combining everything:
- Multi-agent system with supervisor pattern
- RAG for knowledge base
- Human-in-the-loop for approvals
- Long-term memory for user context
- Streaming React UI
- LangSmith tracing
- Evaluation suite

**Project ideas** (pick one):
1. **AI Project Manager** — breaks down tasks, researches solutions, writes code, gets human review
2. **Customer Support System** — RAG over docs, escalation paths, learning from feedback
3. **Personal Research Assistant** — searches web, summarizes papers, builds knowledge graphs

---

## Stack

- **Runtime**: Node.js 20+ with TypeScript
- **LLM**: Azure OpenAI GPT-4.1
- **Embeddings**: Azure OpenAI text-embedding-3-large
- **Packages**: `langchain`, `@langchain/core`, `@langchain/openai`, `@langchain/langgraph`, `zod`, `dotenv`
- **UI** (when needed): React with Vite
- **Tracing** (optional): LangSmith
