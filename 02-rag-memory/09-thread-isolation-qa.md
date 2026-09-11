# Module 2.5 — Durable State, Step 5: Thread Isolation — Q&A Reference

> Step 5 of 5 in the durable-state block. Preceded by `08-fork-history-qa.md` (step 4).
> Claims below are backed by `09-thread-isolation.ts` output and the cited source lines.
> Anything not yet run is marked *(inferred)*.

---

**Q: Two threads running at the same instant, through the same graph object and the same PostgresSaver — why don't they interfere?**  
A: Because nothing per-thread is held in memory by the saver. Every PostgresSaver query — `getTuple`, `list`, `put`, `putWrites` — is scoped `WHERE thread_id = $1 AND checkpoint_ns = $2` (`checkpoint-postgres/dist/index.js:230, 265`). The graph object and the pool are shared, but they carry no thread state between calls; each invoke loads its own row set and writes its own rows. Isolation across threads is a *key*, not a lock — the same way two customers' orders in an `orders` table are isolated.

---

**Q: So what happens when two invokes hit the SAME `thread_id` at the same instant?**  
A: A race, with no error. "Latest" is `ORDER BY checkpoint_id DESC LIMIT 1` with no `FOR UPDATE` and no advisory lock. Both invokes read the same parent checkpoint, both run their node, both write a child of that parent. That's a fork — identical in shape to 08's `updateState()` fork, except accidental. Future `invoke()` / `getState()` with no `checkpoint_id` load whichever child has the higher (later-created) `checkpoint_id`; the other turn is still on disk, on a branch nothing will ever load again. Part 14 shows a thread with 3 human turns whose latest checkpoint carries 2.

---

**Q: Why is "silently lost" worse than the duplicate from step 3?**  
A: Step 3's duplicate was *visible* — an extra row in `refund_log`. Here there's nothing to alert on: no exception, no constraint violation, row counts in `checkpoints` look healthy (they grew!). The only evidence is a `parent_checkpoint_id` with two children, which you'd have to go looking for. The user experiences it as "the bot forgot what I just said".

---

**Q: What's the fix, and why does the Part 15 version not count as production-ready?**  
A: Serialize invokes per thread: the next invoke on a thread must not *start* until the previous one has *returned* (and therefore committed its checkpoint — 07's Q&A: `invoke()` resolving means all its checkpoint promises settled). Part 15 does it with a `Map<thread_id, Promise>` — correct, and useless across two API pods because each pod has its own Map. The guard has to live where every pod can see it: a Postgres advisory lock held for the run (`pg_advisory_xact_lock(hashtext(thread_id))`), a Redis `SET NX PX` lock with a TTL longer than your slowest run, or routing by `thread_id` to one worker via a partitioned queue. Returning 409 and disabling Send in the UI is also a valid answer — "no guard" is the only invalid one.

---

**Q: What does `thread_id` mean in the work app, and what does that decision drag along with it?**  
A: One thread per chat session. Three things fall out of that: (1) retention is per-chat — the sweeper deletes a *chat*, and a paused `interrupt()` inside an expiring chat dies with it; (2) the concurrency guard above is per-chat; (3) anything that must survive across chats for the same user is *not* checkpointer data — that's the Store (4.6). The handoff's open item "does the API layer serialize concurrent messages on the same thread_id" is Part 14 vs Part 15 in one sentence.

---

**Q: Is `checkpoint_ns` a second isolation key I could use to separate users?**  
A: No. From 06: it namespaces a *subgraph's* checkpoints within one thread (`thread_id` + `checkpoint_ns` together locate a row). Two threads sharing a ns are still two threads; a parent and its subgraph are still one thread. Using it as a user key would only guarantee that a user's subgraph rows collide with nothing — which they already didn't.

---

**Q: A real chat UI disables the input box while a turn is running. Is that the fix for the same-thread race, or does the Part 15 server-side queue still matter?**  
A: The disabled input box is the client-side version of exactly the same fix — it stops the *normal* path (one user, one tab) from ever sending two messages on one thread concurrently. It is not sufficient on its own: a second tab on the same chat, a phone app and web app signed into the same account, or a client retry firing while the first request is still processing server-side all bypass a disabled button, because the button only controls what one client does — not what actually reaches the backend. The server-side guard (a per-thread queue, a Postgres advisory lock, a Redis lock) is what makes the race impossible regardless of client behavior. UI disable = cheap defense that makes it rare; server-side lock = what makes it structurally impossible. Ship only the first and it works in the demo and breaks the day someone opens two tabs.

---

*(next session's Q goes here)*
