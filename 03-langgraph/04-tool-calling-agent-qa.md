# Module 3.4 — Tool-Calling Agent: Q&A Reference

---

**Q: What does `bindTools()` actually do?**  
A: It attaches the tool **schemas** (name, description, zod shape) to the request sent to the model. That's all. The model still cannot execute anything — binding just lets it *know what exists* so it can ask for one by name.

---

**Q: What does the model return when it wants to use a tool?**  
A: An `AIMessage` with **empty `content`** and a populated **`tool_calls`** array:

```json
{ "name": "get_weather", "args": { "city": "Amsterdam" }, "id": "call_B4Lq..." }
```

That's a **request**, not a result. Nothing has run. The `id` matters — the tool result must reference it so the model can match answer to question.

---

**Q: What is `ToolNode`?**  
A: A prebuilt node that reads `tool_calls` off the last message, executes the matching tools, and appends the results as **`ToolMessage`s** (each carrying the matching `tool_call_id`). It's the "act" half of the loop.

---

**Q: What is the agent loop, as a graph?**  
A: Two nodes and one conditional edge:

```
       llm ──────────────┐
        ▲                ▼
        │        (tool_calls present?)
        │           yes │      │ no
      tools ◄───────────┘      ▼
                             END
```

`.addEdge("tools", "llm")` is the cycle — after running tools you **always** return to the model so it can read the results and decide what's next.

---

**Q: How does the router decide?**  
A: It inspects the **last message** and checks for tool calls. Pure function, no execution:

```ts
function shouldContinue(state) {
  const last = state.messages[state.messages.length - 1];
  return last.tool_calls?.length ? "tools" : "done";
}
```

---

**Q: Why is `MessagesAnnotation` essential here?**  
A: Because the loop feeds on history. Each pass appends — the model's request, the tool results, the final answer — and the model sees the **whole trail** on the next pass. That accumulated history *is* the agent's reasoning trace. With an overwrite reducer, the agent would forget what it just did.

---

**Q: How does this relate to `createAgent()`?**  
A: `createAgent({ llm, tools })` builds **exactly this graph**. Same two nodes, same conditional edge, same cycle. Use the prebuilt version in real code — but knowing the internals means you can modify it: add a guard node before tools, cap iterations, log every call, or require human approval (3.6). You can't do any of that with a black box.

---

**Q: Can the model request several tools at once?**  
A: Yes. `tool_calls` is an array — one pass can request `get_weather` *and* `calculate`, and `ToolNode` runs them together, appending one `ToolMessage` each. That's why a two-part question resolves in a single loop iteration.

---

**Q: What breaks first in production? (interview question 3)**  
A:
1. **Unbounded loops** — a confused model ping-pongs `llm → tools` until `GraphRecursionError`. `recursionLimit` is the backstop; a step counter in state is the real fix.
2. **Tool errors** — `ToolNode` has `handleToolErrors: true` by **default**, so a throwing tool does *not* kill the run: the exception is caught and appended as a `ToolMessage` reading `Error: <msg>\n Please fix your mistakes.`, and the model usually explains or retries. Set `handleToolErrors: false` to make it fail fast instead. The real risk is the *opposite* of a crash — a silent degrade, where the agent apologises to the user while your alerting sees a successful run. Log tool failures explicitly, and prefer your own domain-specific error strings ("order not found — check the id format") over the generic wrapper, because that text is all the model has to reason with.
3. **Cost blowup** — every iteration re-sends the entire history, including long tool outputs. Truncate large results before they enter state.
4. **Malformed args** — the model will eventually send a bad argument. zod validation on the tool schema is what catches it.
