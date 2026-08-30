# Module A.4 — Shared State & HITL over AG-UI: Q&A Reference

---

**Q: How does a paused (`interrupt()`'d) run actually appear in the AG-UI event stream?**  
A: It **doesn't appear as a new event type** — verified by directly probing `streamMode: "messages"`: while a run is paused, the generator yields **nothing at all**. The pause only becomes visible when the stream ends and you check `agent.getState(config)` — its `tasks[0].interrupts` tells you the run stopped mid-way rather than completing.

---

**Q: What does the pause look like on the wire, then?**  
A: A **flavor of `RUN_FINISHED`**:

```json
{
  "type": "RUN_FINISHED", "threadId": "...", "runId": "...",
  "outcome": { "type": "interrupt", "interrupts": [
    { "id": "...", "reason": "approval_needed", "message": "...", "toolCallId": "..." }
  ]}
}
```

No dedicated `INTERRUPT` event exists in the 33. From the browser's point of view, the run "finished" — but `outcome.type` tells it "actually, I'm waiting on you."

---

**Q: Why shape `interrupt({...})`'s payload as `{ reason, message, toolCallId }` specifically?**  
A: Because those are exactly the fields AG-UI's real `Interrupt` schema expects. Shaping the payload that way up front makes the translator's mapping nearly free:

```ts
interrupts: pending.map((p) => ({ id: p.id, ...p.value }))
```

A team whose `interrupt()` calls carry arbitrary shapes would need a real field-by-field mapper here instead.

---

**Q: How does the human's decision get back to the agent?**  
A: `RunAgentInput` carries a `resume` array:

```json
{ "resume": [{ "interruptId": "int-1", "status": "resolved", "payload": "approve" }] }
```

The server reads `payload` and does exactly your 3.6 code, unchanged:

```ts
agent.stream(new Command({ resume: payload }), { configurable: { thread_id }, streamMode: "messages" })
```

AG-UI's `resume[]` is just the wire wrapper around `Command({ resume })` — nothing about the LangGraph side changes.

---

**Q: What's the difference between `STATE_SNAPSHOT` and `STATE_DELTA` here, and when is each sent?**  
A: `STATE_SNAPSHOT` once, right after `RUN_STARTED` — the UI's baseline (A.2's rule: snapshot on connect). `STATE_DELTA` for every change after — here, flipping `approvalStatus` between `"pending"` and `"resolved"` via a one-line JSON Patch. Same mechanics as A.2's demo, just driven by a real run instead of a toy example.

---

**Q: Why does the exercise's guard node need its own router, separate from the router that got you into it?**  
A: Because each node gets exactly **one** outgoing routing decision. `"llm"` routes to `approve` / `tools` / `done`; `"approve"` separately routes to `llm` (declined — a `ToolMessage` was appended) or `tools` (approved — state unchanged). Calling `.addConditionalEdges` twice on the same source node is invalid — LangGraph only keeps one; this bug was caught by writing the code, not by inspection.

---

**Q: How do you tell "approved" from "declined" inside the router, when `approvalGate` doesn't return a decision field?**  
A: By what changed in state. Declined → the gate appended a `ToolMessage` (so `state.messages.at(-1)?.getType() === "tool"`). Approved → the gate returned `{}`, so the last message is still the original `AIMessage` with pending `tool_calls`. The router reads that difference, not an explicit flag.

---

**Q: In real production, is this the actual wire shape a deployed LangGraph Platform + `@ag-ui/langgraph` produces?**  
A: The mechanism (interrupt → `RUN_FINISHED.outcome` → `resume[]` → `Command({resume})`) is the real, documented AG-UI convention — confirmed from `@ag-ui/core`'s own schemas. What's simplified here for teaching: real deployments generate `threadId` **client-side** up front (sent on the very first request, not minted by the server and echoed back via a custom event), and `@ag-ui/langgraph`'s `LangGraphAgent` does this same translation automatically once your graph is deployed to LangGraph Platform.

---

**Q: What breaks first in production? (interview question 3)**  
A:
1. **Interrupt payload shape drift** — if `interrupt()` calls across a codebase use inconsistent field names, the translator's `{ id, ...p.value }` mapping silently produces malformed `Interrupt` objects that fail schema validation client-side, with no clear error trail.
2. **Lost `threadId` on the client** — if the frontend doesn't persist which thread is paused, a page refresh strands the run forever with no way to resume it.
3. **Approval timeout** — nothing here expires a pending interrupt. A production system needs a policy (auto-reject after N hours, escalate) — same production note as Module 3.6.
