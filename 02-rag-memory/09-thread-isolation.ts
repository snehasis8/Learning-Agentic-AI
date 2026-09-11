/**
 * Module 2.5 — Durable state, step 5: thread isolation, and where it stops
 *
 * WHAT YOU'LL LEARN:
 *   - Two threads running at the same moment never see each other's state —
 *     and WHY: isolation is a `WHERE thread_id = $1` clause. Nothing more.
 *   - What that does NOT give you: two invokes on the SAME thread at the same
 *     moment race. LangGraph takes no lock on a thread. One turn silently
 *     lands on a dead branch — an *accidental* version of 08's fork.
 *   - The raw fix (serialize per thread), and why it only works in one process
 *   - What `thread_id` means in the work app, and what that decides
 *
 * WHY THIS MATTERS:
 *   Every previous step used one thread at a time. Production doesn't: one
 *   user double-clicks Send, a retry fires while the first call is still
 *   running, two API pods pick up the same chat. "Is my state isolated?" is
 *   two questions — across threads (yes, by key) and within a thread (no,
 *   nothing stops you). The second one is the handoff's open work item:
 *   "does the API layer serialize concurrent messages on the same thread_id?"
 *
 * SETUP: same as 05 — docker compose up -d postgres.
 *
 * Run:   npx tsx 02-rag-memory/09-thread-isolation.ts
 * Reset: npx tsx 02-rag-memory/09-thread-isolation.ts --reset
 *        (run --reset before re-running; Part 14 needs a fresh thread to race on)
 */

import "dotenv/config";
import { StateGraph, MessagesAnnotation, START, END } from "@langchain/langgraph";
import { HumanMessage } from "@langchain/core/messages";
import { llm } from "../lib/llm.js";
import { checkpointer, pool, deleteThreads, closeAll } from "./_pg.js";

const THREAD_A = "pg-demo-iso-a";
const THREAD_B = "pg-demo-iso-b";
const THREAD_RACE = "pg-demo-race";
const THREAD_QUEUED = "pg-demo-queued";

async function callModel(state: typeof MessagesAnnotation.State) {
  const response = await llm.invoke(state.messages);
  return { messages: [response] };
}

// One graph object, one PostgresSaver, one pool — shared by every invoke
// below. That's deliberate: isolation has to come from the DATA, not from
// giving each thread its own objects.
const graph = new StateGraph(MessagesAnnotation)
  .addNode("llm", callModel)
  .addEdge(START, "llm")
  .addEdge("llm", END)
  .compile({ checkpointer });

const humansOn = (msgs: typeof MessagesAnnotation.State["messages"]) =>
  msgs.filter((m) => m.getType() === "human").map((m) => String(m.content));

// =============================================================================
// PART 13 — two threads at the same moment: no cross-talk
// =============================================================================
// Both invokes start in the same tick of the event loop. If anything about
// the saver were shared per-process instead of per-thread, this is where it
// would leak: A would learn B's name, or the message counts would be wrong.

async function twoThreadsInParallel() {
  console.log("\n=== PART 13: two threads at once — isolated by key ===");
  const a = { configurable: { thread_id: THREAD_A } };
  const b = { configurable: { thread_id: THREAD_B } };

  await Promise.all([
    graph.invoke({ messages: [new HumanMessage("My name is Snehasis. Remember it.")] }, a),
    graph.invoke({ messages: [new HumanMessage("My name is Priya. Remember it.")] }, b),
  ]);
  const [ra, rb] = await Promise.all([
    graph.invoke({ messages: [new HumanMessage("What is my name? Reply with the name only.")] }, a),
    graph.invoke({ messages: [new HumanMessage("What is my name? Reply with the name only.")] }, b),
  ]);

  console.log("   thread A says:", String(ra.messages.at(-1)?.content).trim(), " (expected Snehasis)");
  console.log("   thread B says:", String(rb.messages.at(-1)?.content).trim(), " (expected Priya)");
  console.log(`   A has ${ra.messages.length} messages, B has ${rb.messages.length} (expected 4 each — nothing leaked)`);

  // Raw: what "isolated" actually means on disk.
  const { rows } = await pool.query<{ thread_id: string; checkpoints: number }>(
    `SELECT thread_id, count(*)::int AS checkpoints
     FROM checkpoints WHERE thread_id = ANY($1) GROUP BY thread_id ORDER BY thread_id`,
    [[THREAD_A, THREAD_B]],
  );
  for (const r of rows) console.log(`   ${r.thread_id}: ${r.checkpoints} checkpoint rows`);
  // Every query PostgresSaver runs — getTuple, list, put, putWrites — starts
  // `WHERE thread_id = $1 AND checkpoint_ns = $2`. There is no lock, no
  // transaction spanning threads, no shared row. Two threads are isolated the
  // way two customers' orders in an `orders` table are isolated: by key.
  // That is the entire mechanism — and it's also exactly why Part 14 breaks.
}

// =============================================================================
// PART 14 — SAME thread, two invokes at the same moment: a race
// =============================================================================
// getTuple() for "latest" is (checkpoint-postgres/index.js:230):
//   WHERE thread_id = $1 AND checkpoint_ns = $2 ORDER BY checkpoint_id DESC LIMIT 1
// No `FOR UPDATE`, no advisory lock. Two invokes both read the same latest
// checkpoint, both run, both write a child of it. That's two children of one
// parent — the fork from 08, except nobody asked for it. The thread's "latest"
// is whichever child has the higher (later) checkpoint_id; the other turn is
// still on disk but no future invoke() will ever load it.

async function sameThreadRace() {
  console.log("\n=== PART 14: same thread, two invokes at once — a race ===");
  const config = { configurable: { thread_id: THREAD_RACE } };

  // Turn 1 alone, so there's a real shared parent for the race to fork from.
  await graph.invoke({ messages: [new HumanMessage("My name is Snehasis.")] }, config);

  // Now two "senders" on the same chat at the same moment: a double-click, a
  // client retry, two API pods handling the same thread. Same thread_id, no
  // checkpoint_id → both start from "latest".
  await Promise.all([
    graph.invoke({ messages: [new HumanMessage("I live in Bangalore.")] }, config),
    graph.invoke({ messages: [new HumanMessage("I work at HCLTech.")] }, config),
  ]);

  const state = await graph.getState(config);
  const humans = humansOn(state.values.messages);
  console.log("   human messages on the thread's latest checkpoint:", humans);
  console.log(`   count: ${humans.length}  (3 = both survived; 2 = one turn silently lost)`);

  const result = await graph.invoke(
    { messages: [new HumanMessage(
      "Where do I live and where do I work? One line. Say 'unknown' for anything I never told you.")] },
    config,
  );
  console.log('printing result')
  console.log("   A:", String(result.messages.at(-1)?.content).trim().slice(0, 120));
  await readTree(THREAD_RACE);
  // The exact interleaving is NOT deterministic — that is the bug. What IS
  // guaranteed: LangGraph took no lock, each invoke read "latest" on its own,
  // and the checkpoint tree below is the only honest record of what happened.
}

// =============================================================================
// PART 15 — the raw fix: serialize invokes per thread
// =============================================================================
// Same two messages, same thread shape — but queued: the second invoke does
// not START until the first has RETURNED (and so has committed its
// checkpoint). Build it by hand first: a Map from thread_id to "the promise
// of the last invoke on that thread". Each new call chains onto it.

const tails = new Map<string, Promise<unknown>>();

function invokeSerialized(threadId: string, input: { messages: HumanMessage[] }) {
  const prev = tails.get(threadId) ?? Promise.resolve();
  // .catch(() => {}) so one failed turn doesn't poison every later turn.
  const next = prev.catch(() => {}).then(() =>
    graph.invoke(input, { configurable: { thread_id: threadId } }));
  tails.set(threadId, next);
  return next;
}

async function sameThreadSerialized() {
  console.log("\n=== PART 15: same race, but queued per thread ===");
  await invokeSerialized(THREAD_QUEUED, { messages: [new HumanMessage("My name is Snehasis.")] });

  // Fired in the same tick, exactly like Part 14 — the only difference is the
  // queue in front of graph.invoke().
  await Promise.all([
    invokeSerialized(THREAD_QUEUED, { messages: [new HumanMessage("I live in Bangalore.")] }),
    invokeSerialized(THREAD_QUEUED, { messages: [new HumanMessage("I work at HCLTech.")] }),
  ]);

  const state = await graph.getState({ configurable: { thread_id: THREAD_QUEUED } });
  const humans = humansOn(state.values.messages);
  console.log("   human messages on the thread's latest checkpoint:", humans);
  console.log(`   count: ${humans.length}  (expected 3)`);
  await readTree(THREAD_QUEUED);
  // LIMITATION, and it's the whole production point: `tails` lives in THIS
  // process. Two API pods each have their own Map, and each will happily run
  // the same thread at once. The real fix has to live somewhere all pods
  // share — see PRODUCTION NOTES 2.
}

// -----------------------------------------------------------------------------
// The tree reader from 08, reduced to one question: is this thread a line or
// a tree? Count children per parent_checkpoint_id; any parent with 2+ is a fork.
// -----------------------------------------------------------------------------
async function readTree(threadId: string) {
  const { rows } = await pool.query<{ checkpoint_id: string; parent_checkpoint_id: string | null; step: string }>(
    `SELECT checkpoint_id, parent_checkpoint_id, metadata->>'step' AS step
     FROM checkpoints WHERE thread_id = $1 AND checkpoint_ns = '' ORDER BY checkpoint_id`, [threadId]);

  const stepById = new Map(rows.map((r) => [r.checkpoint_id, r.step]));
  const children = new Map<string, string[]>();
  for (const r of rows) {
    if (!r.parent_checkpoint_id) continue;
    children.set(r.parent_checkpoint_id, [...(children.get(r.parent_checkpoint_id) ?? []), r.step]);
  }
  const forks = [...children.entries()].filter(([, c]) => c.length > 1);
  console.log(`   checkpoints table: ${rows.length} rows, ` + (forks.length === 0
    ? "a straight line — every parent has exactly one child"
    : forks.map(([p, c]) => `FORK at step ${stepById.get(p)} → ${c.length} children (steps ${c.join(", ")})`).join("; ")));
}

async function reset() {
  console.log("\n=== --reset: deleting all four demo threads ===");
  await deleteThreads(THREAD_A, THREAD_B, THREAD_RACE, THREAD_QUEUED);
  console.log("   gone from all three tables. Next run starts fresh.");
}

// -----------------------------------------------------------------------------
// PRODUCTION NOTES
// -----------------------------------------------------------------------------
// 1. ISOLATION IS BY KEY, NOT BY LOCK. PostgresSaver never locks a thread.
//    Cross-thread isolation is free and total. Within-thread concurrency is
//    entirely your problem, and the failure mode is silent: no error, no
//    duplicate, just a turn that no future load will ever see.
// 2. SERIALIZE PER THREAD, SOMEWHERE ALL PODS SHARE. Options, cheapest first:
//      a. Postgres advisory lock around the invoke:
//         `SELECT pg_advisory_xact_lock(hashtext($thread_id))` in a
//         transaction held for the run's duration — you already have PG.
//      b. A Redis lock (SET NX PX) keyed by thread_id, with a TTL longer than
//         your slowest run.
//      c. Route by thread: one partitioned queue, thread_id as the partition
//         key, so a given thread is only ever processed by one worker.
//    Rejecting a concurrent send with 409 is also legitimate — the UI just
//    disables Send while a run is in flight. Pick one; "none" is not a choice.
// 3. thread_id IN THE WORK APP = the chat session id. That single decision
//    fixes three others: retention is per-chat (the sweeper deletes a chat,
//    not a user); the concurrency guard above is per-chat; and anything that
//    must survive ACROSS chats ("this user prefers metric units") does NOT
//    belong in the checkpointer at all — that is the Store, 4.6.
// 4. checkpoint_ns IS NOT A SECOND ISOLATION KEY. From 06: it namespaces a
//    subgraph's checkpoints INSIDE a thread. Two threads with the same ns
//    are still two threads; one thread's subgraph and parent are still one
//    thread. Don't reach for it to "separate users".
//
// -----------------------------------------------------------------------------
// 🎯 THE THREE INTERVIEW QUESTIONS
// -----------------------------------------------------------------------------
// 1. What problem does thread isolation solve, and what closely related
//    problem does it NOT solve?
// 2. Underneath: what single query does PostgresSaver run to find "latest",
//    and what is missing from it that makes a same-thread race possible?
// 3. What breaks in production if you ship the in-process per-thread queue
//    from Part 15 behind a load balancer with three replicas?

async function main() {
  try {
    await checkpointer.setup();

    if (process.argv.includes("--reset")) {
      await reset();
      return;
    }

    // await twoThreadsInParallel();
    await sameThreadRace();
    // await sameThreadSerialized();

    // console.log("\n=============================================================");
    // console.log("RECAP");
    // console.log("  across threads : isolated by WHERE thread_id = $1 — free, total, no lock");
    // console.log("  same thread    : two concurrent invokes both read 'latest' → accidental fork");
    // console.log("  the lost turn  : still on disk, never loaded again (latest = highest checkpoint_id)");
    // console.log("  the fix        : serialize per thread — in ONE process a Map of promises works,");
    // console.log("                   across pods it must be a shared lock or a partitioned queue");
    // console.log("  work app       : thread_id = chat session id → retention, locking, and");
    // console.log("                   cross-chat memory (Store, not checkpointer) all follow from it");
    // console.log("  NEXT           : Block 1 exercise — exercises/05-memory-chatbot.ts, then Block 2");
    // console.log("=============================================================");
  } finally {
    await closeAll();
  }
}

main().catch(console.error);
