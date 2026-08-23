# Module A.1 — Why AG-UI: Q&A Reference

---

**Q: What does a chat UI actually need from an agent?**  
A: Seven things, and a plain text stream gives you **one**:
1. run started (spinner, disable input)
2. tokens arriving — and *which message* they belong to
3. a tool was called (show "🔧 Searching…")
4. the tool returned
5. agent state changed (sidebar, form, progress)
6. approval needed (render a dialog)
7. run ended or failed

Everything not in the stream has to be *inferred* by the frontend — and inference is where UIs rot.

---

**Q: LangGraph already has `streamMode`. Why isn't that enough?**  
A: Because it's a **debug feed, not a wire contract**. Look at the shape:

```js
{ "llm": { messages: [...] } }      // ← the key is YOUR node name
```

Three problems:
- The frontend becomes coupled to your graph's internals — rename a node, break the UI.
- There's no event for "run started", "tool started", or "approval needed" — you'd diff message arrays to infer them.
- Swap LangGraph for another framework and the shape is completely different.

It's excellent for *you* debugging. It's a poor interface for *someone else* rendering.

---

**Q: What is AG-UI, in one sentence?**  
A: A fixed vocabulary of **33 typed events** that any agent can emit and any compliant frontend can consume, so neither side needs to know the other's internals.

---

**Q: What are the event categories?**  
A:
| Group | Events |
|---|---|
| **Lifecycle** | `RUN_STARTED`, `RUN_FINISHED`, `RUN_ERROR`, `STEP_STARTED`, `STEP_FINISHED` |
| **Text** | `TEXT_MESSAGE_START`, `_CONTENT`, `_END`, `_CHUNK` |
| **Tools** | `TOOL_CALL_START`, `_ARGS`, `_END`, `_CHUNK`, `_RESULT` |
| **State** | `STATE_SNAPSHOT`, `STATE_DELTA`, `MESSAGES_SNAPSHOT` |
| **Reasoning** | `THINKING_*`, `REASONING_*` (incl. `REASONING_ENCRYPTED_VALUE`) |
| **Activity** | `ACTIVITY_SNAPSHOT`, `ACTIVITY_DELTA` |
| **Escape hatch** | `RAW`, `CUSTOM` |

---

**Q: Why is a streamed message three events instead of one?**  
A: Because the UI must render **before** the content exists.

```
TEXT_MESSAGE_START   { messageId, role }    → create the bubble
TEXT_MESSAGE_CONTENT { messageId, delta }   → append a token (many times)
TEXT_MESSAGE_END     { messageId }          → finalise it
```

`START` says what to create, `CONTENT` fills it in, `END` closes it. Same pattern for tools (`TOOL_CALL_START` / `_ARGS` / `_END` / `_RESULT`).

---

**Q: What is the shared `messageId` / `toolCallId` for?**  
A: **Routing deltas to the right place.** Several things can stream concurrently — two messages, three tool calls. The id is how each delta finds its own bubble. Without it, interleaved streams would be unreconstructable.

---

**Q: What is `STATE_DELTA` and why not just resend the state?**  
A: It carries **RFC-6902 JSON Patch** operations instead of the whole object:

```json
[{ "op": "replace", "path": "/customer/plan", "value": "enterprise" }]
```

Sending full state on every tick is wasteful and racy. This is the reducer idea from Module 3.2, moved onto the wire.

---

**Q: What do `RAW` and `CUSTOM` exist for?**  
A: Escape hatches. `RAW` wraps an underlying framework event you want to pass through untranslated; `CUSTOM` carries an application-specific `{ name, value }`. They stop the protocol from being a straitjacket — but anything you send through them is, by definition, not portable.

---

**Q: What does standardising actually buy you? (interview answer)**  
A: Decoupling in both directions:
- **Swap the agent framework** → change the server only, UI untouched
- **Add a second frontend** (mobile, CLI, Slack) → reuse the same event stream
- **Common UI needs are first-class** — "tool running", streaming state, approval flows — instead of each team inventing its own JSON

The parallel worth drawing: **MCP standardises agent↔tool; AG-UI standardises agent↔user.**
