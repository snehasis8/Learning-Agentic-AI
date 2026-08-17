# Module 3.3 — Conditional Edges: Q&A Reference

---

**Q: What's the difference between `addEdge` and `addConditionalEdges`?**  
A: `addEdge("a","b")` is **static** — after `a`, always go to `b`. `addConditionalEdges("a", router)` is **dynamic** — after `a`, call `router(state)` and go wherever it says. Static = fixed pipeline; conditional = decisions at runtime.

---

**Q: What is a routing function, and what must it return?**  
A: A pure function `(state) => "nameOfNextNode"`. It **reads state and returns a destination**. It must not do work and must not update state — that's a node's job.

Keeping routers pure matters because: they're easy to unit-test in isolation, flow stays traceable, and (Module 3.5) they aren't re-run the same way on resume, so side effects there are unreliable.

---

**Q: What is a path map and why use one?**  
A: A third argument mapping the router's return values to node names:

```ts
.addConditionalEdges("classify", router, {
  billing:   "billingReply",
  technical: "techReply",
  general:   "generalReply",
})
```

Three benefits:
1. The router speaks **domain words** (`"billing"`), not wiring details — rename a node and only the map changes.
2. Every possible destination is **declared in one place**.
3. Graph **visualisers** read it to draw your diagram; undeclared edges can't be drawn.

---

**Q: How do you create a cycle?**  
A: Point a conditional edge **backwards** at a node that already ran:

```ts
.addConditionalEdges("critique", shouldRewrite, {
  rewrite: "write",   // ← backwards = cycle
  done: END,
})
```

This is the one thing a chain fundamentally cannot do, and it's why LangGraph exists. Retry, refine, re-plan, and the whole agent loop are all cycles.

---

**Q: Why does every cycle need an "escape hatch"?**  
A: Because a quality threshold alone may never be met — a model can plateau below your bar forever. Always pair the quality check with a hard attempt cap:

```ts
if (state.score >= 8) return "done";      // quality exit
if (state.attempts >= 5) return "done";   // escape hatch — REQUIRED
return "rewrite";
```

---

**Q: What is `recursionLimit` and what does exceeding it mean?**  
A: A cap on super-steps (default **25**). Exceeding it throws `GraphRecursionError` instead of hanging forever:

```
GraphRecursionError: Recursion limit of 8 reached without hitting a stop condition.
```

**Treat it as a bug in your router, not a limit to raise.** Bumping the number to "fix" a runaway loop just burns more tokens before failing.

---

**Q: How should an LLM decide the branch?**  
A: With **structured output**, never by parsing free text:

```ts
const Decision = z.object({
  category: z.enum(["billing", "technical", "general"]),
  urgent: z.boolean(),
});
const d = await llm.withStructuredOutput(Decision).invoke(prompt);
return { category: d.category };
```

The enum guarantees the value is one your path map can handle. Routing on `response.content.includes("billing")` is how you get silent misroutes in production.

---

**Q: How does this connect to the agent loop in 3.4?**  
A: The ReAct loop *is* a conditional edge plus a cycle:

```
llm -> (did it request a tool?) -> tools -> back to llm
                                 -> otherwise -> END
```

Once you can route and cycle, `createAgent` stops being a black box — it's this graph with tool-calling wired in.

---

**Q: What breaks first in production? (interview question 3)**  
A:
1. **Cycles with no escape hatch** — quality never reaches threshold, you burn tokens until `GraphRecursionError`.
2. **Routing on unstructured text** — the model phrases it differently one day and every ticket misroutes, silently.
3. **Routers that do work or mutate state** — makes flow untraceable and behaves inconsistently on resume/replay.
4. **Unmapped return values** — the router returns a word not in the path map; runtime error on a rare branch you never tested.
