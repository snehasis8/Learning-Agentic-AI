/**
 * Module 2.5 — Durable state, step 1: the Postgres checkpointer
 *
 * WHAT YOU'LL LEARN:
 *   - The two-line swap: MemorySaver -> PostgresSaver
 *   - What setup() actually creates, and why it is a migration, not a boot step
 *   - Proving durability the only honest way: kill the process, run again
 *   - The four tables, read raw — checkpoints, checkpoint_blobs, checkpoint_writes
 *   - Why channel VALUES live in a different table from the checkpoint row
 *
 * WHY THIS MATTERS:
 *   3.5 gave you memory that dies with the process. 3.6 gave you interrupts that
 *   pause a run — but paused where, exactly, if a deploy wipes it? Every later
 *   step in this block (crash-and-resume, duplicate writes, forking history,
 *   thread isolation) needs state that outlives the Node process. This is that.
 *   It is also the exact swap the work app has to make before it ships.
 *
 * SETUP (once):
 *   docker compose up -d postgres
 *   # optional — defaults to the compose URL below:
 *   # POSTGRES_URL=postgresql://postgres:postgres@localhost:5432/langgraph
 *
 * Run:   npx tsx 02-rag-memory/05-durable-state-postgres.ts
 *        ...then run it AGAIN. The second run is the whole point.
 * Reset: npx tsx 02-rag-memory/05-durable-state-postgres.ts --reset
 */

import "dotenv/config";
import {
  StateGraph, MessagesAnnotation, Annotation, START, END, interrupt, Command,
} from "@langchain/langgraph";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { HumanMessage, AIMessage } from "@langchain/core/messages";
import pg from "pg";
import { llm } from "../lib/llm.js";

const PG_URL =
  process.env.POSTGRES_URL ?? "postgresql://postgres:postgres@localhost:5432/langgraph";

// Same idea as 3.5's "user-42". Keep it fixed so re-running the script lands on
// the SAME conversation — that is what makes the durability visible.
const THREAD_ID = "pg-demo-1";
const THREAD_ID_2 = "pg-demo-2"; // reserved for step 5 — two threads, isolation
const THREAD_ID_INTERRUPT = "pg-demo-interrupt-1";

// =============================================================================
// PART 1 — The swap
// =============================================================================
// Compare this to 03-langgraph/05-checkpointing.ts. The graph is identical. The
// node is identical. Two things changed:
//
//   const checkpointer = new MemorySaver();                     <- was
//   const checkpointer = PostgresSaver.fromConnString(PG_URL);  <- is
//   await checkpointer.setup();                                 <- new
//
// That is the entire migration. BaseCheckpointSaver is an interface; the graph
// never learns which implementation it got. THAT is why 3.5 could honestly call
// this "a one-line swap" — you are now cashing that cheque.

const checkpointer = PostgresSaver.fromConnString(PG_URL);

async function callModel(state: typeof MessagesAnnotation.State) {
  const response = await llm.invoke(state.messages);
  return { messages: [response] };
}

const graph = new StateGraph(MessagesAnnotation)
  .addNode("llm", callModel)
  .addEdge(START, "llm")
  .addEdge("llm", END)
  .compile({ checkpointer });

// A second connection, purely so you can read the tables yourself. The saver
// keeps its own private pool; nothing here reaches into it.
const pool = new pg.Pool({ connectionString: PG_URL });

// =============================================================================
// PART 2 — What setup() creates
// =============================================================================
// setup() runs the checkpointer's migrations: CREATE TABLE IF NOT EXISTS x4,
// recorded by version number in checkpoint_migrations. It is idempotent, so
// calling it twice is harmless.
//
// It is still a MIGRATION, not a boot step. In production you run it once, from
// a deploy job, with a role that may CREATE TABLE. Your app's runtime role
// should only be able to SELECT/INSERT/UPDATE — an agent process that can
// reshape its own schema on startup is a bad day waiting to happen.

async function whatSetupCreated() {
  console.log("\n=== PART 2: what setup() created ===");

  const { rows } = await pool.query<{ table_name: string; columns: string }>(`
    SELECT t.table_name,
           string_agg(c.column_name, ', ' ORDER BY c.ordinal_position) AS columns
    FROM information_schema.tables t
    JOIN information_schema.columns c ON c.table_name = t.table_name
    WHERE t.table_schema = 'public' AND t.table_name LIKE 'checkpoint%'
    GROUP BY t.table_name ORDER BY t.table_name`);

  for (const r of rows) console.log(`   ${r.table_name.padEnd(22)} ${r.columns}`);

  // checkpoint_migrations  -> just a version number. Schema bookkeeping.
  // checkpoints            -> one row per super-step. The skeleton of the run.
  // checkpoint_blobs       -> the actual channel VALUES, one row per version.
  // checkpoint_writes      -> what a task wrote but hasn't been folded in yet.
}

// =============================================================================
// PART 3 — Durability, proven properly
// =============================================================================
// getState() before invoking anything answers one question: does this thread
// already exist in the database? On a first run, no. On the second run — a
// BRAND NEW Node process, with nothing shared but a connection string — yes.
//
// This is the difference MemorySaver could never show you. There, the second
// process starts blank and the conversation is simply gone.

async function acrossProcesses() {
  console.log("\n=== PART 3: does this thread survive a process restart? ===");
  const config = { configurable: { thread_id: THREAD_ID } };

  const before = await graph.getState(config);
  const prior = before.values.messages?.length ?? 0;
  console.log("   messages already in Postgres for this thread:", prior);

  if (prior === 0) {
    console.log("   -> first run. Writing a fact into the conversation.");
    await graph.invoke(
      { messages: [new HumanMessage("My name is Snehasis and my lucky number is 7.")] },
      config,
    );
    console.log("   ✅ saved. NOW KILL THIS AND RUN THE SCRIPT AGAIN.");
  } else {
    console.log("   -> those were written by a PREVIOUS process. Asking it to recall:");
    const answer = await graph.invoke(
      { messages: [new HumanMessage("What is my name and my lucky number?")] },
      config,
    );
    console.log("   A:", String(answer.messages.at(-1)?.content).slice(0, 120));
    console.log("   messages now:", answer.messages.length);
    // Nothing was passed in but the new question. The history came off disk.
  }
}

// =============================================================================
// PART 4 — Reading the tables raw
// =============================================================================
// Do not treat these as a black box. You will debug them in production, and
// "what breaks in the checkpoint tables" is a question you should be able to
// answer from having looked.

async function readTheTables() {
  console.log("\n=== PART 4: the rows, raw ===");

  // --- checkpoints: one row per super-step -----------------------------------
  // checkpoint_id is a UUIDv6 — time-ordered, so ORDER BY is chronological.
  // parent_checkpoint_id chains them into a linked list. Walking that list
  // backwards is exactly what getStateHistory() does, and forking it (step 4)
  // is what makes time travel a branch rather than an overwrite.
  const cps = await pool.query(`
    SELECT checkpoint_id, parent_checkpoint_id, checkpoint_ns,
           metadata->>'source' AS source, metadata->>'step' AS step
    FROM checkpoints WHERE thread_id = $1
    ORDER BY checkpoint_id`, [THREAD_ID]);

  console.log(`   checkpoints: ${cps.rowCount} row(s)`);
  for (const r of cps.rows) {
    console.log(
      `     step ${String(r.step).padStart(2)}  source=${String(r.source).padEnd(6)}` +
      `  ns='${r.checkpoint_ns}'  parent=${r.parent_checkpoint_id ? "yes" : "— (root)"}`,
    );
  }

  const keys = await pool.query<{ key: string }>(`
    SELECT DISTINCT jsonb_object_keys(checkpoint) AS key
    FROM checkpoints WHERE thread_id = $1 ORDER BY key`, [THREAD_ID]);
  console.log("   keys inside the `checkpoint` JSONB:",
    keys.rows.map((r) => r.key).join(", ") || "—");
  // NOTE what is NOT in that list: channel_values. The checkpoint row holds the
  // STRUCTURE of a step — id, timestamp, channel_versions, versions_seen — and
  // points at versions. The data itself is next door.

  // --- checkpoint_blobs: the values, deduplicated by version ------------------
  const blobs = await pool.query(`
    SELECT channel, version, type, octet_length(blob) AS bytes
    FROM checkpoint_blobs WHERE thread_id = $1
    ORDER BY channel, version`, [THREAD_ID]);
  console.log(`\n   checkpoint_blobs: ${blobs.rowCount} row(s)`);
  for (const r of blobs.rows) {
    console.log(`     ${String(r.channel).padEnd(16)} v=${String(r.version).padEnd(4)}` +
      ` ${String(r.type).padEnd(10)} ${r.bytes ?? 0} bytes`);
  }
  // WHY THE SPLIT: a channel that didn't change during a super-step is not
  // re-serialised — the new checkpoint just references the existing version.
  // Ten steps that only touch `messages` do not store ten copies of every other
  // channel. This is the single most important thing to understand before you
  // reason about checkpoint table growth.

  // --- checkpoint_writes: pending writes --------------------------------------
  const writes = await pool.query(`
    SELECT checkpoint_id, task_id, idx, channel, octet_length(blob) AS bytes
    FROM checkpoint_writes WHERE thread_id = $1
    ORDER BY checkpoint_id, idx`, [THREAD_ID]);
  console.log(`\n   checkpoint_writes: ${writes.rowCount} row(s)`);
  for (const r of writes.rows) {
    console.log(`     task=${String(r.task_id).slice(0, 8)}  idx=${r.idx}` +
      `  channel=${String(r.channel).padEnd(16)} ${r.bytes ?? 0} bytes`);
  }
  // These are the writes a TASK produced, recorded against the checkpoint it
  // started from, keyed by (checkpoint_id, task_id, idx). They matter when a
  // super-step has several nodes and one of them fails: the ones that succeeded
  // already have their writes on disk, so the retry doesn't re-run them. In a
  // one-node graph like this you'll see very few. Step 2 and step 3 of this
  // block are where they start to earn their keep.

  console.log(`
   Now go look yourself — the SQL is the lesson:
     docker exec -it pg-learn psql -U postgres -d langgraph
     \\dt
     select checkpoint_id, parent_checkpoint_id, metadata from checkpoints;
     select channel, version, octet_length(blob) from checkpoint_blobs;`);
}

// =============================================================================
// PART 5 — Deleting a thread
// =============================================================================
// Every row above is keyed by thread_id, in all three tables. deleteThread()
// removes them together. This is your GDPR answer and the beginning of your
// retention policy — 3.5's production note #4, now something you can actually
// execute.

async function reset() {
  console.log("\n=== --reset: deleting thread", THREAD_ID, "===");
  await checkpointer.deleteThread(THREAD_ID);
  await checkpointer.deleteThread(THREAD_ID_INTERRUPT);
  console.log("   gone from all three tables. Next run starts fresh.");
}

// =============================================================================
// STEP 2 — PART 6: interrupt() inside a SUBGRAPH, across a process restart
// =============================================================================
// Part 3 proved MESSAGES survive a restart. This proves something sharper: a
// PAUSE survives one — including a pause raised from inside a subgraph, which
// is the first time `checkpoint_ns` in Part 4's table stops being ''.
//
// The subgraph: one node, asking a human whether the LLM should even see this
// question. It is compiled WITHOUT a checkpointer of its own — a subgraph
// never owns one. When it runs as a node inside a parent that HAS one, it
// checkpoints through that same saver, and LangGraph keeps "the parent's
// step 0" and "the subgraph's step 0" apart using checkpoint_ns. This is the
// "shared state" style of subgraph (same channel names on both sides) — the
// simplest composition there is. 4.2 covers the other one (mapped/transformed
// state, different schemas) properly; this is only enough to make checkpoint_ns
// stop being theoretical.

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

// Same `checkpointer` instance as Part 1's graph — one PostgresSaver, two
// graphs, all four tables shared and partitioned by thread_id. The checkpointer
// is a compile-time argument, not a property of the graph.
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
// STEP 2 — PART 7: checkpoint_ns, no longer blank
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

// -----------------------------------------------------------------------------
// PRODUCTION NOTES
// -----------------------------------------------------------------------------
// 1. setup() IS A MIGRATION. Run it from a deploy step, once, with elevated
//    privileges. Do not call it on every app boot, and do not let the runtime
//    role own DDL rights.
// 2. THE POOL IS A RESOURCE. PostgresSaver opens a pg.Pool and holds it open —
//    forget checkpointer.end() and your script hangs at exit and your server
//    leaks connections. In a long-running app build the saver ONCE at startup,
//    never per request, and size the pool against your Postgres max_connections.
// 3. ONE SUPER-STEP = ONE TRANSACTION. put() writes blobs and the checkpoint row
//    inside a single BEGIN/COMMIT. So a checkpoint is all-or-nothing — but the
//    transaction covers only the CHECKPOINT, not the side effects your node just
//    performed. That gap is step 3 of this block, and it is where real systems
//    produce duplicate emails.
// 4. GROWTH IS REAL NOW. In memory, unbounded state was a leak you restarted
//    away. On disk it is a bill and a slow query. You need a retention policy —
//    and note that nothing in LangGraph prunes old checkpoints for you.
// 5. PII SITS IN checkpoint_blobs AS BYTEA. Serialised message content, plain.
//    Encrypt at rest, keep it out of logs and backups you don't control, and
//    make sure "delete my data" reaches deleteThread().
// 6. `checkpoint_ns` is '' for the root graph and non-empty for subgraphs. It is
//    part of every primary key here. Step 2 is where it stops being a blank
//    column you ignore.
//
// -----------------------------------------------------------------------------
// 🎯 THE THREE INTERVIEW QUESTIONS
// -----------------------------------------------------------------------------
// 1. What problem does a Postgres checkpointer solve that MemorySaver doesn't —
//    and why is swapping between them a one-line change?
// 2. Underneath: what does setup() create, and why are channel values stored in
//    checkpoint_blobs instead of inside the checkpoint row?
// 3. What breaks first once checkpoints are on disk instead of in memory?

async function main() {
  try {
    // Idempotent, but see production note 1 — this line belongs in a deploy job.
    await checkpointer.setup();

    if (process.argv.includes("--reset")) {
      await reset();
      return;
    }

    //  await whatSetupCreated();
    // await acrossProcesses();
    // await readTheTables();

    await subgraphInterruptAcrossProcesses();
    await readNamespaces();

    console.log("\n=============================================================");
    console.log("RECAP");
    console.log("  PostgresSaver.fromConnString + setup()  -> durable state");
    console.log("  the graph never knows which saver it got (same interface)");
    console.log("  checkpoints       = one row per super-step, chained by parent_id");
    console.log("  checkpoint_blobs  = the channel VALUES, deduped by version");
    console.log("  checkpoint_writes = a task's writes, for resume without re-running");
    console.log("  one super-step    = one transaction (the checkpoint — not your side effects)");
    console.log("  deleteThread()    = your retention + GDPR story");
    console.log("  a subgraph never owns a checkpointer — it runs through the parent's");
    console.log("  checkpoint_ns tells parent steps and subgraph steps apart, same tables");
    console.log("  interrupt() inside a subgraph pauses the WHOLE run, parent included");
    console.log("  NEXT (step 3)     : tool writes to PG/Elastic, crash before checkpoint commit");
    console.log("=============================================================");
  } finally {
    // Both pools must be closed or the process will not exit.
    await checkpointer.end();
    await pool.end();
  }
}

main().catch(console.error);
