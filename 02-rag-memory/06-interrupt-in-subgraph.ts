/**
 * Module 2.5 — Durable state, step 2: interrupt() inside a subgraph
 *
 * WHAT YOU'LL LEARN:
 *   - A subgraph never owns a checkpointer — it checkpoints through the parent's
 *   - interrupt() stops the WHOLE run, parent included, and persists it
 *   - checkpoint_ns is what keeps the parent's steps and the subgraph's steps
 *     apart in the same three tables
 *
 * WHY THIS MATTERS:
 *   05 proved MESSAGES survive a restart. This proves something sharper: a
 *   PAUSE survives one — including a pause raised from inside a subgraph. 4.2
 *   covers subgraph composition properly (shared vs transformed state); this
 *   is only enough to make checkpoint_ns stop being theoretical.
 *
 * SETUP: same as 05 — docker compose up -d postgres.
 *
 * Run:   npx tsx 02-rag-memory/06-interrupt-in-subgraph.ts
 *        ...then run it AGAIN to resume the paused run.
 * Reset: npx tsx 02-rag-memory/06-interrupt-in-subgraph.ts --reset
 */

import "dotenv/config";
import { StateGraph, Annotation, MessagesAnnotation, START, END, interrupt, Command } from "@langchain/langgraph";
import { HumanMessage, AIMessage } from "@langchain/core/messages";
import { llm } from "../lib/llm.js";
import { checkpointer, pool, deleteThreads, closeAll } from "./_pg.js";

const THREAD_ID_INTERRUPT = "pg-demo-interrupt-1";

// =============================================================================
// PART 6 — interrupt() inside a SUBGRAPH, across a process restart
// =============================================================================
// The subgraph: one node, asking a human whether the LLM should even see this
// question. It is compiled WITHOUT a checkpointer of its own — a subgraph
// never owns one. When it runs as a node inside a parent that HAS one, it
// checkpoints through that same saver, and LangGraph keeps "the parent's
// step 0" and "the subgraph's step 0" apart using checkpoint_ns. This is the
// "shared state" style of subgraph (same channel names on both sides) — the
// simplest composition there is.

const ReviewState = Annotation.Root({
  question: Annotation<string>,
  approved: Annotation<boolean>,
});

function askHuman(state: typeof ReviewState.State) {
  // Runs inside the SUBGRAPH. interrupt() doesn't care that it isn't the top
  // level graph — it stops the whole run, parent included, and persists it.
  const decision = interrupt({ question: `Let the LLM answer: "${state.question}"?` });
  return { approved: decision === "approve" };
}

const reviewSubgraph = new StateGraph(ReviewState)
  .addNode("askHuman", askHuman)
  .addEdge(START, "askHuman")
  .addEdge("askHuman", END)
  .compile(); // <- no checkpointer passed. See note above.

// The PARENT's state is a superset of the subgraph's: it has `messages` (for
// the LLM turn) PLUS the exact `question`/`approved` channels the subgraph
// reads and writes. Same names, same types — that's what makes
// `.addNode("review", reviewSubgraph)` legal with zero mapping code.
const ParentState = Annotation.Root({
  ...MessagesAnnotation.spec,
  question: Annotation<string>,
  approved: Annotation<boolean>,
});

async function askLLM(state: typeof ParentState.State) {
  if (!state.approved) {
    return { messages: [new AIMessage("Blocked by reviewer — not answered.")] };
  }
  const response = await llm.invoke([new HumanMessage(state.question)]);
  return { messages: [response] };
}

// One PostgresSaver, shared with 05 and 07, all four tables partitioned by
// thread_id. The checkpointer is a compile-time argument, not a property of
// the graph.
const parentGraph = new StateGraph(ParentState)
  .addNode("review", reviewSubgraph)
  .addNode("askLLM", askLLM)
  .addEdge(START, "review")
  .addEdge("review", "askLLM")
  .addEdge("askLLM", END)
  .compile({ checkpointer });

async function subgraphInterruptAcrossProcesses() {
  console.log("\n=== PART 6: interrupt() inside a subgraph, across a restart ===");
  const config = { configurable: { thread_id: THREAD_ID_INTERRUPT } };
  const snap = await parentGraph.getState(config);

  if (Object.keys(snap.values).length === 0) {
    console.log("   -> first run. Asking a question that needs review first.");
    const paused = await parentGraph.invoke(
      { question: "What is our refund policy?" },
      config,
    );
    console.log("   interrupt payload:", JSON.stringify((paused as any).__interrupt__?.[0]?.value));
    console.log("   paused at node(s):", (await parentGraph.getState(config)).next);
    console.log("   ✅ paused and persisted. NOW KILL THIS AND RUN THE SCRIPT AGAIN.");
  } else if (snap.next.length > 0) {
    console.log("   -> a PREVIOUS process left this paused. Resuming with Command({ resume }).");
    console.log("      note: nothing here shared memory with that process — just PG_URL.");
    const done = await parentGraph.invoke(new Command({ resume: "approve" }), config);
    console.log("   approved:", done.approved);
    console.log("   answer:", String(done.messages.at(-1)?.content).slice(0, 150));
  } else {
    console.log("   -> already resolved. Answer was:",
      String(snap.values.messages.at(-1)?.content).slice(0, 150));
  }
}

// =============================================================================
// PART 7 — checkpoint_ns, no longer blank
// =============================================================================
async function readNamespaces() {
  console.log("\n=== PART 7: checkpoint_ns for a subgraph ===");
  const { rows } = await pool.query(`
    SELECT checkpoint_ns, checkpoint_id, parent_checkpoint_id, metadata->>'source' AS source
    FROM checkpoints WHERE thread_id = $1
    ORDER BY checkpoint_id`, [THREAD_ID_INTERRUPT]);

  for (const r of rows) {
    console.log(`   ns=${JSON.stringify(r.checkpoint_ns).padEnd(24)}` +
      ` source=${String(r.source).padEnd(6)} parent=${r.parent_checkpoint_id ? "yes" : "— (root)"}`);
  }
  // The root graph's own steps (START -> review -> askLLM -> END) show ns=''.
  // The subgraph's internal steps (START -> askHuman -> END, run WHILE the
  // parent is sitting at its "review" step) show a non-empty ns like
  // 'review:<task_id>'. Same thread_id, same three tables — checkpoint_ns is
  // the only thing keeping "parent's step 0" and "subgraph's step 0" apart.
}

async function reset() {
  console.log("\n=== --reset: deleting thread", THREAD_ID_INTERRUPT, "===");
  await deleteThreads(THREAD_ID_INTERRUPT);
  console.log("   gone from all three tables. Next run starts fresh.");
}

// -----------------------------------------------------------------------------
// PRODUCTION NOTES
// -----------------------------------------------------------------------------
// 1. A subgraph compiled WITH its own checkpointer would checkpoint twice —
//    once into its own store, once (redundantly) as part of the parent's
//    super-step. Leave it uncompiled-with-checkpointer; let the parent own it.
// 2. checkpoint_ns is part of the PRIMARY KEY in all three tables, suffixed
//    with a task_id (`review:<task_id>`). Without the task_id suffix, two
//    invocations of the same subgraph node in one thread would collide on the
//    same namespace and tangle their checkpoint chains together.
// 3. interrupt() only returns control after LangGraph has finished persisting
//    the checkpoint for that step — it is a deliberate, planned pause. Compare
//    that to 07's process.exit(), which is not a planned handoff at all.
//
// -----------------------------------------------------------------------------
// 🎯 THE THREE INTERVIEW QUESTIONS
// -----------------------------------------------------------------------------
// 1. What problem does interrupting from inside a subgraph solve, and why
//    doesn't the subgraph need its own checkpointer to do it?
// 2. Underneath: what does checkpoint_ns look like for a subgraph, and why
//    does it need a task_id suffix?
// 3. What breaks if you compile a subgraph WITH its own checkpointer instead?

async function main() {
  try {
    await checkpointer.setup();

    if (process.argv.includes("--reset")) {
      await reset();
      return;
    }

    await subgraphInterruptAcrossProcesses();
    await readNamespaces();

    console.log("\n=============================================================");
    console.log("RECAP");
    console.log("  a subgraph never owns a checkpointer — it runs through the parent's");
    console.log("  checkpoint_ns tells parent steps and subgraph steps apart, same tables");
    console.log("  interrupt() inside a subgraph pauses the WHOLE run, parent included");
    console.log("  NEXT (step 3)     : 07-side-effects-idempotency.ts");
    console.log("=============================================================");
  } finally {
    await closeAll();
  }
}

main().catch(console.error);
