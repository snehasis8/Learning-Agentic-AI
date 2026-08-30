# 🧠 Spaced Review Queue

> Keeps earlier concepts fresh. Each row points at the module's existing **Q&A file** — open it,
> quiz yourself on the questions, then record how it went:
> `npm run focus:review 1.1 pass`  (recalled well — push it further out)
> `npm run focus:review 1.1 miss`  (struggled — reset to tomorrow)
>
> The dashboard lists everything whose **Next due** is today or earlier.

**Leitner intervals:** Box 1 = +1 day · Box 2 = +3 · Box 3 = +7 · Box 4 = +16 · Box 5 = +35.
A `pass` moves the card up one box; a `miss` drops it back to Box 1.

| Module | Q&A source file | Box | Last reviewed | Next due |
|--------|-----------------|-----|---------------|----------|
| 1.1 | 01-langchain-basics/01-chat-model-qa.md | 2 | 2026-06-21 | 2026-06-24 |
| 1.2 | 01-langchain-basics/02-prompt-templates-qa.md | 2 | 2026-06-21 | 2026-06-24 |
| 1.3 | 01-langchain-basics/03-structured-output-qa.md | 1 | — | 2026-06-18 |
| 1.4 | 01-langchain-basics/04-chains-qa.md | 1 | — | 2026-06-18 |
| 1.5 | 01-langchain-basics/05-tools-qa.md | 1 | — | 2026-06-18 |
| 1.6 | 01-langchain-basics/06-simple-agent-qa.md | 1 | — | 2026-06-18 |
| 2.1 | 02-rag-memory/01-document-loaders-qa.md | 1 | — | 2026-06-18 |
| 2.2 | 02-rag-memory/02-embeddings-vector-stores-qa.md | 1 | — | 2026-06-18 |
| 2.3 | 02-rag-memory/03-basic-rag-qa.md | 1 | — | 2026-06-22 |
| 3.1 | 03-langgraph/01-hello-graph-qa.md | 1 | — | 2026-08-04 |
| 3.2 | 03-langgraph/02-state-management-qa.md | 1 | — | 2026-08-12 |
| 3.3 | 03-langgraph/03-conditional-edges-qa.md | 1 | — | 2026-08-13 |
| 3.4 | 03-langgraph/04-tool-calling-agent-qa.md | 1 | — | 2026-08-18 |
| 3.5 | 03-langgraph/05-checkpointing-qa.md | 1 | — | 2026-08-19 |
| 3.6 | 03-langgraph/06-human-in-the-loop-qa.md | 1 | — | 2026-08-20 |
| A.1 | 04-agui/01-why-agui-qa.md | 1 | — | 2026-08-24 |
| A.2 | 04-agui/02-event-protocol-qa.md | 1 | — | 2026-08-27 |
| A.3 | 04-agui/03-langgraph-integration-qa.md | 1 | — | 2026-08-30 |
| A.4 | 04-agui/04-shared-state-hitl-qa.md | 1 | — | 2026-08-31 |
