/**
 * Block 1 exercise — Memory chatbot: ONE graph, TWO checkpointers
 *
 * Write this with 05–09 CLOSED. Scaffold only: imports, state, stubs, and a
 * main() that runs the flow. The node logic, the graph factory, and every
 * assertion are yours.
 *
 * DONE means (tick these in the file as you go):
 *   [ ] buildGraph(checkpointer) returns a compiled graph. Called twice below
 *       with different savers; the graph code inside must not change.
 *   [ ] runScenario(graph, label) — the SAME function — passes every check with
 *       MemorySaver, then again with PostgresSaver. No `if (label === "pg")`.
 *   [ ] Check 1: thread-1 is told a name, then asked it → the reply contains it.
 *   [ ] Check 2: thread-2 asks the name → it can't know (isolation by key).
 *   [ ] Check 3: two threads told two different names AT THE SAME TIME
 *       (Promise.all) → each thread answers with its own name.
 *   [ ] Check 4 (pg only, second process): run the file twice WITHOUT --reset.
 *       On the second run, thread-1 still knows the name from the FIRST run.
 *       MemorySaver cannot pass this — say so in the output instead of failing.
 *   [ ] --reset deletes the pg threads. --check prints the expected truths.
 *   [ ] Stretch: send two messages on thread-1 concurrently, then prove — from
 *       the `checkpoints` table, not from the reply — whether a turn was lost.
 *       Then make it not lose one.
 *
 * Run:   npx tsx 02-rag-memory/exercises/05-memory-chatbot.ts
 *        npx tsx 02-rag-memory/exercises/05-memory-chatbot.ts --check
 *        npx tsx 02-rag-memory/exercises/05-memory-chatbot.ts --reset
 */

import "dotenv/config";
import {
  StateGraph, MessagesAnnotation, MemorySaver, START, END,
  type BaseCheckpointSaver,
} from "@langchain/langgraph";
import { HumanMessage } from "@langchain/core/messages";
import { llm } from "../../lib/llm.js";
import { checkpointer as pgCheckpointer, pool, deleteThreads, closeAll } from "../_pg.js";

// Prefix pg threads so --reset can't touch anything from 05–09.
const T1 = "ex-memory-chatbot-1";
const T2 = "ex-memory-chatbot-2";
const T3 = "ex-memory-chatbot-3";

// -----------------------------------------------------------------------------
// State — MessagesAnnotation is enough. If you find yourself adding a field,
// write down why before you do.
// -----------------------------------------------------------------------------

// -----------------------------------------------------------------------------
// Nodes
// -----------------------------------------------------------------------------
async function chat(state: typeof MessagesAnnotation.State) {
  // TODO: call the model with the history the checkpointer loaded for you.
  //       Return ONLY the new message(s). Do not resend history.
  throw new Error("TODO: chat node");
}

// -----------------------------------------------------------------------------
// The factory — the whole exercise lives in this signature
// -----------------------------------------------------------------------------
function buildGraph(checkpointer: BaseCheckpointSaver) {
  // TODO: build START -> chat -> END and compile WITH the checkpointer passed in.
  throw new Error("TODO: buildGraph");
}

// -----------------------------------------------------------------------------
// The scenario — runs unchanged against both savers
// -----------------------------------------------------------------------------
let passed = 0, failed = 0;
function check(label: string, ok: boolean, detail = "") {
  ok ? passed++ : failed++;
  console.log(`   ${ok ? "✅" : "❌"} ${label}${detail ? "  — " + detail : ""}`);
}

async function runScenario(graph: ReturnType<typeof buildGraph>, label: string) {
  console.log(`\n=== ${label} ===`);

  // TODO Check 1: tell T1 a name, ask T1 the name, check the reply.
  //      Think about what you pass on the SECOND invoke — the new message only.

  // TODO Check 2: ask T2 the name. Decide what "can't know" looks like in a
  //      reply and check for that (don't over-fit to one phrasing).

  // TODO Check 3: Promise.all — tell T2 and T3 different names concurrently,
  //      then ask both concurrently. Each must answer with its own.

  // TODO Check 4: getState(T1) BEFORE Check 1 runs — if messages already exist,
  //      this is a second process against a durable saver: assert the name
  //      survives from the previous run. With MemorySaver, print that the
  //      check is not applicable and why. (Yes: this means Check 4's read has
  //      to happen before Check 1's write. Order matters.)

  // TODO Stretch: two concurrent invokes on T1, then query `checkpoints` for
  //      a parent_checkpoint_id with more than one child.
}

// -----------------------------------------------------------------------------
// --check: what a correct run proves. No code to write here — read it, then
// make the scenario above produce exactly this.
// -----------------------------------------------------------------------------
function printExpectations() {
  console.log(`
After a correct run, ALL of the following are true:

  MemorySaver pass
    - Check 1 ✅  T1 answers with the name it was told
    - Check 2 ✅  T2 does not know T1's name
    - Check 3 ✅  T2 and T3, run concurrently, each answer with their own name
    - Check 4 —   printed as "not applicable: MemorySaver dies with the process"

  PostgresSaver pass, FIRST process
    - Checks 1–3 ✅  identical output to the MemorySaver pass (same function!)
    - Check 4 —   printed as "first run: nothing to verify yet, run again"
    - psql: SELECT thread_id, count(*) FROM checkpoints
            WHERE thread_id LIKE 'ex-memory-chatbot-%' GROUP BY 1;
            → three rows, one per thread

  PostgresSaver pass, SECOND process (no --reset in between)
    - Check 4 ✅  T1 remembers the name from the previous process
    - MemorySaver pass still prints "not applicable" — that IS the lesson:
      same graph, same tests, only the saver changed, and only one survives
      a restart.

  Stretch
    - After two concurrent sends on T1, the checkpoints table has ONE parent
      with TWO children. After your fix, every parent has exactly one child.
`);
}

async function main() {
  if (process.argv.includes("--check")) { printExpectations(); return; }

  try {
    await pgCheckpointer.setup();

    if (process.argv.includes("--reset")) {
      await deleteThreads(T1, T2, T3);
      console.log("pg threads deleted:", T1, T2, T3);
      return;
    }

    await runScenario(buildGraph(new MemorySaver()), "MemorySaver — dies with the process");
    await runScenario(buildGraph(pgCheckpointer), "PostgresSaver — survives the process");

    console.log(`\n${passed} passed, ${failed} failed`);
  } finally {
    await closeAll();
  }
}

main().catch(console.error);
