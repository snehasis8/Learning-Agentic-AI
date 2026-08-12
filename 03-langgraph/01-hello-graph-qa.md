# Module 3.1 — Hello Graph: Q&A Reference

---

**Q: Why does LangGraph exist when we already had LCEL chains?**  
A: A chain (`prompt.pipe(model).pipe(parser)`) is a **straight line** — data flows one way, start to finish. Real agents need four things a line cannot express:
1. **Cycles** — call a tool, inspect the result, maybe call another. You must be able to loop back.
2. **Branching** — route based on intent, or on what the model decided.
3. **Shared state** — a scratchpad every step reads and writes.
4. **Pausing/resuming** — stop mid-run, wait for a human, continue later.

`createAgent` (Module 1.6) did all this, but as a black box. LangGraph makes the machine explicit so you can see, inspect, and change it.

---

**Q: What are the three primitives of LangGraph?**  
A:
- **State** — one shared object for the whole run; the memory/channel between steps.
- **Node** — a function `(state) => partial update`; does the actual work.
- **Edge** — the wiring that decides which node runs next.

One-line mental model: **nodes mutate state, edges decide flow.**

---

**Q: What does a node function receive and what must it return?**  
A: It receives the **full current state** and returns a **partial update** — only the fields it wants to change. It must NOT mutate the state object directly, and it must NOT return the entire state. LangGraph merges the returned partial back into state using each field's reducer.

```ts
function greet(state) {
  return { message: `Hello, ${state.message}!` }; // partial, not the whole state
}
```

---

**Q: What is `Annotation.Root` actually for? Isn't it just TypeScript types?**  
A: No — it's a **runtime** schema, not just compile-time typing. LangGraph needs to know, for every field, **how to merge** a node's update into the existing value. That merge function is the reducer. TypeScript types vanish at runtime; the annotation does not.

---

**Q: What is a reducer, and what is the default?**  
A: A reducer is the merge function for one field: `(existingValue, updateValue) => mergedValue`.

- **Default reducer = overwrite** (last write wins).
- A custom reducer can accumulate instead:

```ts
steps: Annotation<string[]>({
  reducer: (existing, update) => existing.concat(update),
  default: () => [],
})
```

In the module, `message` was overwritten by each node, while `steps` accumulated to `["greet","toUpper","exclaim"]` — same graph, different merge behaviour, purely because of the reducer.

---

**Q: What are `START` and `END`?**  
A: Special marker constants, not real nodes. `START` marks the graph's entry point (`addEdge(START, "greet")` = "begin here"), and `END` marks termination (`addEdge("exclaim", END)` = "stop and return the final state"). They exist so the graph has unambiguous entry/exit points.

---

**Q: What does `.compile()` do, and what do you get back?**  
A: It validates the graph (all nodes reachable, edges point to real nodes, entry point exists) and returns a **Runnable**. That means the compiled graph has the *same interface as everything else in LangChain* — `.invoke()`, `.stream()`, `.batch()`. A graph can therefore be dropped into a chain, or nested inside another graph (subgraphs, Module 4.2).

---

**Q: What's the difference between `.invoke()` and `.stream()` on a graph?**  
A: `.invoke()` runs the whole graph and returns only the **final state**. `.stream()` yields an update **after every node**, shaped as `{ nodeName: partialUpdate }`. Streaming is what lets a UI show live progress — and it's exactly the event flow AG-UI carries to a frontend.

---

**Q: How does data actually get from one node to the next?**  
A: Only through **state**. Nodes never call each other and never pass arguments directly. Node A returns an update → LangGraph merges it into state → Node B receives the merged state. That indirection is what makes nodes independently reorderable and testable.

---

**Q: If nodes don't call each other, how do you change the execution order?**  
A: You change the **edges** — the node functions stay untouched. In Part 4, reordering the flow is purely an edge change. This separation (work vs. flow) is the core design payoff of the graph model.

---

**Q: Can a node call an LLM, hit a database, or read a file?**  
A: Yes — a node is just an (optionally async) function. The LLM isn't special or built into the graph; it's simply something a node happens to use. That's why the same graph model handles tool calls, retrieval, API calls, and human approval equally well.

---

**Q: What breaks first in production with this? (interview question 3)**  
A: State growth and merge semantics. Common failure modes:
- Using the **default overwrite reducer** where you meant to accumulate (silently losing data from parallel or repeated nodes).
- Letting state grow unboundedly (e.g. appending every message forever) until you blow the context window or memory.
- Forgetting `default` on an accumulating field, so the first `.concat()` hits `undefined`.
