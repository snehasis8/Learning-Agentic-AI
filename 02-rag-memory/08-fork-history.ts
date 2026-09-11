/**
 * Module 2.5 — Durable state, step 4: fork history with updateState()
 *
 * WHAT YOU'LL LEARN:
 *   - getStateHistory() walks the checkpoint chain from newest to oldest
 *   - updateState() against an OLD checkpoint_id doesn't overwrite anything —
 *     it creates a NEW checkpoint whose parent is that old one, i.e. a branch
 *   - The forked branch becomes the thread's new "latest"; the original branch
 *     is not deleted, and is still resumable by its exact checkpoint_id
 *
 * WHY THIS MATTERS:
 *   3.6 showed updateState() editing the CURRENT state. This is the sharper
 *   claim: LangGraph's history isn't a line you rewrite, it's a tree you add
 *   branches to. That's what makes "let's try a different answer from turn 2"
 *   possible without losing turn 3 of the original conversation — the exact
 *   shape of an eval harness that replays from a fixed point with alternate
 *   inputs, or an operator who reruns a decision from further back.
 *
 * SETUP: same as 05 — docker compose up -d postgres.
 *
 * Run:   npx tsx 02-rag-memory/08-fork-history.ts
 *        Builds the 3-turn history on first run, then forks + resumes.
 *        Safe to run again — it detects the fork already exists and just
 *        re-displays the tree.
 * Reset: npx tsx 02-rag-memory/08-fork-history.ts --reset
 */

import "dotenv/config";
import { StateGraph, MessagesAnnotation, START, END } from "@langchain/langgraph";
import { HumanMessage } from "@langchain/core/messages";
import { llm } from "../lib/llm.js";
import { checkpointer, pool, deleteThreads, closeAll } from "./_pg.js";

const THREAD_ID_FORK = "pg-demo-fork-1";

async function callModel(state: typeof MessagesAnnotation.State) {
  const response = await llm.invoke(state.messages);
  return { messages: [response] };
}

const graph = new StateGraph(MessagesAnnotation)
  .addNode("llm", callModel)
  .addEdge(START, "llm")
  .addEdge("llm", END)
  .compile({ checkpointer });

// =============================================================================
// PART 11 — a real history to fork from, then getStateHistory()
// =============================================================================
// Three turns, so there's an actual branch point in the middle of the
// conversation — not just a root and a tip. Skips straight to listing history
// if a previous run already built it.

async function buildHistory() {
  const config = { configurable: { thread_id: THREAD_ID_FORK } };
  const state = await graph.getState(config);
  const existing = state.values.messages?.length ?? 0;

  if (existing > 0) {
    console.log(`\n=== PART 11: history already exists (${existing} messages) ===`);
    return;
  }

  console.log("\n=== PART 11: writing a 3-turn conversation ===");
  await graph.invoke({ messages: [new HumanMessage("I'm planning a trip to Japan.")] }, config);
  console.log("   turn 1 done");
  await graph.invoke({ messages: [new HumanMessage("What's the best time of year to visit?")] }, config);
  console.log("   turn 2 done");
  await graph.invoke({ messages: [new HumanMessage("Great — recommend a 5-day itinerary for then.")] }, config);
  console.log("   turn 3 done");
}

async function listHistory() {
  console.log("\n=== PART 11: getStateHistory() — the checkpoint chain, newest first ===");
  const config = { configurable: { thread_id: THREAD_ID_FORK } };

  const snapshots = [];
  for await (const snap of graph.getStateHistory(config)) snapshots.push(snap);

  // Identify rows by metadata.step, not a sliced checkpoint_id. checkpoint_id
  // is a UUIDv6 — time-ordered, which means its LEADING characters are the
  // coarsest-grained (slowest-changing) part. Several checkpoints written
  // within the same request (the branch-dispatch sub-step from 05's Part 4)
  // share an 8-char prefix, so truncating it makes distinct rows LOOK like
  // duplicates. `step` reads clearly here — but Part 12 will show it is
  // ONLY unique along one branch: after a fork, the new branch restarts
  // counting from the fork point, so two DIFFERENT checkpoints can share the
  // same step number. checkpoint_id is the only thing that's ever globally
  // unique — step is just a readable stand-in until a fork exists.
  for (const snap of snapshots) {
    const n = snap.values.messages?.length ?? 0;
    const last = n > 0 ? String(snap.values.messages.at(-1)?.content).slice(0, 55) : "—";
    console.log(`   step=${String(snap.metadata?.step).padStart(2)}` +
      `  source=${String(snap.metadata?.source).padEnd(6)}  messages=${n}  last="${last}"`);
  }
  // Newest first, oldest (the root, messages=0) last — by checkpoint_id, i.e.
  // by TIME. Important: this is NOT "the parent chain of the latest checkpoint,
  // walked backwards". PostgresSaver.list() (what getStateHistory() calls)
  // filters by thread_id [+ checkpoint_ns] ONLY and sorts by checkpoint_id —
  // it returns EVERY checkpoint ever written for this thread, from EVERY
  // branch, interleaved by recency. Right now there's only one branch, so
  // that distinction is invisible; Part 12 forks a second branch, and after
  // that this same function returns rows from BOTH, merged by time — which is
  // exactly why Part 12 captures `snapshots` from THIS call, before forking,
  // instead of re-deriving the pre-fork branch from a later call.
  // NOTE: you'll see the same `messages` count on consecutive rows sometimes —
  // that's not a duplicate, it's a checkpoint where a DIFFERENT channel (like
  // the branch-dispatch signal) changed but `messages` didn't.
  return snapshots;
}

// =============================================================================
// PART 12 — fork with updateState(), then resume down the new branch
// =============================================================================
// The fork point: the snapshot with exactly 2 messages — right after turn 1,
// before "best time of year" was ever asked. updateState() against THAT
// checkpoint's config (not the thread's latest) is what makes this a fork
// instead of an edit-in-place.

async function alreadyForked(): Promise<boolean> {
  const { rowCount } = await pool.query(
    `SELECT 1 FROM checkpoints WHERE thread_id = $1 AND metadata->>'source' = 'update' LIMIT 1`,
    [THREAD_ID_FORK],
  );
  return (rowCount ?? 0) > 0;
}

async function forkAndResume(snapshots: Awaited<ReturnType<typeof listHistory>>): Promise<boolean> {
  // Guard against forking twice. Once a fork exists, listHistory() returns
  // BOTH branches merged by time (see its comment above) — searching that
  // merged list for "the" messages===2 checkpoint would pick an arbitrary one
  // and fork AGAIN from an unpredictable point. Fork once; on a later run,
  // just show the tree that already exists.
  if (await alreadyForked()) {
    console.log("\n=== PART 12: already forked in a previous run — skipping ahead to the tree ===");
    return false;
  }

  const forkPoint = snapshots.find((s) => (s.values.messages?.length ?? 0) === 2);
  if (!forkPoint) {
    console.log("\n=== PART 12: fork point not found — was buildHistory() skipped? ===");
    return false;
  }

  console.log("\n=== PART 12: forking from the post-turn-1 checkpoint ===");
  console.log("   forking from step=", forkPoint.metadata?.step,
    " (checkpoint_id", String(forkPoint.config.configurable?.checkpoint_id).slice(0, 8), "...)");

  // No values to change — we're not editing this checkpoint's content, only
  // using its checkpoint_id as the parent for a brand new one. That new
  // checkpoint is what makes this a FORK: same content as forkPoint, but a
  // distinct checkpoint_id, becoming the new tip of a second branch.
  const forkedConfig = await graph.updateState(forkPoint.config, {});
  console.log("   new forked checkpoint_id=",
    String(forkedConfig.configurable?.checkpoint_id).slice(0, 8), "...");

  const result = await graph.invoke(
    { messages: [new HumanMessage("Actually — what about visiting South Korea instead?")] },
    forkedConfig,
  );
  console.log("   forked branch now has", result.messages.length, "messages (expected 4, not 6)");
  console.log("   A:", String(result.messages.at(-1)?.content).slice(0, 150));
  return true;
}

// =============================================================================
// PART 12 (cont.) — prove the ORIGINAL branch is untouched
// =============================================================================
// Forking never deletes anything. The turn-2/turn-3 branch is still on disk,
// still resumable by its exact checkpoint_id — this is the whole reason it's
// called a fork and not an edit.

async function proveOriginalBranchSurvives(snapshots: Awaited<ReturnType<typeof listHistory>>) {
  console.log("\n=== PART 12: the pre-fork branch, still reachable by its own checkpoint_id ===");
  const originalTip = snapshots[0]; // newest-first: index 0 is turn 3, pre-fork
  const original = await graph.getState(originalTip.config);
  console.log("   original tip messages:", original.values.messages?.length ?? 0, "(expected 6)");
  console.log("   last message:", String(original.values.messages?.at(-1)?.content).slice(0, 100));
}

// =============================================================================
// PART 12 (cont.) — read the tree, raw
// =============================================================================
// Same query shape as 05's Part 4, but now parent_checkpoint_id fans out to
// TWO children from one row instead of chaining in a straight line. That
// branch in the printed list is the whole lesson.

async function readForkTree() {
  console.log("\n=== PART 12: checkpoints table — a TREE, not a line ===");
  const { rows } = await pool.query<{
    checkpoint_id: string; parent_checkpoint_id: string | null; source: string; step: string;
  }>(`
    SELECT checkpoint_id, parent_checkpoint_id, metadata->>'source' AS source,
           metadata->>'step' AS step
    FROM checkpoints WHERE thread_id = $1 AND checkpoint_ns = ''
    ORDER BY checkpoint_id`, [THREAD_ID_FORK]);

  // Display by metadata.step (readable), but GROUP by the real
  // parent_checkpoint_id (the ground truth key). step is only unique along a
  // single branch — after a fork, both branches restart counting from the
  // fork point, so two unrelated rows could share a step number. Grouping by
  // the actual UUID avoids being fooled by that in a tree with more than one
  // fork.
  const stepById = new Map(rows.map((r) => [r.checkpoint_id, r.step]));
  const childStepsByParentId = new Map<string, string[]>();
  for (const r of rows) {
    const parentStep = r.parent_checkpoint_id ? (stepById.get(r.parent_checkpoint_id) ?? "?") : "— (root)";
    console.log(`   step=${String(r.step).padStart(2)}  parent_step=${String(parentStep).padStart(9)}  source=${r.source}`);
    if (r.parent_checkpoint_id) {
      const list = childStepsByParentId.get(r.parent_checkpoint_id) ?? [];
      list.push(r.step);
      childStepsByParentId.set(r.parent_checkpoint_id, list);
    }
  }

  const branchPoint = [...childStepsByParentId.entries()].find(([, children]) => children.length > 1);
  console.log(branchPoint
    ? `\n   the checkpoint at step ${stepById.get(branchPoint[0])} has ${branchPoint[1].length}` +
      ` children (both landing at step ${branchPoint[1].join(" and ")}, in DIFFERENT branches)` +
      ` — that's the fork. Nothing before or after it was overwritten.`
    : "\n   (no branch point found — did you run --reset and skip Part 12?)");
}

async function reset() {
  console.log("\n=== --reset: deleting thread", THREAD_ID_FORK, "===");
  await deleteThreads(THREAD_ID_FORK);
  console.log("   gone from all three tables. Next run starts fresh.");
}

// -----------------------------------------------------------------------------
// PRODUCTION NOTES
// -----------------------------------------------------------------------------
// 1. updateState(config, values) creates a NEW checkpoint. If `config` carries
//    a specific checkpoint_id, that checkpoint becomes the new row's PARENT —
//    not whatever the thread's latest happened to be. That single detail is
//    the entire difference between "edit the conversation" (3.6, config = the
//    latest state) and "fork the conversation" (this file, config = an OLD
//    state).
// 2. THE FORK BECOMES THE NEW HEAD. Because checkpoint_id is time-ordered
//    (UUIDv6), the freshly created row is now the most recent one for this
//    thread — so a later invoke() with no checkpoint_id in its config
//    continues down the NEW branch by default, not the old one.
// 3. NOTHING IS DELETED. The pre-fork branch's rows are untouched in all three
//    tables. Reaching it again is just a matter of holding onto (or looking
//    up) its checkpoint_id — this is what makes "replay this eval case from
//    turn 2 with a different tool result" a query, not a data-recovery
//    exercise.
// 4. GROWTH COMPOUNDS. Every fork keeps its entire ancestor chain of blobs
//    alive (they're referenced, not copied — Part 4's dedup-by-version still
//    applies) but forking liberally in production (e.g. one fork per eval
//    variant) still means more ROWS, even if not more raw bytes per unchanged
//    channel. Your retention policy needs an opinion on abandoned branches,
//    not just abandoned threads.
//
// -----------------------------------------------------------------------------
// 🎯 THE THREE INTERVIEW QUESTIONS
// -----------------------------------------------------------------------------
// 1. What problem does forking history solve that simply calling updateState()
//    on the latest checkpoint doesn't?
// 2. Underneath: what single field in the config passed to updateState()
//    decides whether you get a fork or a linear edit?
// 3. What breaks if your app always resumes threads by thread_id alone and
//    never persists which checkpoint_id a given fork lives at?

async function main() {
  try {
    await checkpointer.setup();

    if (process.argv.includes("--reset")) {
      await reset();
      return;
    }

    await buildHistory();
    const snapshots = await listHistory();
    const justForked = await forkAndResume(snapshots);
    // `snapshots` here is the PRE-fork, single-branch list — safe to use for
    // "the original tip" only on the run where the fork just happened. On a
    // later run, listHistory() above already returns a merged multi-branch
    // list, so snapshots[0] is no longer reliably "the original tip".
    if (justForked) await proveOriginalBranchSurvives(snapshots);
    await readForkTree();

    console.log("\n=============================================================");
    console.log("RECAP");
    console.log("  getStateHistory() = the parent_checkpoint_id chain, walked for you");
    console.log("  updateState(oldConfig, values) -> new checkpoint, parent = oldConfig's id");
    console.log("  that new checkpoint is now the thread's latest -> future invokes follow it");
    console.log("  the pre-fork branch is NOT deleted — resumable forever by its checkpoint_id");
    console.log("  one ancestor, two children  =  a tree, not a line");
    console.log("  NEXT (step 5)     : two threads in parallel, thread_id isolation");
    console.log("=============================================================");
  } finally {
    await closeAll();
  }
}

main().catch(console.error);
