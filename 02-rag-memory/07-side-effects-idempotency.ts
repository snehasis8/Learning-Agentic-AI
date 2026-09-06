/**
 * Module 2.5 — Durable state, step 3: the side-effect gap
 *
 * WHAT YOU'LL LEARN:
 *   - One super-step is one transaction — but that transaction covers only the
 *     CHECKPOINT, never a side effect your node performed
 *   - Why a state flag can't close that gap, and why a unique constraint can
 *   - What the `durability` option actually controls — and the one thing it
 *     does NOT control, which is easy to assume it does
 *
 * WHY THIS MATTERS:
 *   This is where real systems send the same email, refund, or Elastic write
 *   twice. "We have checkpointing" is not the same claim as "we are
 *   idempotent", and this file is what makes the difference undeniable.
 *
 * SETUP: same as 05 — docker compose up -d postgres.
 *
 * Run:   npx tsx 02-rag-memory/07-side-effects-idempotency.ts
 *        ...then run it AGAIN after each crash to resume.
 * Reset: npx tsx 02-rag-memory/07-side-effects-idempotency.ts --reset
 */

import "dotenv/config";
import { StateGraph, Annotation, START, END } from "@langchain/langgraph";
import { checkpointer, pool, deleteThreads, closeAll } from "./_pg.js";

const THREAD_ID_CRASH = "pg-demo-crash-1";
const THREAD_ID_IDEMPOTENT = "pg-demo-idempotent-1";
const THREAD_ID_SYNC = "pg-demo-sync-1";

const RefundState = Annotation.Root({
  orderId: Annotation<string>,
  amountCents: Annotation<number>,
  refunded: Annotation<boolean>,
});

// =============================================================================
// PART 8 — the side-effect gap, made real (no idempotency yet)
// =============================================================================
// One super-step is one transaction — but that transaction covers the
// CHECKPOINT, never the side effect your node just performed. This
// manufactures that exact gap: a real INSERT into Postgres, committed
// instantly, followed by a hard `process.exit()` before this step's
// checkpoint is written. Same as a pod getting OOM-killed between "the email
// sent" and "the run recorded that".
//
// The crash only fires ONCE per order — checked by looking at whether the
// side effect already exists — so the SECOND run is free to finish and show
// you the damage instead of crash-looping forever.

async function ensureSideEffectTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS refund_log (
      id SERIAL PRIMARY KEY,
      order_id TEXT NOT NULL,
      amount_cents INT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
}

async function processRefundNaive(state: typeof RefundState.State) {
  const { rows } = await pool.query<{ n: number }>(
    "SELECT count(*)::int AS n FROM refund_log WHERE order_id = $1", [state.orderId],
  );
  const alreadyAttempted = rows[0].n > 0;

  // THE SIDE EFFECT. Real, committed the instant it runs — Postgres has no
  // idea a LangGraph checkpoint for this step doesn't exist yet.
  await pool.query(
    "INSERT INTO refund_log (order_id, amount_cents) VALUES ($1, $2)",
    [state.orderId, state.amountCents],
  );
  console.log(`   💸 refunded ${state.amountCents}c for ${state.orderId}` +
    ` (attempt #${rows[0].n + 1}, side effect committed)`);

  if (!alreadyAttempted) {
    // Everything above already happened for real. Nothing below — including
    // this node's own return, which is what would let the checkpoint record
    // "refund done" — ever runs on this attempt.
    console.log("   💥 simulating a crash right here — before the checkpoint commits");
    process.exit(1);
  }
  return { refunded: true };
}

const naiveGraph = new StateGraph(RefundState)
  .addNode("refund", processRefundNaive)
  .addEdge(START, "refund")
  .addEdge("refund", END)
  .compile({ checkpointer });

async function naiveCrashAndDuplicate() {
  console.log("\n=== PART 8: crash after the write, before the checkpoint ===");
  await ensureSideEffectTable();
  const config = { configurable: { thread_id: THREAD_ID_CRASH } };
  const snap = await naiveGraph.getState(config);
  // NOT `Object.keys(snap.values).length === 0` — this graph's edge is a plain
  // unconditional START -> refund, so LangGraph fuses __start__ and refund's
  // dispatch into ONE superstep with no checkpoint commit in between. Crashing
  // inside refund rolls all the way back to the raw input marker, whose
  // `values` are legitimately {} even though the thread WAS invoked. The only
  // honest "does this thread exist at all" check is whether ANY checkpoint
  // was ever written for it.
  const hasCheckpoint = snap.config.configurable?.checkpoint_id !== undefined;

  if (!hasCheckpoint) {
    console.log("   -> first run. This WILL crash on purpose. Run the script again after.");
    await naiveGraph.invoke({ orderId: "R-001", amountCents: 4200 }, config);
    // unreachable on this attempt — process.exit() above already ended it
  } else if (snap.next.length > 0) {
    console.log("   -> resuming. Whatever superstep was mid-flight never committed, so");
    console.log("      LangGraph replays from the last checkpoint that DID land — here,");
    console.log("      that's before 'refund' ran at all. Resume with null = continue.");
    await naiveGraph.invoke(null, config);
    const { rows } = await pool.query(
      "SELECT id, amount_cents, created_at FROM refund_log WHERE order_id = $1 ORDER BY id",
      ["R-001"],
    );
    console.log(`   refund_log rows for R-001: ${rows.length} (bug: expected 1)`);
    for (const r of rows) console.log("    ", r);
  } else {
    console.log("   -> already resolved from a prior run. --reset to see the crash again.");
  }
}

// =============================================================================
// PART 9 — the fix: a unique constraint, not a state flag
// =============================================================================
// The tempting fix is "check `state.refunded` before refunding again". It
// doesn't work HERE: the crash happens before that flag could ever be
// checkpointed, so the retry sees `refunded` still unset no matter what — the
// exact window we're simulating is defined as "before anything durable says
// this happened". Nothing living inside the graph's own state can close it.
//
// What CAN close it: a uniqueness guarantee that existed in the side-effect
// system BEFORE either attempt started. Same node, same crash point, same
// retry — but the database now refuses the second row outright.

async function ensureIdempotentTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS refund_log_v2 (
      order_id TEXT PRIMARY KEY,
      amount_cents INT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
}

async function processRefundIdempotent(state: typeof RefundState.State) {
  const { rows } = await pool.query<{ n: number }>(
    "SELECT count(*)::int AS n FROM refund_log_v2 WHERE order_id = $1", [state.orderId],
  );
  const alreadyAttempted = rows[0].n > 0;

  const result = await pool.query(
    `INSERT INTO refund_log_v2 (order_id, amount_cents) VALUES ($1, $2)
     ON CONFLICT (order_id) DO NOTHING RETURNING order_id`,
    [state.orderId, state.amountCents],
  );
  console.log(result.rowCount === 1
    ? "   💸 refund inserted for real"
    : "   ♻️  duplicate suppressed by the unique constraint — already refunded");

  if (!alreadyAttempted) {
    console.log("   💥 simulating the SAME crash, at the SAME point");
    process.exit(1);
  }
  return { refunded: true };
}

const idempotentGraph = new StateGraph(RefundState)
  .addNode("refund", processRefundIdempotent)
  .addEdge(START, "refund")
  .addEdge("refund", END)
  .compile({ checkpointer });

async function idempotentCrashAndResume() {
  console.log("\n=== PART 9: same crash, fixed with a unique constraint ===");
  await ensureIdempotentTable();
  const config = { configurable: { thread_id: THREAD_ID_IDEMPOTENT } };
  const snap = await idempotentGraph.getState(config);
  const hasCheckpoint = snap.config.configurable?.checkpoint_id !== undefined;

  if (!hasCheckpoint) {
    console.log("   -> first run. Will crash right after the write, same as Part 8.");
    await idempotentGraph.invoke({ orderId: "R-002", amountCents: 4200 }, config);
  } else if (snap.next.length > 0) {
    console.log("   -> resuming. The node reruns — LangGraph still can't know better —");
    console.log("      but the row it's trying to insert already exists.");
    await idempotentGraph.invoke(null, config);
    const { rows } = await pool.query(
      "SELECT order_id, amount_cents, created_at FROM refund_log_v2 WHERE order_id = $1",
      ["R-002"],
    );
    console.log(`   refund_log_v2 rows for R-002: ${rows.length} (fixed — always 1)`);
  } else {
    console.log("   -> already resolved from a prior run. --reset to see the crash again.");
  }
}

// =============================================================================
// PART 10 — does `durability: "sync"` fix it? (no)
// =============================================================================
// The natural next guess: "the gap exists because checkpointing is async by
// default — set `durability: 'sync'` and it goes away." It doesn't, and
// proving that matters more than the fix in Part 9, because it's the guess an
// interviewer expects you to make and then correct yourself on.
//
// What `durability` actually controls (from the LangGraph source):
//   "async" (default) — save the checkpoint for a finished step in the
//                        background, while the NEXT step starts executing.
//   "sync"            — finish saving the checkpoint for a finished step
//                        before the NEXT step is allowed to start.
//   "exit"            — only checkpoint when the whole run exits.
//
// All three are about ordering BETWEEN super-steps that have already
// finished. None of them touch what happens INSIDE a super-step that is
// still running. Our crash fires from inside `processRefundNaive`, before
// the node returns — which means there is no checkpoint write queued for
// this step yet, under ANY durability mode, because the step hasn't
// produced its writes yet. "sync" has nothing to wait for. Watch it fail to
// help, with the exact same crash, unchanged except for one config key.

async function ensureSyncTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS refund_log_v3 (
      id SERIAL PRIMARY KEY,
      order_id TEXT NOT NULL,
      amount_cents INT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
}

async function processRefundSyncDurability(state: typeof RefundState.State) {
  const { rows } = await pool.query<{ n: number }>(
    "SELECT count(*)::int AS n FROM refund_log_v3 WHERE order_id = $1", [state.orderId],
  );
  const alreadyAttempted = rows[0].n > 0;

  await pool.query(
    "INSERT INTO refund_log_v3 (order_id, amount_cents) VALUES ($1, $2)",
    [state.orderId, state.amountCents],
  );
  console.log(`   💸 refunded ${state.amountCents}c for ${state.orderId}` +
    ` (attempt #${rows[0].n + 1}, durability: "sync" in effect)`);

  if (!alreadyAttempted) {
    console.log("   💥 simulating the SAME crash, at the SAME point — 'sync' or not");
    process.exit(1);
  }
  return { refunded: true };
}

const syncGraph = new StateGraph(RefundState)
  .addNode("refund", processRefundSyncDurability)
  .addEdge(START, "refund")
  .addEdge("refund", END)
  .compile({ checkpointer });

async function syncDurabilityDoesNotFixIt() {
  console.log('\n=== PART 10: durability: "sync" — same crash, still duplicates ===');
  await ensureSyncTable();
  const config = { configurable: { thread_id: THREAD_ID_SYNC }, durability: "sync" as const };
  const snap = await syncGraph.getState(config);
  const hasCheckpoint = snap.config.configurable?.checkpoint_id !== undefined;

  if (!hasCheckpoint) {
    console.log("   -> first run, with durability: \"sync\" set. Will still crash on purpose.");
    await syncGraph.invoke({ orderId: "R-003", amountCents: 4200 }, config);
  } else if (snap.next.length > 0) {
    console.log("   -> resuming. If 'sync' fixed the gap, this would show 1 row. It won't.");
    await syncGraph.invoke(null, config);
    const { rows } = await pool.query(
      "SELECT id, amount_cents, created_at FROM refund_log_v3 WHERE order_id = $1 ORDER BY id",
      ["R-003"],
    );
    console.log(`   refund_log_v3 rows for R-003: ${rows.length} (still duplicated — "sync" didn't help)`);
    console.log("   the fix is still Part 9's unique constraint. Durability mode is a");
    console.log("   latency/ordering knob between finished steps, not a side-effect guard.");
  } else {
    console.log("   -> already resolved from a prior run. --reset to see the crash again.");
  }
}

async function reset() {
  console.log("\n=== --reset: deleting refund threads ===");
  await deleteThreads(THREAD_ID_CRASH, THREAD_ID_IDEMPOTENT, THREAD_ID_SYNC);
  await ensureSideEffectTable();
  await ensureIdempotentTable();
  await ensureSyncTable();
  await pool.query(`DELETE FROM refund_log WHERE order_id = 'R-001'`);
  await pool.query(`DELETE FROM refund_log_v2 WHERE order_id = 'R-002'`);
  await pool.query(`DELETE FROM refund_log_v3 WHERE order_id = 'R-003'`);
  console.log("   gone from all three checkpoint tables + the three demo side-effect tables.");
}

// -----------------------------------------------------------------------------
// PRODUCTION NOTES
// -----------------------------------------------------------------------------
// 1. ONE SUPER-STEP = ONE TRANSACTION for the CHECKPOINT ONLY. put() writes
//    blobs and the checkpoint row inside a single BEGIN/COMMIT — but that
//    transaction never includes your node's external writes.
// 2. A STATE FLAG CANNOT CLOSE THE GAP. `refunded: true` only becomes durable
//    once the node returns and the checkpoint commits. If the crash is
//    defined as happening before that, the flag never lands either.
// 3. THE FIX IS STRUCTURAL, NOT TEMPORAL. A uniqueness guarantee that existed
//    in the side-effect system BEFORE either attempt started — a business
//    idempotency key (order id, request id, a key you mint and persist before
//    the risky step) enforced by the side-effect store itself.
// 4. `durability` ("async" default / "sync" / "exit") governs when a
//    FINISHED step's checkpoint write is awaited relative to the NEXT step —
//    it is a latency/ordering knob, not an atomicity guarantee with whatever
//    your node did. Don't reach for it to solve this problem; reach for it
//    when you need to trade checkpoint-write latency against durability risk
//    on already-completed steps (e.g. "exit" for a long batch pipeline where
//    only the final state matters).
//
// -----------------------------------------------------------------------------
// 🎯 THE THREE INTERVIEW QUESTIONS
// -----------------------------------------------------------------------------
// 1. What problem does the side-effect gap describe, and why does "we have
//    checkpointing" not imply "we are idempotent"?
// 2. Underneath: why can't a state flag ever close this gap, no matter where
//    in the node you set it?
// 3. What breaks if you reach for `durability: "sync"` instead of an
//    idempotency key — and why does it look plausible before you test it?

async function main() {
  try {
    await checkpointer.setup();

    if (process.argv.includes("--reset")) {
      await reset();
      return;
    }

    await naiveCrashAndDuplicate();
    await idempotentCrashAndResume();
    await syncDurabilityDoesNotFixIt();

    console.log("\n=============================================================");
    console.log("RECAP");
    console.log("  crash after a side effect, before the checkpoint  -> the retry re-runs it");
    console.log("  a state flag can't close that gap — the crash is DEFINED as before it saves");
    console.log("  a unique constraint that predates both attempts CAN close it");
    console.log('  durability: "sync" orders checkpoint writes between FINISHED steps —');
    console.log("  it does nothing for a crash inside a step that hasn't returned yet");
    console.log("  NEXT (step 4)     : getStateHistory() -> updateState() fork -> resume");
    console.log("=============================================================");
  } finally {
    await closeAll();
  }
}

main().catch(console.error);
