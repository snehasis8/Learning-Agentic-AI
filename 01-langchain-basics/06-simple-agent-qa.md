# Module 1.6 — Simple Agent: Q&A Reference

---

**Q: What is the difference between the tool loop in Module 1.5 and an agent?**  
A: Module 1.5 was a **single round** — one model call produces tool requests, you execute them, one final model call gives the answer. An agent is a **loop** — it keeps calling tools and reasoning until it decides it has enough information to answer. The number of rounds is not fixed; the model decides when to stop.

---

**Q: What is ReAct?**  
A: ReAct stands for **Reasoning + Acting**. It's the pattern every LLM agent uses:
1. **Reason** — the model thinks about what it needs
2. **Act** — it calls a tool
3. **Observe** — it reads the result
4. Repeat until done, then produce a final answer

The key insight: reasoning and acting are interleaved. Each observation can change what the model reasons about next.

---

**Q: What stops the agent loop?**  
A: Two things:
1. **The model stops calling tools** — it returns an `AIMessage` with no `tool_calls`. This means it has enough information to answer.
2. **MAX_STEPS is reached** — a hard safety limit to prevent infinite loops. `createReactAgent` has this built in.

In the manual loop you wrote, you check: `if (!response.tool_calls || response.tool_calls.length === 0) break`.

---

**Q: What is sequential vs parallel tool use?**  
A: 
- **Parallel**: The model calls multiple tools *in the same step* because neither depends on the other. (e.g. get MSFT price AND AAPL price at the same time — covered in Module 1.5)
- **Sequential**: The model calls one tool, reads the result, *then* decides what to call next because step N depends on the result of step N-1. (e.g. get MSFT price first, *then* multiply that price × 100 shares)

Agents handle both. The while loop makes sequential reasoning possible.

---

**Q: What does `createReactAgent` replace?**  
A: It replaces the entire manual `while` loop you wrote in Part 2:
```ts
// ~25 lines of manual loop code replaced by:
const agent = createReactAgent({ llm: model, tools });
const result = await agent.invoke({ messages: [...] });
```
Internally it does the same thing: binds tools, loops until no more tool calls, manages message history, enforces step limits.

---

**Q: What does `result.messages` contain after an agent run?**  
A: The full conversation history in order:
```
HumanMessage        ← your question
AIMessage           ← model requests tool(s)
ToolMessage         ← tool result(s)
AIMessage           ← model requests more tool(s) (if needed)
ToolMessage         ← more results
...
AIMessage           ← final answer (no tool_calls)
```
You always read `result.messages[result.messages.length - 1].content` to get the final answer.

---

**Q: What is `stateModifier` in `createReactAgent`?**  
A: It's how you inject a system prompt. It prepends a system message before every invocation, giving the agent persona, constraints, and behavioral rules. You can pass a plain string or a function that modifies the state.

---

**Q: Why does the agent sometimes call tools in a different order than you'd expect?**  
A: The model reasons about the most efficient path. If two pieces of information are independent, it may request both in parallel (one `AIMessage` with two `tool_calls`). If they're dependent, it requests them sequentially. You don't control the order — the model does, based on its reasoning.

---

**Q: What's the risk of an infinite loop in an agent?**  
A: If the model never produces a response with empty `tool_calls` — e.g. due to a bad tool description causing repeated failed calls — the loop runs forever. Always set a `MAX_STEPS` limit. `createReactAgent` defaults to a safe limit internally.

---

**Q: How does this relate to LangGraph (Phase 3)?**  
A: `createReactAgent` is actually built on top of LangGraph under the hood. It creates a graph with two nodes:
- `agent` node: calls the model
- `tools` node: executes tool calls

And a conditional edge: if `tool_calls` → go to `tools` node, else → end.

In Phase 3 you'll build this graph manually, which gives you full control — custom state, human-in-the-loop interrupts, branching logic, subgraphs. `createReactAgent` is the fast path; LangGraph is the full power.
