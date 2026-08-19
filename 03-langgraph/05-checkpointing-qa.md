# Module 3.5 — Checkpointing: Q&A Reference

---

**Q: What happens without a checkpointer?**  
A: Every `.invoke()` starts from a blank state. The graph has no memory of any previous call. Fine for a one-shot pipeline, useless for a conversation — ask "what is my name?" after telling it, and it genuinely cannot know.

---

**Q: What two things turn a stateless graph into a stateful conversation?**  
A:
1. `.compile({ checkpointer })` — state is **saved after every super-step**
2. pass a `thread_id` in the config — **which** conversation to load and save

```ts
const graph = builder.compile({ checkpointer: new MemorySaver() });
await graph.invoke(input, { configurable: { thread_id: "user-42" } });
```

---

**Q: What is a `thread_id`?**  
A: A string **you** choose that identifies one conversation — a chat id, user id, ticket number. Same id = same conversation continues. Different id = a completely separate one (proven in the module: a second thread had no idea of the first thread's name).

It is effectively your conversation's **primary key**, so make it stable and namespaced (`org:123:ticket:456`), never a positional index.

---

**Q: On the second turn, do you resend the whole history?**  
A: **No** — you send only the *new* message. The checkpointer loads the saved history and `addMessages` appends to it. Resending history would duplicate it.

---

**Q: What do `getState()` and `getStateHistory()` give you?**  
A:
- `getState(config)` — the current snapshot for a thread: `values` (your state), `next` (which nodes would run next; empty means the run finished), and a config containing the `checkpoint_id`.
- `getStateHistory(config)` — an async iterable of **every** checkpoint, newest first.

One checkpoint is written per super-step, so the history is a complete audit trail of the run.

---

**Q: What is time travel?**  
A: Resuming from an **earlier** checkpoint. Because every step was saved, you can grab an old snapshot's `config` and invoke from there. The run continues from that point and creates a **branch** — the original timeline is not overwritten.

Useful for: retrying after a bad tool result, exploring an alternative path, or debugging "what if the model had answered differently here?"

---

**Q: Which checkpointer do you ship?**  
A: **Not `MemorySaver`** — it lives in process memory and dies on restart. It's for development and tests only.

In production use a durable one — Postgres (`@langchain/langgraph-checkpoint-postgres`) or SQLite. They implement the same interface, so it's a one-line swap.

---

**Q: Why is checkpointing a prerequisite for human-in-the-loop (3.6)?**  
A: Pausing for approval means the run must **stop, persist, and later resume** — possibly hours later, possibly on a different machine. That's exactly what a checkpointer provides. Without durable state there's nothing to come back to.

---

**Q: What breaks first in production? (interview question 3)**  
A:
1. **`MemorySaver` in production** — works perfectly until the first deploy or crash, then every conversation is gone.
2. **Unbounded growth** — every turn appends messages and every super-step writes a checkpoint. Both token cost and database size grow forever without trimming (`RemoveMessage`) and a retention policy.
3. **Bad `thread_id` design** — collisions merge two users' conversations; unstable ids lose history silently.
4. **PII in checkpoints** — saved state often contains personal data. Encrypt at rest, and make sure "delete my data" reaches the checkpoint table (GDPR).
