/**
 * Exercise — Module 3.5: Checkpointing  (short — ~20 min)
 *
 * Goal: make an agent remember, then prove the boundaries of that memory.
 *
 * STEP 1 — A chatbot with memory
 *   Build a MessagesAnnotation graph with one `llm` node.
 *   Compile it WITH a MemorySaver.
 *   Have a 3-turn conversation on thread_id "alice":
 *     1. "I'm planning a trip to Lisbon."
 *     2. "What should I pack?"          <- must use Lisbon without you repeating it
 *     3. "Remind me where I'm going?"   <- must answer Lisbon
 *   Print the final message count.
 *   ⚠️ Remember: send ONLY the new message each turn, never the history.
 *
 * STEP 2 — Prove thread isolation
 *   Ask "Where am I going?" on thread_id "bob".
 *   Answer in a comment: what did it say, and why?
 *
 * STEP 3 — Inspect and time travel
 *   a) Print getState("alice").values.messages.length and .next
 *   b) Count the checkpoints via getStateHistory("alice")
 *   c) Rewind: take an EARLY checkpoint's config, invoke with
 *      "Actually, make it Porto." and print the reply.
 *      Answer in a comment: is the original "alice" timeline changed? Why not?
 *
 * BONUS — Trim the history
 *   Add a node that keeps only the last 4 messages using RemoveMessage (3.2).
 *   Answer in a comment: why does this matter for cost, and what's the risk?
 *
 * Run: npx tsx 03-langgraph/exercises/05-checkpointing.ts
 */

import "dotenv/config";
import {
  StateGraph, MessagesAnnotation, MemorySaver, START, END,
} from "@langchain/langgraph";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { llm } from "../../lib/llm.js";
import { th } from "zod/v4/locales";


// TODO: Step 1 — llm node + graph compiled with a MemorySaver

async function callModel (state: typeof MessagesAnnotation.State){
  const response = await llm.invoke([ new SystemMessage("Answer in at most one Sentence.Max 20 words")  , ...state.messages]);
  return {messages : [response]}
}

const config = {configurable : {thread_id :"alice"} }
const checkpointer = new MemorySaver();
const withMemoryGraph = new StateGraph(MessagesAnnotation)
.addNode("llm" , callModel)
.addEdge(START, "llm")
.addEdge("llm" , END)
.compile({checkpointer})

const response = await withMemoryGraph.invoke({messages: [new HumanMessage("I'm planning a trip to Lisbon.")]} , config )
// console.log(response?.messages);
const question2 = await withMemoryGraph.invoke({messages: [new HumanMessage("What should I pack ? ")]} , config )
// console.log(question2?.messages);
const question3 = await withMemoryGraph.invoke({messages: [new HumanMessage("remind me where am I going ?  ")]} , config )
const thread_id_Bob_question = await withMemoryGraph.invoke({messages: [new HumanMessage("remind me where am I going ?  ")]} , {configurable: {thread_id :"bob"}} )

//It has no context it's new thread_id just like a new chat . no context then how can It answer ? 




question3.messages.forEach(element => {
  console.log("------------------------------------")
  console.log(element.getType(), ":", element.content)
  console.log("------------------------------------")
});



// TODO: Step 2 — same question on a different thread_id
console.log("------------------------------------BOB's Thread------------------------------------")
thread_id_Bob_question.messages.forEach(element => {
  console.log("------------------------------------")
  console.log(element.getType(), ":", element.content)
  console.log("------------------------------------")
});
// TODO: Step 3 — getState, getStateHistory, and a time-travel fork
const getStateValue = await withMemoryGraph.getState(config);
console.log("<------------State value printing for Alice-------------->")
console.log(getStateValue.values?.messages.length);
console.log(getStateValue.values?.messages.next);
console.log("<------------History -------------->")
const getHistory = await withMemoryGraph.getStateHistory(config);
// it's returns a generator
// to fetch the value we need to use async + for of
// function f() {}           // ordinary
// function* g() {}          // pausable          → for...of
// async function h() {}     // awaits            → await h()
// async function* i() {}    // pausable + awaits → for await...of
 let count = 0
 for await (let i of getHistory ){
  console.log(i);
  count++
 }
 console.log("Loop iterated number" , count)

 console.log("========Part C=========")
 const historyArray = []
//   for await (let i of getHistory ){
//   historyArray.push(i);
//  }.    ---> this will not work , becuase generator are one time used it's never store the value
//  console.log(historyArray)

for await (const s of withMemoryGraph.getStateHistory(config)) {
  historyArray.push(s);
}

// ---------------------------------------------------------------------------
// YOUR VERSION (commented out) — this was ALMOST right.
// ---------------------------------------------------------------------------
// let checkPointer_id = historyArray[1].config.configurable?.checkpoint_id;
// const result = await withMemoryGraph.invoke(
//   { messages: [new HumanMessage("what is the flight time from kolkata ? ")] },
//   { configurable: { thread_id: "alice", checkpoint_id: checkPointer_id } },
// );
//
// The config shape above is CORRECT. The problem is WHICH checkpoint you picked:
// historyArray is newest-first, so index [1] is the second-newest — a checkpoint
// from the MIDDLE of the last turn (its `next` is ["llm"], meaning the node had
// not run yet). Resuming from there just finishes the turn you were already in;
// it does not look like time travel at all.

// ---------------------------------------------------------------------------
// FIXED — pick a MEANINGFUL checkpoint, then resume from it
// ---------------------------------------------------------------------------

// Print the map first so you can SEE what you are choosing from.
// Reversed => oldest first, which is easier to reason about.
console.log("\n--- checkpoint map (oldest -> newest) ---");
[...historyArray].reverse().forEach((s, i) => {
  console.log(
    `  ${String(i).padStart(2)}  msgs=${s.values.messages?.length ?? 0}` +
    `  next=${JSON.stringify(s.next)}`,
  );
});

// Select by MEANING, not by index:
//   messages.length === 2  -> just after turn 1 (your question + the AI reply)
//   next.length === 0      -> that turn had FINISHED (nothing left to run)
const earlyCheckpoint = historyArray.find(
  (s) => s.values.messages?.length === 2 && s.next.length === 0,
);

console.log("\n--- rewinding to ---");
earlyCheckpoint.values.messages.forEach((m: any) =>
  console.log(`  ${m.getType()}: ${String(m.content).slice(0, 60)}`),
);

// Resume from THAT point. Two equivalent ways:
//   A) pass the snapshot's config whole  -> earlyCheckpoint.config
//   B) build it yourself                 -> { configurable: { thread_id, checkpoint_id } }
// A is preferred: it also carries checkpoint_ns, which matters once you use subgraphs.
const forked = await withMemoryGraph.invoke(
  { messages: [new HumanMessage("What is the flight time from Kolkata?")] },
  earlyCheckpoint.config,
);

console.log("\n--- FORKED timeline ---");
forked.messages.forEach((m: any) =>
  console.log(`  ${m.getType()}: ${String(m.content).slice(0, 80)}`),
);
// Notice: the "What should I pack?" turn is ABSENT from this branch. You rewound
// past it and took a different path.

// ANSWER (Step 3c) — is the original timeline changed?
// The old checkpoints still EXIST (they are still in getStateHistory), so nothing
// was deleted. But the thread's HEAD now points at this new branch: a later
// getState({thread_id:"alice"}) returns the forked state, not the original.
// Exactly like git — `checkout` an old commit and commit again: nothing is lost,
// but "where you are now" has moved.

async function main() {
  // TODO: call your steps here if you prefer to organise them
}
main().catch(console.error);
