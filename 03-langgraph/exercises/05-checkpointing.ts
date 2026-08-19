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


// TODO: Step 1 — llm node + graph compiled with a MemorySaver

async function callModel (state: typeof MessagesAnnotation.State){
  const response = await llm.invoke([ new SystemMessage("Answer in at most one senteces.")  , ...state.messages]);
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
console.log(question3.messages.length);


// TODO: Step 2 — same question on a different thread_id

// TODO: Step 3 — getState, getStateHistory, and a time-travel fork

async function main() {
  // TODO: run your steps
}

main().catch(console.error);
