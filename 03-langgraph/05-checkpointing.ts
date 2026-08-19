/**
 * Module 3.5 — Checkpointing (durable state, memory, time travel)
 *
 * WHAT YOU'LL LEARN:
 *   - Why a graph forgets everything between invocations
 *   - MemorySaver + thread_id: turning a graph into a stateful conversation
 *   - Inspecting saved state with getState() and getStateHistory()
 *   - Time travel: replaying from an earlier checkpoint
 *   - Which checkpointer to actually ship
 *
 * WHY THIS MATTERS:
 *   Everything so far was one-shot: invoke, get a result, state is gone. Real
 *   agents run for minutes, survive restarts, and remember previous turns.
 *   Checkpointing is also the prerequisite for human-in-the-loop (3.6) — you
 *   cannot pause for approval unless the run can be saved and resumed.
 *
 * Run: npx tsx 03-langgraph/05-checkpointing.ts
 */

import "dotenv/config";
import {
  StateGraph, MessagesAnnotation, MemorySaver, START, END,
} from "@langchain/langgraph";
import { HumanMessage, AIMessage } from "@langchain/core/messages";
import { llm } from "../lib/llm.js";

// =============================================================================
// PART 1 — Without a checkpointer, a graph has amnesia
// =============================================================================
// Every .invoke() starts from a blank state. The graph has no idea a previous
// call ever happened. That is fine for a pipeline, useless for a chatbot.

async function callModel(state: typeof MessagesAnnotation.State) {
  const response = await llm.invoke(state.messages);
  return { messages: [response] };
}

const stateless = new StateGraph(MessagesAnnotation)
  .addNode("llm", callModel)
  .addEdge(START, "llm")
  .addEdge("llm", END)
  .compile(); // <- no checkpointer

async function noMemory() {
  console.log("\n=== PART 1: No checkpointer = no memory ===");

  await stateless.invoke({ messages: [new HumanMessage("My name is Snehasis.")] });
  const second = await stateless.invoke({
    messages: [new HumanMessage("What is my name?")],
  });

  console.log("   Q: What is my name?");
  console.log("   A:", String(second.messages.at(-1)?.content).slice(0, 100));
  // It cannot know. The second invoke started from an empty message list.
}

// =============================================================================
// PART 2 — MemorySaver + thread_id
// =============================================================================
// Two changes turn that into a real conversation:
//   1. .compile({ checkpointer })  -> state is SAVED after every super-step
//   2. pass a thread_id            -> which conversation to load/save
//
// A thread_id is just a string you choose: a chat id, a user id, a ticket
// number. Same id = same conversation. Different id = a fresh one.

const checkpointer = new MemorySaver();

const stateful = new StateGraph(MessagesAnnotation)
  .addNode("llm", callModel)
  .addEdge(START, "llm")
  .addEdge("llm", END)
  .compile({ checkpointer });

async function withMemory() {
  console.log("\n=== PART 2: Same graph, now with memory ===");

  const config = { configurable: { thread_id: "user-42" } };

  await stateful.invoke({ messages: [new HumanMessage("My name is Snehasis.")] }, config);
  const second = await stateful.invoke(
    { messages: [new HumanMessage("What is my name?")] },
    config,
  );

  console.log("   Q: What is my name?");
  console.log("   A:", String(second.messages.at(-1)?.content).slice(0, 100));
  console.log("   history length:", second.messages.length, "(both turns retained)");
  console.log(second);// full history you can see here

  // A DIFFERENT thread is a separate conversation:
  const other = await stateful.invoke(
    { messages: [new HumanMessage("What is my name?")] },
    { configurable: { thread_id: "someone-else" } },
  );
  console.log("   other thread A:", String(other.messages.at(-1)?.content).slice(0, 60));

  // NOTE what you pass on the second call: only the NEW message. You never
  // resend history — the checkpointer loads it and addMessages appends.
}

// =============================================================================
// PART 3 — Inspecting what was saved
// =============================================================================
// getState()        -> the current snapshot for a thread
// getStateHistory() -> every checkpoint, newest first
//
// Each snapshot carries: values (your state), next (which nodes would run
// next), and a config containing the checkpoint_id.

async function inspectState() {
  console.log("\n=== PART 3: Inspecting saved checkpoints ===");
  const config = { configurable: { thread_id: "user-42" } };

  const snapshot = await stateful.getState(config);
  console.log("   messages in state:", snapshot.values.messages.length);
  console.log("   next nodes       :", snapshot.next, "  <- empty = run finished");

  let count = 0;
  for await (const s of stateful.getStateHistory(config)) count++;
  console.log("   checkpoints saved:", count);
  // One checkpoint per super-step, per invoke. This is the audit trail of the
  // run — and in 3.6 it is what lets you pause, inspect, edit, and resume.
}

// =============================================================================
// PART 4 — Time travel: resuming from an earlier checkpoint
// =============================================================================
// Because every step is saved, you can rewind. Grab an old checkpoint's config
// and invoke from there — the run continues from that point, creating a
// BRANCH rather than overwriting the original timeline.

async function timeTravel() {
  console.log("\n=== PART 4: Time travel ===");
  const config = { configurable: { thread_id: "user-42" } };

  // Collect history (newest first) and pick an earlier checkpoint.
  const history = [];
  for await (const s of stateful.getStateHistory(config)) history.push(s);
  console.log("   total checkpoints:", history.length);

  const earlier = history[history.length - 1]; // the oldest one
  console.log("   rewinding to checkpoint with", earlier.values.messages?.length ?? 0, "message(s)");

  // Resuming from an old checkpoint forks the conversation.
  const forked = await stateful.invoke(
    { messages: [new HumanMessage("Actually, call me Sneh.")] },
    earlier.config,
  );
  console.log("   forked reply:", String(forked.messages.at(-1)?.content).slice(0, 80));
  console.log("   forked history length:", forked.messages.length);
  // The original thread state is untouched — you branched, not overwrote.
}

// -----------------------------------------------------------------------------
// PRODUCTION NOTES
// -----------------------------------------------------------------------------
// 1. MemorySaver is IN-MEMORY. It dies with the process. It is for development
//    and tests ONLY. In production use a durable checkpointer — Postgres
//    (@langchain/langgraph-checkpoint-postgres) or SQLite. Same interface, so
//    it is a one-line swap.
// 2. THREAD_ID DESIGN matters: it is your conversation's primary key. Use
//    something stable and namespaced (`org:123:ticket:456`), never an index.
// 3. STATE GROWS FOREVER. Every turn appends messages, and every checkpoint is
//    stored. Trim history (RemoveMessage, 3.2) and set a retention policy, or
//    both your token bill and your database will grow without limit.
// 4. Checkpoints may hold PII. Encrypt at rest, and know your GDPR deletion
//    story — "delete my data" must reach the checkpoint table too.
// 5. Checkpointing is the PREREQUISITE for human-in-the-loop (3.6): pausing for
//    approval means saving state and resuming later, possibly on another machine.

async function main() {
  // await noMemory();
   await withMemory();
   await inspectState();
   await timeTravel();

  // console.log("\n=============================================================");
  // console.log("RECAP");
  // console.log("  no checkpointer  -> every invoke starts blank");
  // console.log("  .compile({ checkpointer }) + thread_id -> a conversation");
  // console.log("  send only the NEW message; history is loaded for you");
  // console.log("  getState / getStateHistory -> inspect + audit the run");
  // console.log("  resume from an old checkpoint -> branch the timeline");
  // console.log("  MemorySaver is dev-only; ship Postgres");
  // console.log("=============================================================");
}

main().catch(console.error);
