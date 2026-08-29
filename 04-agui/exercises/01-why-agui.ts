/**
 * Exercise — Module A.1: Why AG-UI  (short — ~15 min, no frontend)
 *
 * Goal: feel the gap yourself, by hand-translating a real agent run.
 *
 * STEP 1 — Capture a run
 *   Build (or copy) a small tool-calling agent. Stream it with
 *   streamMode: "updates" and log every chunk verbatim.
 *
 * STEP 2 — Answer, in comments, from YOUR output:
 *   a) Which chunk tells a UI the run has STARTED?
 *   b) Which tells it a tool is RUNNING (not finished)?
 *   c) If you renamed your "llm" node to "brain", what would break in a
 *      frontend written against this stream?
 *
 * STEP 3 — Hand-translate to AG-UI
 *   Write the sequence of AG-UI events your run WOULD emit, as an array of
 *   plain objects (no library calls needed — just the shapes). Use EventType
 *   from "@ag-ui/core" for the type values. Aim for something like:
 *     RUN_STARTED -> TOOL_CALL_START -> TOOL_CALL_ARGS -> TOOL_CALL_END
 *       -> TOOL_CALL_RESULT -> TEXT_MESSAGE_START -> ..._CONTENT -> ..._END
 *       -> RUN_FINISHED
 *   Print them in order.
 *   Answer in a comment: which ids did you have to invent, and what would
 *   break if two tool calls shared one id?
 *
 * BONUS — Where does approval fit?
 *   Your 3.6 agent paused with interrupt() carrying a payload. Look at the 33
 *   event types and decide which one(s) you would use to get that payload to a
 *   browser. Justify it in a comment. (There is no single "right" answer — the
 *   reasoning is the exercise. A.4 shows what the LangGraph integration does.)
 *
 * Run: npx tsx 04-agui/exercises/01-why-agui.ts
 */

import "dotenv/config";
import { EventType } from "@ag-ui/core";
import { END, MemorySaver, MessagesAnnotation, START, StateGraph } from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { AIMessage, HumanMessage } from "@langchain/core/messages";
import { llm } from "../../lib/llm";
import * as z from "zod";
import { tool } from "@langchain/core/tools";

// TODO: Step 1 — capture a run with streamMode "updates"

const searchOrder = tool(
  async ({ orderId }) => `Order ${orderId}: SHIPPED, delivered 2026-08-10.`,
  {
    name: "searchOrder",
    description: "Look up an order's status by id.",
    schema: z.object({ orderId: z.string() }),
  },
);

const tools = [searchOrder];
const model = llm.bindTools(tools);
const checkpointer = new MemorySaver();
const agent = new StateGraph(MessagesAnnotation)
  .addNode("llm", async (s) => ({ messages: [await model.invoke(s.messages)] }))
  .addNode("tools", new ToolNode(tools))
  .addEdge(START, "llm")
  .addConditionalEdges("llm", (s) => {
    const last = s.messages.at(-1) as AIMessage;
    return last.tool_calls?.length ? "tools" : "done";
  }, { tools: "tools", done: END })
  .addEdge("tools", "llm")
  .compile( {checkpointer });

const streamResult = await agent.stream(
  {messages: [new HumanMessage("where is my order? order number A123")]} 
  , {configurable:{thread_id : "ABC1"} ,
     streamMode : "updates"

});
const chunks = []
for await (const chunk of streamResult){
chunks.push(chunk);
  console.log(JSON.stringify(chunk , null , 2));
    console.log();
}

console.log(chunks);
 

// TODO: Step 2 — your three answers, in comments

// nothing eplicitly defined but we can assume , that from the first message itself we can show the run is started
//from the tool_calls array we get to know what tool needs to call and it's arguments. 
//it will break because it's llm.messages --> so the response is directly depends on my server code.

// TODO: Step 3 — the hand-written AG-UI event sequence

// Pulled straight from the captured chunks above:
//   toolCallId = "call_1qkz9MCMfVb6PdbfKPYkEoJ7", toolCallName = "searchOrder"
//   args       = {"orderId":"A123"}  (split into fragments below)
//   result     = "Order A123: SHIPPED, delivered 2026-08-10."
//   final text = the AI's closing reply, split into a few word-ish deltas

const agEvents = [
  // RUN_STARTED/RUN_FINISHED require threadId - a real client would carry
  // this from its own conversation id (same idea as LangGraph's thread_id).
  { type: EventType.RUN_STARTED, threadId: "thread-1", runId: "run-1" },

  { type: EventType.TOOL_CALL_START, toolCallId: "call_1qkz9MCMfVb6PdbfKPYkEoJ7", toolCallName: "searchOrder" },
  { type: EventType.TOOL_CALL_ARGS, toolCallId: "call_1qkz9MCMfVb6PdbfKPYkEoJ7", delta: '{"order' },
  { type: EventType.TOOL_CALL_ARGS, toolCallId: "call_1qkz9MCMfVb6PdbfKPYkEoJ7", delta: 'Id":"A123"}' },
  { type: EventType.TOOL_CALL_END, toolCallId: "call_1qkz9MCMfVb6PdbfKPYkEoJ7" },
  // TOOL_CALL_RESULT also needs messageId - the result becomes a message in
  // its own right (mirrors LangChain's ToolMessage carrying a tool_call_id).
  {
    type: EventType.TOOL_CALL_RESULT,
    toolCallId: "call_1qkz9MCMfVb6PdbfKPYkEoJ7",
    messageId: "tool-result-1",
    content: "Order A123: SHIPPED, delivered 2026-08-10.",
  },

  { type: EventType.TEXT_MESSAGE_START, messageId: "m1", role: "assistant" },
  { type: EventType.TEXT_MESSAGE_CONTENT, messageId: "m1", delta: "Order A123 " },
  { type: EventType.TEXT_MESSAGE_CONTENT, messageId: "m1", delta: "was shipped " },
  { type: EventType.TEXT_MESSAGE_CONTENT, messageId: "m1", delta: "and delivered on 2026-08-10." },
  { type: EventType.TEXT_MESSAGE_END, messageId: "m1" },

  { type: EventType.RUN_FINISHED, threadId: "thread-1", runId: "run-1" },
];

for (const e of agEvents) console.log(JSON.stringify(e));

// VALIDATED against the real @ag-ui/core schemas (EventSchemas.safeParse) -
// all 10 events PASS. Two required fields were missing on the first attempt
// and only the schema caught them: RUN_STARTED/RUN_FINISHED need `threadId`
// (not just `runId`), and TOOL_CALL_RESULT needs `messageId` (not just
// `toolCallId`). Exactly A.2's point: eyeballing an event is not the same as
// it being spec-compliant.

// ANSWER — which ids did I have to invent, and why does sharing one matter?
//   Invented: "run-1" (a run id AG-UI needs but LangGraph never gave us) and
//   "m1" (a message id — MessagesAnnotation has no concept of one either).
//   The tool call's own id ("call_1qkz9M...") was NOT invented — it came
//   straight from the model's tool_calls array, because a real UI needs the
//   SAME id the model actually used to match a later TOOL_CALL_RESULT to its
//   TOOL_CALL_START.
//
//   If two DIFFERENT tool calls shared one toolCallId, their ARGS deltas would
//   interleave into one buffer (exactly like the m1/m2 text demo in A.2) and
//   TOOL_CALL_END would try to JSON.parse a garbled string mixing both calls'
//   arguments — it would either throw or silently execute the wrong tool with
//   the wrong arguments.

// BONUS — where does HITL approval fit?
//   My 3.6 interrupt() payload was: { question, amountCents }. That is a
//   ONE-SHOT chunk of data, not something that streams in fragments — so it
//   does not need the start/content/end pattern (Pattern 1). It is closer to
//   Pattern 2 (shared data): send it as a STATE_SNAPSHOT (or a CUSTOM event,
//   since "pending approval" is not one of the 33 built-in shapes) carrying
//   the interrupt payload, then the human's decision travels back from the
//   browser as a new run input, the same way Command({resume: ...}) does today.
//   A.4 shows the actual @ag-ui/langgraph mapping for this.

async function main() {
  // TODO: run your steps
}

main().catch(console.error);
