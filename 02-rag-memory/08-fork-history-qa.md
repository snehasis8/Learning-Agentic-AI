# Module 2.5 — Durable State, Step 4: Forking History — Q&A Reference

> Step 4 of 5 in the durable-state block. Preceded by `05-durable-state-postgres-qa.md`
> (step 1), `06-interrupt-in-subgraph-qa.md` (step 2), and
> `07-side-effects-idempotency-qa.md` (step 3).

---

**Q: What does `getStateHistory()` actually return — the ancestry chain of the latest checkpoint, or something else?**  
A: Something else, and this is easy to get wrong. Checked directly against the `PostgresSaver` source: `list()` (what `getStateHistory()` calls) filters `WHERE thread_id = $1 [AND checkpoint_ns = $2]` and orders by `checkpoint_id DESC` — nothing in that query touches `parent_checkpoint_id`. It returns **every checkpoint ever written for that thread**, from every branch, merged and sorted purely by time. With one branch, that ordering happens to look identical to "the parent chain walked backwards" — which is why it's tempting to describe it that way. Once a second branch exists (Part 12's fork), the illusion breaks: the same call now interleaves rows from both branches by recency. The tree structure is never handed to you; you reconstruct it yourself from `parent_checkpoint_id`, same as `readForkTree()` does.

---

**Q: Why does that matter in practice?**  
A: Because "pick the checkpoint where `messages.length === 2`" is a fine way to find a fork point in a single-branch history, but it silently breaks the moment a fork already exists — the merged list can now contain a `messages.length === 2` row from *either* branch, and you'd fork again from an unpredictable one. The fix isn't a smarter search; it's not re-deriving the fork point from a call made after the fork exists. Capture the pre-fork snapshot list once, use it once.

---

**Q: What single thing about the config passed to `updateState()` decides fork vs. edit-in-place?**  
A: Whether `config.configurable.checkpoint_id` points at the thread's current latest checkpoint or at an older one. `updateState(config, values)` always creates a brand-new checkpoint whose **parent** is whatever checkpoint `config` names. Pass the latest (3.6's pattern) and the new checkpoint's parent is the same as before — a linear edit. Pass an old one (this file) and the new checkpoint's parent is that old row — a second child appears on an existing node, which is a fork by definition. Nothing else about the call changes; `updateState()` doesn't have a `fork: true` flag, because it doesn't need one.

---

**Q: In Part 12, `updateState(forkPoint.config, {})` passes an empty object. Does that even do anything?**  
A: Yes — an empty `values` object still creates a new checkpoint; there's just nothing to merge into any channel, so the new checkpoint's `values` are identical to `forkPoint`'s. What makes it a fork isn't the payload, it's the `config` argument naming an old checkpoint as the parent. Confirmed by the metadata after running it: the new row's `source` is `"update"` (LangGraph's label for a checkpoint created by `updateState()`, distinct from `"input"` and `"loop"`), and its `parent_checkpoint_id` matches `forkPoint`'s id exactly — verified by querying `checkpoints` raw and seeing two rows share one parent step.

---

**Q: Why does the forked branch become the thread's "latest" for a plain `invoke(input, { configurable: { thread_id } })` afterward?**  
A: Because "latest" (whatever a lookup with no explicit `checkpoint_id` resolves to) is just the checkpoint with the highest `checkpoint_id` for that thread — and `checkpoint_id` is a UUIDv6, time-ordered. The forked checkpoint was created after everything in the original branch, so it's newest by construction, regardless of which branch has "more" history. Time, not message count or branch depth, decides what counts as current.

---

**Q: Is the original branch actually gone once you fork away from it?**  
A: No — confirmed empirically: after forking and continuing down the new branch, `graph.getState(originalTip.config)` (using the *exact* checkpoint config captured before forking) still returns all 6 messages from the pre-fork conversation, untouched. Every row in `checkpoints`, `checkpoint_blobs`, and `checkpoint_writes` from that branch is still on disk. "Latest" is a read-time convenience computed from `checkpoint_id`, not a pointer that moves and orphans everything behind it.

---

**Q: The raw tree printout shows `step=3` appearing twice — once with `source=loop`, once with `source=update`. Is `step` a reliable row identifier?**  
A: No, and this is worth knowing before you reach for `step` as a key anywhere. `step` counts position along a chain from whatever root it's attached to; after a fork, **both branches restart counting from the fork point**, so two entirely different checkpoints can carry the same step number. It reads cleanly right up until a fork exists, then becomes ambiguous — exactly analogous to (and independent from) the `checkpoint_id`-prefix-truncation trap earlier in this same file. `checkpoint_id` is the only field that's ever globally unique. `readForkTree()` uses `step` only for display, but groups by the real `parent_checkpoint_id` for anything that has to be correct.

---

**Q: Why does re-running this script need a guard against forking twice, when 05/06/07 could just be re-run freely?**  
A: 05/06/07 are built around "resume where you left off" — each has exactly one meaningful next state (finish waiting, or resume a pause), determined cleanly from `getState()`. Forking doesn't have a natural "next state": if you don't guard it, "run the script again" reads as "fork *again*", and because of the merged-list issue above, a second fork would pick its point from an already-branched history — not a clean repeat of the first fork. The fix mirrors 07's pattern (`hasCheckpoint` / `snap.next.length` branches) — check whether a `source = 'update'` checkpoint already exists for this thread, and only fork if it doesn't.

---

**Q: What problem does forking history solve that simply calling `updateState()` on the latest checkpoint doesn't? (interview question 1)**  
A: Editing the latest checkpoint changes the conversation going forward but keeps only one timeline — you lose the ability to compare "what actually happened" against "what would have happened with a different input at turn N". Forking keeps both: the original run stays fully intact and resumable by its own checkpoint_id, while the fork explores an alternative from the same starting point. This is the primitive behind replaying an eval case with a different tool result, or letting an operator try a different decision from further back without destroying the audit trail of what the agent actually did.

---

**Q: How does it work underneath? (interview question 2)**  
A: `updateState(config, values)` writes a new row into `checkpoints` (and any changed channels into `checkpoint_blobs`) exactly like a normal super-step would, tagged `metadata.source = "update"`. The only special thing about it is `parent_checkpoint_id`: it's set to whatever checkpoint `config.configurable.checkpoint_id` named, not to the thread's actual latest. Since `getStateHistory()`/`list()` has no concept of "the current branch" — it just returns every row for the thread sorted by time — a fork is invisible as a special case at the storage layer; it's just a second row that happens to share a parent with an existing one. The tree only exists in the graph you draw from `parent_checkpoint_id`.

---

**Q: What breaks if your app always resumes threads by thread_id alone and never persists which checkpoint_id a given fork lives at? (interview question 3)**  
A: You can create forks, but you can never deliberately return to one — "latest" always resolves to whichever branch was written to most recently, so an older fork becomes unreachable in practice (not deleted, just un-findable without hunting through raw history). Any feature built on "replay this specific case" or "let a user pick between the two things the agent tried" needs the fork's checkpoint_id treated as a first-class value your app stores and looks up — a UI href, a DB column, a run ID — not something you can recover later from `thread_id` alone.

---

## Open questions to answer at work

- What does `thread_id` map to in the app — conversation, ticket, or user session?
- What is the checkpoint retention policy, and who owns it?
- Does the work app ever need "try again from here" (eval replay, operator override)? If so, where would a fork's checkpoint_id need to be persisted — logs, a DB column, a UI link — to actually be reachable later?
