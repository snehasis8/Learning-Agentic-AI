# Module 2.5 — Durable State (Postgres checkpointer): Q&A Reference

> Step 1 of 5 in the durable-state block. Steps 2–5 (crash-and-resume, duplicate
> writes, forking history, thread isolation) append to this file as they land.

---

**Q: What actually changes when you go from `MemorySaver` to `PostgresSaver`?**  
A: Two lines, plus one migration call:

```ts
const checkpointer = PostgresSaver.fromConnString(PG_URL);
await checkpointer.setup();               // once — see the migration question below
const graph = builder.compile({ checkpointer });
```

Nothing about the graph, the nodes, or the config changes. Both savers implement `BaseCheckpointSaver`, and the graph only ever talks to that interface — it never learns which implementation it got. That interface is the whole reason 3.5 could call this "a one-line swap".

---

**Q: What does `setup()` create?**  
A: Four tables, via `CREATE TABLE IF NOT EXISTS` migrations recorded by version number:

| Table | What's in it |
|---|---|
| `checkpoint_migrations` | a single integer version. Schema bookkeeping — this is what makes `setup()` idempotent |
| `checkpoints` | **one row per super-step**: `thread_id`, `checkpoint_ns`, `checkpoint_id`, `parent_checkpoint_id`, `checkpoint` (JSONB), `metadata` (JSONB) |
| `checkpoint_blobs` | the channel **values**: `channel`, `version`, `type`, `blob` (BYTEA) |
| `checkpoint_writes` | writes produced by a task: `checkpoint_id`, `task_id`, `idx`, `channel`, `blob` |

---

**Q: Should `setup()` run on app startup?**  
A: **No.** It is a *migration*, so it belongs in a deploy job, run once, with a role that may `CREATE TABLE`. The runtime role should only have `SELECT/INSERT/UPDATE`. An agent process that can reshape its own schema on boot is a failure mode you don't need.

It is idempotent, so calling it twice won't corrupt anything — that's not the argument. The argument is privilege.

---

**Q: Why are channel values in `checkpoint_blobs` instead of inside the checkpoint row?**  
A: **Deduplication by version.** The `checkpoint` JSONB holds only the *structure* of a step — `v`, `id`, `ts`, `channel_versions`, `versions_seen` — and points at channel versions. `channel_values` is explicitly stripped before the row is written.

A channel that didn't change during a super-step is not re-serialised; the new checkpoint just references the version that already exists. Ten steps that only touch `messages` don't store ten copies of every other channel.

This is the fact to have in hand before reasoning about checkpoint-table growth — or before claiming in a design review that "checkpointing duplicates your whole state every step". It doesn't.

---

**Q: What is `checkpoint_writes` for?**  
A: Pending writes — what a **task** produced, recorded against the checkpoint it started from, keyed by `(thread_id, checkpoint_ns, checkpoint_id, task_id, idx)`.

They matter when a super-step runs several nodes and one fails: the nodes that succeeded already have their writes on disk, so the retry doesn't re-run them. In a single-node graph you'll barely see them; they earn their keep in steps 2–3 of this block.

---

**Q: What are the transaction boundaries?**  
A: One super-step = one transaction. `put()` opens `BEGIN`, upserts every blob, upserts the checkpoint row, then `COMMIT` (rolling back on any error). `putWrites()` does the same for pending writes.

So a checkpoint is all-or-nothing. **But** that transaction covers only the checkpoint — never the side effects your node performed (the email, the Elastic index, the payment). That gap is exactly step 3 of this block, and it's where production systems send the same email twice.

---

**Q: What is `checkpoint_ns` and why is it always empty here?**  
A: The checkpoint **namespace** — `''` for the root graph, non-empty for a subgraph's own checkpoints. It's part of the primary key in all three tables. It stays blank until step 2 introduces a subgraph, and then it's how you tell parent state from child state.

---

**Q: How do you prove durability honestly?**  
A: By killing the process. `getState()` before any invoke answers "does this thread already exist on disk?" — first run: no; second run, a brand-new Node process sharing nothing but a connection string: yes, with the previous run's messages.

A single process re-reading its own writes proves nothing — `MemorySaver` passes that test too.

---

**Q: Why does the script hang at exit if you forget `checkpointer.end()`?**  
A: `PostgresSaver` owns a `pg.Pool` and keeps it open. Open sockets keep Node's event loop alive. In a long-running server this is the same bug wearing a different hat: build the saver **once at startup**, never per request, and size the pool against Postgres `max_connections`.

---

**Q: How do you delete one user's data?**  
A: `await checkpointer.deleteThread(threadId)` — every row in all three tables is keyed by `thread_id`, so they go together. That's the GDPR answer, and the primitive your retention policy is built from.

Note what LangGraph does *not* give you: nothing prunes old checkpoints automatically. A retention policy is code you write.

---

**Q: What problem does this solve that `MemorySaver` doesn't? (interview question 1)**  
A: `MemorySaver` holds state in process memory, so it dies on deploy, crash, or scale-out — and with more than one replica, a user's next request may land on a pod that never saw their conversation. A durable checkpointer moves state to shared storage, which is what makes three things possible at once: surviving restarts, resuming a human-in-the-loop interrupt hours later, and running more than one instance of the agent.

---

**Q: How does it work underneath? (interview question 2)**  
A: The graph writes through `BaseCheckpointSaver`. Per super-step, `put()` serialises each changed channel into `checkpoint_blobs` under a new version, then writes one `checkpoints` row holding the step's structure and its `channel_versions` pointers — both inside one transaction. `parent_checkpoint_id` chains the rows into a linked list; walking it backwards is `getStateHistory()`, and resuming from a mid-list row is time travel. `checkpoint_id` is a UUIDv6, so it sorts chronologically.

---

**Q: What breaks first in production? (interview question 3)**  
A:
1. **Unbounded growth** — in memory, runaway state was a leak you restarted away. On disk it's a bill and a slowing table, and nothing prunes it for you.
2. **Connection exhaustion** — a saver (and therefore a pool) constructed per request instead of once at startup will hit `max_connections` under load.
3. **`setup()` on boot** — needs DDL rights at runtime, and races when several replicas start at once.
4. **PII in `checkpoint_blobs`** — serialised message content sitting in BYTEA, which flows into every backup and read replica you have. Encrypt at rest; make "delete my data" reach `deleteThread()`.
5. **The side-effect gap** — the checkpoint commit is transactional; your node's external writes are not. Crash in between and the resume re-runs them.

---

**Q: `checkpoint_writes` for one turn has 3 rows, but only 2 distinct `task_id` values. Why, and how do you tell them apart?**  
A: Group by `task_id`, not by row. The `START` step and the `llm` node are two *different tasks* — each gets its own `task_id` — but a single task can write to more than one channel in the same super-step, and each write becomes its own row (`idx` distinguishes them).

Concretely, from a real run:

| checkpoint_id | task_id | idx | channel |
|---|---|---|---|
| `1f1a9181-6b50-...` | `6285501f-7fbc-...` | 0 | `messages` (the `HumanMessage`) |
| `1f1a9181-6b50-...` | `6285501f-7fbc-...` | 1 | `branch:to:llm` (routing signal) |
| `1f1a9181-6b5a-...` | `7a69bcc9-89e7-...` | 0 | `messages` (the `AIMessage`) |

Rows 1–2 share one `task_id`: the `START` step has two jobs in one super-step — seed the state *and* tell the engine which node runs next — so it writes to two channels. The `llm` node's task only writes to `messages`; it doesn't write a `branch:to:END` signal, because `END` is a terminal sentinel with nothing downstream left to trigger.

General rule: a task writes one row per channel it touches. A node that fans out to several parallel next-nodes would write several `branch:to:X` rows under one `task_id`, in the same super-step.

---

## Open questions to answer at work

- What does `thread_id` map to in the app — conversation, ticket, or user session?
- What is the checkpoint retention policy, and who owns it?
