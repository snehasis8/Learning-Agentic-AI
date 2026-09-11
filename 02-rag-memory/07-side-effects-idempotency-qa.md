# Module 2.5 — Durable State, Step 3: The Side-Effect Gap — Q&A Reference

> Step 3 of 5 in the durable-state block. Preceded by `05-durable-state-postgres-qa.md`
> (step 1) and `06-interrupt-in-subgraph-qa.md` (step 2).

---

**Q: You already knew "the checkpoint commit doesn't cover your side effects" from step 1. What did actually forcing the crash add?**  
A: Precision about *when* a checkpoint is written relative to a node running. The assumption going in was "there's a checkpoint committed right before each node runs, so a crash inside the node rolls back to just before it." What the raw `checkpoints` row showed after the crash: `channel_versions` = `{"__start__": 1}` only, nothing from `refund`. The mechanism is in `pregel/loop.js` `tick()`: the checkpoint for step N is written **after** step N's task writes are applied (`_applyWrites` → `_putCheckpoint({ source: "loop" })`) — never *before* its nodes run. So when `refund` starts, the only checkpoint that exists is the `source: "input"` one written by `_first()` — and that is exactly the `{"__start__": 1}` row. A crash inside `refund` means step 0 never finished, so no step-0 checkpoint was ever *queued*, under any durability mode. The rollback point is "input received, full stop." The side effect had already committed for real; the graph had committed nothing past the input.

> **Correction (2026-09-11).** An earlier version of this answer said LangGraph "fuses `__start__`'s dispatch and `refund` into one superstep" and called that confirmed. It wasn't — it was inferred from the row, and it's wrong: `__start__` is a *channel*, not a dispatched node, and the "no checkpoint before the node" rule is the same for branching graphs. The row was real; the explanation was not. `durability: "sync"` (index.js:1053) only changes whether the *input* checkpoint's write is awaited before step 0 starts — it cannot create a step-0 checkpoint for a step that never completed.

---

**Q: Why doesn't checking `state.refunded` before refunding again fix this?**  
A: Because the crash is *defined* as happening before anything durable could record that the refund happened. `refunded: true` only becomes real once the node returns and the checkpoint commits — and the whole scenario is "the node never got to return." No matter how you order the state update relative to the effect *inside the node*, if the crash lands between the effect and the return, the flag never made it to disk. A guard living inside the graph's own state cannot close a gap defined as "before state gets saved."

---

**Q: What closes it, and why does that work when a state flag doesn't?**  
A: A uniqueness guarantee in the side-effect system itself, that existed **before either attempt started** — here, `order_id TEXT PRIMARY KEY` on `refund_log_v2`, with `INSERT ... ON CONFLICT (order_id) DO NOTHING`. It works because it doesn't depend on anything the crashing process was supposed to remember; the constraint is enforced by Postgres regardless of which process, or how many attempts, try to insert the same key. The general shape: pick a business idempotency key that's stable across retries (an order id, a request id, an explicit key you mint once and persist *before* the risky step), and make the side-effect system itself reject the duplicate — don't try to make the crash window smaller, close it structurally.

---

## Part 10 — does `durability: "sync"` fix it?

**Q: What does the `durability` option on `invoke`/`stream` actually control?**  
A: Three modes, straight from the LangGraph source (`pregel/loop.js`, `pregel/index.js`):

| Mode | Behavior |
|---|---|
| `"async"` (default) | A finished step's checkpoint is saved in the background while the **next** step starts executing. |
| `"sync"` | The engine waits for a finished step's checkpoint write to complete **before** starting the next step. |
| `"exit"` | The checkpoint is only written once, when the whole run exits. |

All three are about ordering **between super-steps that have already finished**. None of them touch what happens *inside* a super-step that hasn't finished yet.

---

**Q: If that's true, why does `invoke()` still come back with the checkpoint saved even under the "async" default?**  
A: Because `runLoop`'s `finally` block awaits every pending checkpointer promise before the run's stream closes — regardless of durability mode. So by the time `invoke()` resolves *normally*, all checkpoint writes for that run have landed either way. The difference between `"sync"` and `"async"` only shows up **mid-run**, in a multi-step graph, in the ordering/latency between step N's checkpoint and step N+1 starting — not in whether a completed run's state ends up durable.

---

**Q: So why does Part 10's crash still duplicate the refund even with `durability: "sync"` set?**  
A: Because the crash fires from *inside* `processRefundSyncDurability`, before the node returns. At that point there is no checkpoint write queued for this step at all — under any durability mode — because a step only produces writes to checkpoint once its node(s) return. `"sync"` has nothing to wait for; it governs a wait that would happen *after* this step finished, and this step never finished. The transaction boundary is unchanged from Part 8: side effect first, node return second, checkpoint third. `durability` doesn't move that boundary.

---

**Q: Why is this worth testing instead of just reasoning through it?**  
A: Because "just make checkpointing synchronous" is the single most plausible wrong answer to this problem — it sounds like exactly the kind of "eventual vs. strong consistency" knob that should fix a crash-window bug, and in a lot of other systems that intuition is correct. Here it isn't, and the reason (the option only orders *finished* steps against each other) is a fact you want to already have on hand rather than discover live in a design review.

---

**Q: What problem does the side-effect gap describe, and why does "we have checkpointing" not imply "we are idempotent"? (interview question 1)**  
A: Checkpointing guarantees the *graph's own state* is durable and resumable. It says nothing about external effects a node triggers — an email send, a payment, an Elastic write — because those happen outside the checkpoint transaction, at a point in time the checkpointer has no visibility into. A system can have perfectly durable, resumable graph state and still double-charge a customer, because durability and idempotency are answers to different questions: "will I lose my place?" vs. "will replaying from my place redo something irreversible?"

---

**Q: Underneath, why can't a state flag ever close this gap, no matter where in the node you set it? (interview question 2)**  
A: Because the flag only becomes durable at the same moment as everything else the node returns — when the checkpoint commits. The crash window is defined relative to that same commit point (before it), so nothing the node computes and returns can be checkpointed inside that window by construction. Moving the flag earlier or later inside the node's own code doesn't change when the *checkpoint* happens; only the node's return and LangGraph's `put()` call determine that.

---

**Q: What breaks if you reach for `durability: "sync"` instead of an idempotency key — and why does it look plausible before you test it? (interview question 3)**  
A: It looks plausible because "sync" sounds like it removes an async/eventual-consistency window, and crash-duplication bugs are usually explained that way in other systems (e.g. write-ahead logs, replicated queues). It breaks here because the window in question isn't between the checkpoint write and something reading it — it's between a side effect and the *existence* of any checkpoint write to order at all. Shipping `durability: "sync"` as "the fix" leaves every side-effecting node exactly as duplicate-prone as before, while giving the team false confidence that the crash-safety story is closed.

---

## Open questions to answer at work

- What does `thread_id` map to in the app — conversation, ticket, or user session?
- What is the checkpoint retention policy, and who owns it?
- Which of the app's nodes perform side effects, and do any of them already have a natural idempotency key (order id, message id, ticket id) to lean on?
