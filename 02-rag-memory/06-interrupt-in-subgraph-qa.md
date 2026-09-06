# Module 2.5 — Durable State, Step 2: Interrupt Inside a Subgraph — Q&A Reference

> Step 2 of 5 in the durable-state block. Preceded by
> `05-durable-state-postgres-qa.md` (step 1), continues in
> `07-side-effects-idempotency-qa.md` (step 3).

---

**Q: Does a subgraph need its own checkpointer to use `interrupt()`?**  
A: No — and it shouldn't have one. A subgraph is compiled *without* a checkpointer. When it runs as a node inside a parent that has one, it checkpoints through that same saver. `interrupt()` doesn't care which graph called it; it stops the **whole run**, parent included, and persists everything through whichever checkpointer the top-level graph was compiled with.

---

**Q: What does `checkpoint_ns` actually look like for a subgraph, and why does it need `task_id` in it?**  
A: `''` for the root graph's own steps; `'<nodeName>:<taskId>'` (e.g. `review:7be4e7dd-...`) for the subgraph's internal steps. The `task_id` suffix matters the moment a node runs more than once in the same thread — without it, two invocations of the same subgraph node would collide on the same namespace and their checkpoint chains would tangle together. `checkpoint_ns` is part of the primary key in all three tables, so parent rows and subgraph rows coexist under one `thread_id` without special-casing.

---

**Q: What made this a "shared state" subgraph rather than the harder variant?**  
A: The parent's state schema is a strict superset of the subgraph's — same channel names (`question`, `approved`), same types. That's what makes `.addNode("review", reviewSubgraph)` legal with zero translation code: LangGraph just reads/writes the matching channels directly. The other variant — different schemas needing an explicit mapping function at the call site — is 4.2's problem, not this one's.

---

**Q: In Part 6, why does resuming show *two* `review:<task_id>` rows with `source=loop` instead of one?**  
A: The interrupted run left the subgraph's `askHuman` step checkpointed once (`source=input` seeds it, `source=loop` records it having run and hit `interrupt()`). Resuming with `Command({ resume })` re-enters that same subgraph checkpoint, and `askHuman` produces its actual return value this time — a second `loop` checkpoint in the same namespace, chained by `parent_checkpoint_id`. The parent then advances past `review` into `askLLM`, which is why two new root-namespace (`ns=""`) rows appear afterward.

---

**Q: Why does a crash on this thread resume cleanly with full history, but the crash in `07-side-effects-idempotency.ts` loses everything from that attempt?**  
A: `interrupt()` is a *deliberate, planned* pause — the graph reaches it, `interrupt()` itself only returns control after LangGraph has finished persisting the checkpoint for that step. A hard `process.exit()` is not a planned handoff at all; it kills the process regardless of what's mid-flight, including a superstep that hasn't reached its own commit yet. Same checkpointer, same tables — the difference is entirely about *whether the run reached a point that guarantees a commit* before losing control, not about the mechanism being different.

---

**Q: What problem does interrupting from inside a subgraph solve? (interview question 1)**  
A: It lets a human-in-the-loop gate live *inside* a reusable, composable unit (the subgraph) instead of only at the top level — and because it checkpoints through the parent's saver, the pause survives a restart just like any other checkpoint. You get composition (subgraphs) and durability (Postgres) without them fighting each other.

---

**Q: How does it work underneath? (interview question 2)**  
A: A subgraph compiled without a checkpointer still runs as a Pregel graph with its own tasks and super-steps; when the parent graph *does* have a checkpointer, every nested super-step — parent's and subgraph's — writes through that one saver, distinguished only by `checkpoint_ns`. `interrupt()` raises a special exception the engine catches, persists the current state (including the subgraph's), and surfaces it as `__interrupt__` on the parent's result.

---

**Q: What breaks if you compile a subgraph WITH its own checkpointer instead? (interview question 3)**  
A: Redundant, disconnected checkpointing — the subgraph would persist into its own store on top of (or instead of) the parent's, so `getStateHistory()` on the parent thread wouldn't show the subgraph's steps, and resuming the parent wouldn't necessarily resume the subgraph consistently. Composability breaks: the whole point of a subgraph-as-node is that the parent owns durability for the entire run.
