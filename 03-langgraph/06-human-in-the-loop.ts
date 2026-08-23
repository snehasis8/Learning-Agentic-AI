/**
 * Module 3.6 — Human-in-the-Loop
 *
 * WHAT YOU'LL LEARN:
 *   - interrupt(): pausing a graph mid-node to ask a human
 *   - Command({ resume }): handing the answer back and continuing
 *   - interruptBefore / interruptAfter: pausing without touching node code
 *   - updateState(): a human EDITING the agent's state before it continues
 *   - Why this is a compliance requirement in Europe, not a nice-to-have
 *
 * WHY THIS MATTERS:
 *   Agents take actions: refunds, emails, deletions, deployments. Some of those
 *   need a person to say yes. The EU AI Act requires human oversight for
 *   high-risk AI decisions, so Dutch/Irish enterprise interviewers WILL ask
 *   about this.
 *
 *   This module only works because of 3.5: pausing means persisting the run and
 *   resuming later, possibly on another machine. No checkpointer, no HITL.
 *
 * Run: npx tsx 03-langgraph/06-human-in-the-loop.ts
 */

import "dotenv/config";
import {
  StateGraph, Annotation, MemorySaver, START, END, interrupt, Command,
} from "@langchain/langgraph";

// =============================================================================
// PART 1 — interrupt(): stopping mid-run to ask
// =============================================================================
// interrupt(payload) does two things:
//   1. it STOPS the graph right there and persists everything
//   2. the payload surfaces to your caller as __interrupt__
// Later, resuming makes interrupt() RETURN the value you send back.
//
// Mental model: it is `await humanInput()` — except the wait can last days and
// survive a process restart, because state lives in the checkpointer.

const RefundState = Annotation.Root({
  orderId: Annotation<string>,
  amountCents: Annotation<number>,
  approved: Annotation<boolean>,
  outcome: Annotation<string>,
  trail: Annotation<string[]>({
    reducer: (cur, next) => cur.concat(next),
    default: () => [],
  }),
});
type RefundStateType = typeof RefundState.State;

function requestApproval(state: RefundStateType) {
  // Everything above this line runs. Then the graph STOPS here.
  const decision = interrupt({
    question: `Approve refund of ${state.amountCents}c for order ${state.orderId}?`,
    amountCents: state.amountCents,
  });
  // On resume, `decision` is whatever the human sent back.
  return { approved: decision === "approve", trail: [`human said: ${decision}`] };
}

function executeRefund(state: RefundStateType) {
  return state.approved
    ? { outcome: `refunded ${state.amountCents}c`, trail: ["refund executed"] }
    : { outcome: "refund declined", trail: ["refund skipped"] };
}

const approvalGraph = new StateGraph(RefundState)
  .addNode("requestApproval", requestApproval)
  .addNode("executeRefund", executeRefund)
  .addEdge(START, "requestApproval")
  .addEdge("requestApproval", "executeRefund")
  .addEdge("executeRefund", END)
  .compile({ checkpointer: new MemorySaver() }); // <- REQUIRED for interrupts

async function basicInterrupt() {
  console.log("\n=== PART 1: Pause for approval, then resume ===");
  const config = { configurable: { thread_id: "order-A123" } };

  // First invoke: runs until the interrupt, then returns.
  const paused = await approvalGraph.invoke(
    { orderId: "A123", amountCents: 2500 },
    config,
  );
  console.log("   paused with:", JSON.stringify((paused as any).__interrupt__?.[0]?.value));
  console.log("   outcome so far:", paused.outcome, " <- undefined, it never ran");

  // The saved state knows exactly where it stopped.
  const snap = await approvalGraph.getState(config);
  console.log("   next node when resumed:", snap.next);

  // Resume by passing a Command instead of a normal input.
  const done = await approvalGraph.invoke(new Command({ resume: "approve" }), config);
  console.log("   after resume ->", done.outcome);
  console.log("   trail:", done.trail);
}

async function rejectPath() {
  console.log("\n=== PART 1b: The same graph, rejected ===");
  const config = { configurable: { thread_id: "order-B456" } };

  await approvalGraph.invoke({ orderId: "B456", amountCents: 9900 }, config);
  const done = await approvalGraph.invoke(new Command({ resume: "reject" }), config);
  console.log("   outcome:", done.outcome);
  // Same graph, same code path — the HUMAN decided the branch.
}

// =============================================================================
// PART 2 — interruptBefore / interruptAfter: pausing without touching nodes
// =============================================================================
// interrupt() lives INSIDE a node, so it can ask a rich, contextual question.
// Sometimes you just want "always stop before this node runs" — a blanket gate
// on a dangerous step. That is a compile-time option, no node changes at all.

const GateState = Annotation.Root({
  action: Annotation<string>,
  log: Annotation<string[]>({ reducer: (c, n) => c.concat(n), default: () => [] }),
});

const gated = new StateGraph(GateState)
  .addNode("plan", () => ({ log: ["planned"] }))
  .addNode("dangerous", () => ({ log: ["DELETED PRODUCTION DATA"] }))
  .addEdge(START, "plan")
  .addEdge("plan", "dangerous")
  .addEdge("dangerous", END)
  .compile({
    checkpointer: new MemorySaver(),
    interruptBefore: ["dangerous"], // <- stop before this node, every time
  });

async function staticInterrupt() {
  console.log("\n=== PART 2: interruptBefore as a blanket gate ===");
  const config = { configurable: { thread_id: "deploy-1" } };

  const paused = await gated.invoke({ action: "delete" }, config);
  console.log("   log after pause:", paused.log, " <- 'dangerous' has NOT run");
  console.log("   waiting at     :", (await gated.getState(config)).next);

  // Resume with null input = "continue from where you stopped".
  const done = await gated.invoke(null, config);
  console.log("   after approval :", done.log);
}

// =============================================================================
// PART 3 — updateState(): the human EDITS the agent's state
// =============================================================================
// Approval is binary. Often a reviewer wants to CORRECT something instead:
// change the refund amount, fix a bad tool argument, rewrite a draft.
// updateState() writes into the paused state before you resume — and it goes
// through your reducers, exactly like a node's update would.

async function humanEdit() {
  console.log("\n=== PART 3: A human corrects the state, then resumes ===");
  const config = { configurable: { thread_id: "order-C789" } };

  await approvalGraph.invoke({ orderId: "C789", amountCents: 50000 }, config);
  console.log("   agent proposed:", (await approvalGraph.getState(config)).values.amountCents, "cents");

  // Reviewer decides that is too much and edits the state.
  await approvalGraph.updateState(config, {
    amountCents: 5000,
    trail: ["human reduced amount to 5000c"],
  });
  console.log("   human changed to:", (await approvalGraph.getState(config)).values.amountCents, "cents");

  const done = await approvalGraph.invoke(new Command({ resume: "approve" }), config);
  console.log("   outcome:", done.outcome);
  console.log("   trail  :", done.trail);
}

// =============================================================================
// PART 4 — The three HITL patterns, and when to use which
// =============================================================================
// 1. APPROVE / REJECT   -> interrupt() returning a decision.
//    Use for irreversible actions: payments, deletions, sending email.
//
// 2. EDIT               -> updateState() before resuming.
//    Use when the agent is nearly right: fix an argument, trim a draft.
//
// 3. REVIEW A TOOL CALL -> interruptBefore: ["tools"] on an agent graph.
//    Use to gate EVERY tool execution in a ReAct loop (Module 3.4) — the
//    reviewer sees the proposed call before it runs.
//
// All three need a checkpointer, because "waiting for a human" means the run
// is persisted and idle, not held open in memory.

// -----------------------------------------------------------------------------
// PRODUCTION NOTES
// -----------------------------------------------------------------------------
// 1. THE NODE RE-RUNS. Everything before interrupt() executes AGAIN on resume.
//    Keep side effects (charging a card, sending mail) AFTER the interrupt, or
//    in a separate node — otherwise you will do them twice.
// 2. TIMEOUTS. Humans forget. Decide what happens after 24h: auto-reject,
//    escalate, or expire the thread. A run paused forever is a silent failure.
// 3. WHO APPROVED? Record the approver id and timestamp INTO state. "The system
//    refunded it" is not an audit trail; EU AI Act asks who oversaw the decision.
// 4. INTERRUPT PAYLOADS ARE UI CONTRACTS. Whatever you pass to interrupt() is
//    what your frontend renders. Send structured data (amount, order, reason),
//    not a pre-formatted sentence — this is exactly what AG-UI carries next.
// 5. RESUME IS AUTHENTICATED. A resume call decides a real action. Do not let
//    thread_id alone authorise it.

async function main() {
  // await basicInterrupt();
  // await rejectPath();
  //  await staticInterrupt();
   await humanEdit();

  console.log("\n=============================================================");
  console.log("RECAP");
  console.log("  interrupt(payload)      -> stop, persist, surface __interrupt__");
  console.log("  Command({ resume: v })  -> interrupt() returns v, run continues");
  console.log("  interruptBefore: [n]    -> blanket gate, no node changes");
  console.log("  updateState()           -> human edits state, then resume");
  console.log("  ALL of it requires a checkpointer (3.5)");
  console.log("  the node RE-RUNS from the top on resume - watch side effects");
  console.log("=============================================================");
}

main().catch(console.error);
