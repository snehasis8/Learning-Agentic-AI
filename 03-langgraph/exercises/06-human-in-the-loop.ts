/**
 * Exercise — Module 3.6: Human-in-the-Loop  (short — ~20 min)
 *
 * Goal: gate a real agent's tool calls behind human approval.
 *
 * STEP 1 — An approval gate
 *   Build a graph with state { action: string, approved: boolean, result: string }.
 *   Node `propose` sets action = "delete all logs".
 *   Node `confirm` calls interrupt({ action: state.action }) and stores the answer.
 *   Node `execute` runs only if approved, else sets result = "cancelled".
 *   Compile WITH a MemorySaver, invoke, and print the __interrupt__ payload.
 *   Then resume with Command({ resume: "approve" }) and print the result.
 *
 * STEP 2 — Reject, on a different thread
 *   Same graph, new thread_id, resume with "reject". Confirm nothing executed.
 *
 * STEP 3 — Gate a real agent's tools
 *   Take your 3.4 tool-calling agent and recompile it with:
 *     .compile({ checkpointer, interruptBefore: ["toolNode"] })
 *   Invoke it with a question that needs a tool. Then:
 *     a) print getState(config).next            -> should show the tools node
 *     b) print the pending tool call from the last message's tool_calls
 *     c) resume with invoke(null, config) and print the final answer
 *   Answer in a comment: why is `null` the right input to resume here,
 *   rather than Command({ resume })?
 *
 * BONUS — Human edits the tool arguments
 *   Before resuming in Step 3, use updateState() to change the tool call's
 *   arguments (e.g. lower a refund amount). Confirm the tool ran with YOUR value.
 *   Answer in a comment: which of the three HITL patterns is this?
 *
 * Run: npx tsx 03-langgraph/exercises/06-human-in-the-loop.ts
 */

import "dotenv/config";
import {
  StateGraph, Annotation, MemorySaver, START, END, interrupt, Command,
} from "@langchain/langgraph";
import { MessagesAnnotation } from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { tool } from "@langchain/core/tools";
import { AIMessage, HumanMessage } from "@langchain/core/messages";
import { llm } from "../../lib/llm.js";
import * as z from "zod";

// TODO: Step 1 — state, propose / confirm / execute nodes, compile with checkpointer

const myState = Annotation.Root({
  action:Annotation<string>,
  approve:Annotation<boolean>,
  result:Annotation<string>,
  trail:Annotation<string[]>({
    reducer:(cur , next)=> cur.concat(next),
    default: ()=> []
  })
})

type stateType = typeof myState.State

const propose = (state:stateType)=>{
  return { action : state.action, trail : ["proposed"]}
}
const confirm = (state:stateType)=>{
  const isConfirm = interrupt({
    action:state.action,
    answer:state.action
  })
  console.log("printing is confirm :" ,isConfirm);
  
  return {trail : [`confirm , user approval input : ${isConfirm}`] , approve:isConfirm==="approved"}
}
const execute = (state:stateType)=>{
   console.log("approve status from state" , state.approve)
   let result = state.approve ? "approved from user " : "approval rejected"
  return {trail : ["execute"] , result}
}

// adding the checkpointer 
//you can think this of a in memory storage , in real application we are goint to use postgres or any other database
const myCheckpointer = new MemorySaver();


const graph = new StateGraph(myState)
.addNode("propose",propose)
.addNode("confirm",confirm)
.addNode("execute",execute)
.addEdge(START , "propose")
.addEdge("propose","confirm")
.addEdge("confirm", "execute")
.addEdge("execute", END)
.compile({checkpointer: myCheckpointer})

// ok now the time to invoke the graph 
// firt create a thread_id so that we can understand this is for which user

const userConfig = {configurable : {thread_id:"user_john"}}

//now invoking the graph

const result =  await graph.invoke({action:"delete all logs"} , userConfig);
const resultWithApproval = await graph.invoke(new Command({resume : "approved"}) , userConfig) 
console.log('printing result');
console.log(result);
console.log(resultWithApproval);


// TODO: Step 2 — the reject path on a new thread_id
const user2config = {configurable : {thread_id:"user2"}}
const resultForUser2 =  await graph.invoke({action:"delete all logs"} , user2config);
const resultWithRejection = await graph.invoke(new Command({resume : "Not approved"}) , user2config)
console.log(resultWithRejection);
// ===========================================================================
// Step 3 — interruptBefore on your 3.4 agent's tool node
// ===========================================================================
// Everything from here to `agentGraph` is COPIED UNCHANGED from your 3.4
// exercise. Do not spend time on it — the only thing that differs is the
// .compile({ ... }) call, marked below.

const searchOrder = tool(
  async ({ orderId }) => `Order ${orderId}: SHIPPED, delivered 2026-08-10.`,
  {
    name: "searchOrder",
    description: "Look up an order's status by its id.",
    schema: z.object({ orderId: z.string() }),
  },
);

const refundOrder = tool(
  async ({ orderId, amountCents }) =>
    `Refund of ${amountCents}c issued for order ${orderId}.`,
  {
    name: "refundOrder",
    description: "Refund an order by id for a given amount in cents.",
    schema: z.object({
      orderId: z.string(),
      amountCents: z.number().describe("Amount to refund, in cents"),
    }),
  },
);

const agentTools = [searchOrder, refundOrder];
const agentToolNode = new ToolNode(agentTools);
const agentModel = llm.bindTools(agentTools);

async function agentCallModel(state: typeof MessagesAnnotation.State) {
  const response = await agentModel.invoke(state.messages);
  return { messages: [response] };
}

function agentShouldContinue(state: typeof MessagesAnnotation.State): string {
  const last = state.messages[state.messages.length - 1] as AIMessage;
  return last.tool_calls?.length ? "tools" : "done";
}

const agentGraph = new StateGraph(MessagesAnnotation)
  .addNode("callModel", agentCallModel)
  .addNode("toolNode", agentToolNode)
  .addEdge(START, "callModel")
  .addConditionalEdges("callModel", agentShouldContinue, {
    tools: "toolNode",
    done: END,
  })
  .addEdge("toolNode", "callModel")
  // vvv  THE ONLY DIFFERENCE FROM 3.4  vvv
  .compile({
    checkpointer: new MemorySaver(),
    interruptBefore: ["toolNode"], // gate EVERY tool execution
  });

// ---------------------------------------------------------------------------
// YOUR PART — the human-in-the-loop bit
// ---------------------------------------------------------------------------

const agentConfig = { configurable: { thread_id: "gate-1" } };

// TODO 3a — invoke the agent with a question that needs a tool, e.g.
//           "What's the status of order A123, and refund it 500 cents if late."
//           Then print agentGraph.getState(agentConfig).next
//           -> it should show the node it is waiting on.

const agentCallResult = await agentGraph.invoke(
  { messages: [new HumanMessage("What's the status of order A123, and refund me 500.00 as it's late.")] },
  agentConfig,
);
console.log( (await agentGraph.getState(agentConfig)).next)

// console.log(agentCallResult);
// TODO 3b — print the PENDING tool call the agent wants to make.
//           Hint: it is on the last message.
//              const snap = await agentGraph.getState(agentConfig);
//              const last = snap.values.messages.at(-1) as AIMessage;
//              last.tool_calls   <- name + args + id

const snapShot = await agentGraph.getState(agentConfig);
console.log(snapShot.values.messages.at(-1).tool_calls)

// TODO 3c — resume with:  await agentGraph.invoke(null, agentConfig)
//           and print the final answer.
//           Answer in a comment: why is `null` the right input here rather
//           than Command({ resume })?
// ANSWER: it is not about WHERE it resumes - both continue from the same point.
// The difference is whether something is WAITING FOR A VALUE:
//   invoke(null, config)   -> the graph is paused BETWEEN nodes (interruptBefore).
//                             Nothing is suspended waiting for input: "just carry on".
//   Command({ resume: v }) -> an interrupt() call INSIDE a node is suspended and
//                             needs a return value; v becomes what interrupt() returns.
// Step 1 needed Command because `const isConfirm = interrupt(...)` was waiting.
// Here interruptBefore stopped the graph before toolNode even started, so there is
// no expression to feed - hence null.

const resumeAgent = await agentGraph.invoke(null , agentConfig);
console.log('Final result ' , resumeAgent)
// ===========================================================================
// BONUS — a human EDITS the tool arguments before the tool runs
// ===========================================================================
// Note the fresh thread_id: "gate-1" already resumed and finished, so there is
// nothing left there to edit. The edit has to happen while a run is PAUSED.
//
//   invoke  ->  [PAUSED]  ->  updateState()  ->  invoke(null)  ->  tool runs
//                                 ^ the bonus

const bonusConfig = { configurable: { thread_id: "gate-bonus" } };

await agentGraph.invoke(
  { messages: [new HumanMessage("What's the status of order A123, and refund me 500.00 as it's late.")] },
  bonusConfig,
);

const pausedSnap = await agentGraph.getState(bonusConfig);
const pendingMsg = pausedSnap.values.messages.at(-1) as AIMessage;

console.log("\n=== BONUS: what the agent WANTED to do ===");
console.log("  messages in state:", pausedSnap.values.messages.length);
console.log("  pending:", JSON.stringify(pendingMsg.tool_calls?.map((t) => ({ name: t.name, args: t.args }))));

// Build a REPLACEMENT message. The SAME id is the whole trick: addMessages
// replaces a message when it sees an id it already has, instead of appending.
const correctedMsg = new AIMessage({
  id: pendingMsg.id,                    // <- same id => REPLACE, not append
  content: pendingMsg.content,
  tool_calls: pendingMsg.tool_calls!.map((tc) =>
    tc.name === "refundOrder"
      ? { ...tc, args: { ...tc.args, amountCents: 500 } }   // 50000 -> 500
      : tc,
  ),
});

await agentGraph.updateState(bonusConfig, { messages: [correctedMsg] });

const editedSnap = await agentGraph.getState(bonusConfig);
const editedMsg = editedSnap.values.messages.at(-1) as AIMessage;
console.log("\n=== after the human edit ===");
console.log("  messages in state:", editedSnap.values.messages.length, "(same count => replaced, not appended)");
console.log("  corrected:", JSON.stringify(editedMsg.tool_calls?.map((t) => ({ name: t.name, args: t.args }))));
console.log("  still waiting on:", editedSnap.next);

// Now let it run - with OUR number, not the model's.
const bonusResult = await agentGraph.invoke(null, bonusConfig);

console.log("\n=== BONUS: what actually executed ===");
for (const m of bonusResult.messages) {
  if (m.getType() === "tool") console.log("  [tool]", String(m.content));
}
console.log("  final:", String(bonusResult.messages.at(-1)?.content).slice(0, 120));

// ANSWER: which of the three HITL patterns is this?
//   1. approve / reject   -> interrupt() returning a decision        (Steps 1 & 2)
//   2. EDIT               -> updateState() before resuming           <-- THIS ONE
//   3. review a tool call -> interruptBefore gating every execution  (Step 3)
// This is pattern 2, layered on top of pattern 3: the gate let us SEE the
// proposed call, and updateState let us CORRECT it. In a real review UI this is
// the difference between "reject and make the user start over" and "fix the
// number and carry on" - which is what reviewers actually want.
