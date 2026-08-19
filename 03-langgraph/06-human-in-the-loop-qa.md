# Module 3.6 — Human-in-the-Loop: Q&A Reference

---

**Q: What does `interrupt()` actually do?**  
A: Two things: it **stops the graph** at that point and persists everything, and its payload surfaces to the caller as `__interrupt__`. On resume, `interrupt()` **returns** the value you send back.

Mental model: it's `await humanInput()` — except the wait can last days and survive a process restart, because the state lives in the checkpointer.

---

**Q: How do you resume a paused graph?**  
A: Invoke with a `Command` instead of normal input:

```ts
await graph.invoke(new Command({ resume: "approve" }), config);
```

Whatever you pass as `resume` becomes the return value of `interrupt()` inside the node.

---

**Q: Why does HITL require a checkpointer?**  
A: Because "waiting for a human" means the run is **persisted and idle**, not held open in memory. The process may restart, or the approval may arrive on a different machine hours later. Without durable state there's nothing to come back to. This is why 3.5 comes before 3.6.

---

**Q: What's the difference between `interrupt()` and `interruptBefore`?**  
A:
- **`interrupt(payload)`** lives *inside* a node. It can ask a rich, contextual question ("approve 2500c for order A123?") because it has access to state.
- **`interruptBefore: ["nodeName"]`** is a compile option — a blanket gate that always stops before a given node, with **no node code changes**. Good for guarding a dangerous step.

There's also `interruptAfter` for inspecting a node's output before continuing.

---

**Q: How does a human *edit* the agent's state rather than just approve?**  
A: `updateState()` on the paused thread:

```ts
await graph.updateState(config, { amountCents: 5000, trail: ["human reduced amount"] });
await graph.invoke(new Command({ resume: "approve" }), config);
```

The update goes **through your reducers**, exactly like a node's update — so an accumulating field appends, an overwrite field replaces.

---

**Q: What are the three HITL patterns?**  
A:
1. **Approve / reject** — `interrupt()` returning a decision. For irreversible actions: payments, deletions, sending email.
2. **Edit** — `updateState()` before resuming. For when the agent is nearly right.
3. **Review a tool call** — `interruptBefore: ["tools"]` on a ReAct agent, so a reviewer sees every proposed call before it executes.

---

**Q: ⚠️ What happens to code *before* the `interrupt()` when you resume?**  
A: **It runs again.** Resuming re-executes the node from the top; only `interrupt()` itself returns early with your value.

So any side effect placed before the interrupt (charging a card, sending an email, writing a row) happens **twice**. Put side effects *after* the interrupt, or in a separate node.

---

**Q: Why is this a compliance topic in Europe?**  
A: The **EU AI Act requires human oversight for high-risk AI decisions**. In enterprise deployments in the Netherlands, Germany and Ireland, HITL isn't a product nicety — it's a legal requirement, and interviewers there will ask how you implement it.

That also means the audit trail matters: record **who** approved and **when**, into state. "The system refunded it" is not oversight.

---

**Q: What breaks first in production? (interview question 3)**  
A:
1. **Duplicate side effects** — work before `interrupt()` re-runs on resume.
2. **No timeout** — humans forget; a thread paused forever is a silent failure. Decide the 24h behaviour: auto-reject, escalate, or expire.
3. **Missing audit fields** — no approver id or timestamp, so you can't prove oversight happened.
4. **Unauthenticated resume** — a resume call authorises a real action; `thread_id` alone must not be enough to trigger it.
