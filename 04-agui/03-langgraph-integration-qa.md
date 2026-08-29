# Module A.3 — LangGraph + AG-UI Integration: Q&A Reference

---

**Q: Why doesn't this module use `@ag-ui/langgraph`?**  
A: `LangGraphAgent` from that package requires `deploymentUrl` + `graphId` — it talks HTTP to a **deployed LangGraph Platform server**, not an in-process `.compile()`'d graph. Wiring it up would mean standing up LangGraph Platform first (Module 5.4 territory). Writing the translator by hand is ~40 lines, needs no deployment, and teaches exactly what that package automates.

---

**Q: What does `streamMode: "messages"` actually give you for a tool-calling agent?**  
A: A stream of `[AIMessageChunk | ToolMessage, metadata]` tuples. For a single tool call:

```
chunk 1: tool_call_chunks[0] = { name: "searchOrder", id: "call_...", args: "" }
chunk 2-8: tool_call_chunks[0] = { args: "{\"" }, { args: "order" }, ...
chunk (tool type): content = the tool's return value
chunk N+: content = "Order", " A", "123", ...  (the final reply, token by token)
```

This is real data behaving exactly like the hand-built demos in A.1/A.2 — the model streams tool arguments as partial JSON text, same as it streams a reply as partial words.

---

**Q: How do you tell a `TOOL_CALL_START` chunk from a `TOOL_CALL_ARGS` chunk?**  
A: Only the **first** fragment of a tool call carries `name` (and the real `id`). Every fragment after that carries only `args`. So:

```ts
if (c.name) { /* TOOL_CALL_START */ }
if (c.args) { /* TOOL_CALL_ARGS */ }
```

Both can be true on the very first chunk — the check order matters.

---

**Q: How do you know when a tool call is finished?**  
A: There's no explicit "tool call done" chunk in `streamMode: "messages"`. The signal is **the next message being type `"tool"`** — that's the `ToolMessage` carrying the result. On seeing it, close the open `TOOL_CALL_END` first, then emit `TOOL_CALL_RESULT`.

---

**Q: What's the simplification this module makes, and why does it matter?**  
A: The translator tracks **one open tool call at a time** via a single `openToolCallId` variable. That's correct for this agent (one tool call per turn) but breaks under **parallel tool calls** (Module 3.2's fan-out) — multiple calls would need to be tracked per-index using `chunk.index`, keyed alongside the message id. A production adapter combines `streamMode: ["messages", "updates"]` for that reason.

---

**Q: Why validate every event before writing it to the socket?**  
A: Because a malformed event fails **silently** in the browser — `EventSource` doesn't surface a parse error to your UI logic. The server-side guard:

```ts
const check = EventSchemas.safeParse(event);
if (!check.success) { console.error(...); continue; }
res.write(`data: ${JSON.stringify(event)}\n\n`);
```

means a bug in the translator is caught in your server logs, not discovered by a user staring at a broken chat bubble.

---

**Q: Why `EventSource` and not `fetch()` + manual stream reading?**  
A: `EventSource` is the **browser-native** SSE client — it handles the `data:`/blank-line framing (the format from `scratch/s5`) and **reconnects automatically** on a dropped connection, for free. `.onmessage` fires once per parsed frame; you never touch raw bytes.

---

**Q: In the client, why keep updating one `<div>` instead of appending new lines for every `TEXT_MESSAGE_CONTENT`?**  
A: Because `delta` is a fragment, not a complete unit (A.2's Pattern 1). Appending a new element per delta would render dozens of tiny lines. The correct rendering is: accumulate into one string, keep re-setting one element's content — same idea as your Step 2 reducer, just driving the DOM instead of a plain object.

---

**Q: What breaks first in production? (interview question 3)**  
A:
1. **Parallel tool calls** — the single-open-call assumption silently merges or misattributes concurrent calls' argument fragments.
2. **Unvalidated events reaching the client** — skip the `safeParse` guard and a malformed event corrupts client-side state with no error anywhere.
3. **No reconnect/resume story** — if the SSE connection drops mid-run, this simple server has no way to resume from where it left off; a real deployment needs the run's state persisted (ties back to Module 3.5's checkpointer) so a client can reconnect and catch up via a `STATE_SNAPSHOT`.
