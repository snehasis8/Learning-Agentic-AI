# Module 3.2 — State Management: Q&A Reference

---

**Q: What is a reducer, in one sentence?**  
A: The function that answers *"a node returned a value for this field — what should the field become?"*

```ts
reducer: (currentValue, incomingUpdate) => newValue
```

It is the actual logic of your state. Most agent bugs are reducer bugs.

---

**Q: What are the three reducer patterns you'll actually ship?**  
A:
1. **Overwrite** (the default) — `(_, next) => next` — "latest wins". Use for status flags, current step, single values.
2. **Append** — `(cur, next) => cur.concat(next)` — builds history. Use for logs, messages, collected results.
3. **Merge** — `(cur, next) => ({ ...cur, ...next })` — partial object update. Use for profiles/context objects where one node updates one key.

Pattern 3 is the most-forgotten. Without it, a node writing `{ role: "engineer" }` **wipes out** an existing `{ name: "Snehasis" }` — the classic "my user context keeps disappearing" bug.

---

**Q: Is `messages` a reserved field name in LangGraph?**  
A: No. `MessagesAnnotation` is a **prebuilt convention**, exactly equivalent to:

```ts
Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: messagesStateReducer,   // aka addMessages
    default: () => [],
  }),
})
```

Nothing is magic about the name — it's a normal field with a smart reducer, provided because nearly every agent needs it.

---

**Q: Why does `addMessages` exist instead of just using `concat`?**  
A: Because plain appending isn't enough for real chat state. `addMessages` also handles:
- **Replacement by message ID** — re-emitting a message with an existing `id` updates it *in place* instead of appending a duplicate.
- **`RemoveMessage`** — emitting one deletes that message from history.

That's how you edit and trim conversation history without rebuilding the array yourself.

---

**Q: How do you stop conversation history growing forever?**  
A: Emit `RemoveMessage` instances for the messages you want gone:

```ts
const toDelete = state.messages.slice(0, -1);        // keep only the last
return { messages: toDelete.map((m) => new RemoveMessage({ id: m.id! })) };
```

Unbounded history means growing token cost and eventual context-window failure — this is a production requirement, not an optimisation.

---

**Q: Can you define graph state with zod instead of `Annotation`?**  
A: Yes. Two things to know:
1. Plain zod fields are **overwrite-only**.
2. To attach a reducer, wrap the field with `withLangGraph` from `@langchain/langgraph/zod`:

```ts
history: withLangGraph(z.array(z.string()), {
  reducer: { schema: z.array(z.string()), fn: (cur, next) => cur.concat(next) },
  default: () => [],
})
```

---

**Q: Annotation or zod — which do you ship? (the production question)**  
A: **Both, for different jobs.**

| | Annotation | zod + `withLangGraph` |
|---|---|---|
| Reducers | first-class, no wrapper | needs the wrapper |
| Runtime validation | ❌ none | ✅ catches bad data |
| Schema reuse | LangGraph-only | same zod as tools, structured output, API bodies |
| Ecosystem | what most docs use | newer |

The defensible answer: *"`MessagesAnnotation` for message-carrying agent state — it's the convention and its reducer handles ids and deletions correctly. zod for custom domain state, especially anything crossing a trust boundary (API input, tool results), because runtime validation catches bad data before it corrupts the run."*

The principle: **validate at the edges, keep the interior fast.**

---

**Q: What happens when two parallel nodes write to the same field?**  
A: If the field has **no reducer**, LangGraph **throws**:

```
InvalidUpdateError: Invalid update for channel "overwritten" with values ["A","B"]:
LastValue can only receive one value per step.
lc_error_code: INVALID_CONCURRENT_GRAPH_UPDATE
```

A default field is backed by a `LastValue` channel that accepts only one write per super-step. It fails **loudly** rather than silently discarding one branch's result.

With a reducer, both writes merge — `collected: ["A", "B"]`.

---

**Q: What's the rule for fan-out / parallel branches?**  
A: **Any field that parallel branches write to must have a reducer.** You have to tell LangGraph how concurrent results combine; it refuses to guess. In multi-agent systems (Module 4.3), a supervisor fanning out to several workers will crash on the shared results field until you define that merge. *The crash is the feature* — it forces the decision instead of losing data.

---

**Q: Does `default` protect you from anything?**  
A: It makes the "field never written" case predictable — you get `[]` instead of `undefined`. (Note: omitting it does **not** crash the first `.concat()`; LangGraph treats the first write as the initial value, like JS `reduce` with no initial value. But relying on that is fragile and undocumented in your code.)

---

**Q: What breaks first in production? (interview question 3)**  
A: Three things, in order of frequency:
1. **Unbounded state growth** — message history grows every turn until cost spikes and the context window overflows. Fix: `RemoveMessage`/trimming.
2. **Wrong reducer on a merged object** — a node updating one key silently wipes the rest of the object.
3. **Fan-out onto a no-reducer field** — throws `INVALID_CONCURRENT_GRAPH_UPDATE` the first time two branches run concurrently, which often only happens under real load.
