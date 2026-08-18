/**
 * Exercise — Module 3.4: Tool-Calling Agent  (short — ~20 min)
 *
 * Goal: build the agent loop yourself, then break it in the two ways that
 * actually happen in production.
 *
 * STEP 1 — Two tools
 *   a) `search_orders`  — takes { orderId: string }, returns a fake order status.
 *      Make it return an ERROR STRING (not throw) for unknown ids.
 *   b) `refund_order`   — takes { orderId, amountCents }, returns a confirmation.
 *
 * STEP 2 — Build the loop
 *   Use MessagesAnnotation. Two nodes: "llm" and "tools" (ToolNode).
 *   Router: read the LAST message, return "tools" if tool_calls exist, else "done".
 *   Wire: START -> llm, conditional from llm, and tools -> llm  (the cycle).
 *   Ask it: "What's the status of order A123, and refund it 500 cents if it's late."
 *   Print the message trail (type + content) and confirm you see:
 *     human -> ai(requests) -> tool -> ai(final)
 *
 * STEP 3 — Break it two ways, then fix
 *   a) THROW instead of returning a string in `search_orders` for a bad id.
 *      Run with an unknown order. What happens to the whole graph?
 *      Answer in a comment: why is returning an error string better?
 *
 *   b) Make the loop never terminate: change the router to always return "tools".
 *      Run with { recursionLimit: 6 }. What error? Answer in a comment: why is a
 *      step counter in state better than just raising recursionLimit?
 *
 * BONUS — Add a guard
 *   Insert a node between the router and `tools` that BLOCKS `refund_order`
 *   when amountCents > 1000, appending a ToolMessage saying approval is needed.
 *   (This is a preview of human-in-the-loop in 3.6.)
 *
 * Run: npx tsx 03-langgraph/exercises/04-tool-calling-agent.ts
 */

import 'dotenv/config';
import { StateGraph, MessagesAnnotation, START, END, AnnotationRoot, Graph } from '@langchain/langgraph';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import { tool } from '@langchain/core/tools';
import { AIMessage, HumanMessage } from '@langchain/core/messages';
import { llm } from '../../lib/llm.js';
import * as z from 'zod';

// TODO: Step 1 — the two tools

const searchOrder = tool(
  async (orderId: string) => {
    return `your order number ${orderId} is currently delayed`;
  },

  {
    name: 'searchOrder',
    description:
      "It's a function to give you details about search orders . it takes orderId is a parameter and give you a response",
    schema: z.string('orderId').describe("It's a order number"),
  }
);


const refundOrder = tool(
  async ( { orderId , amountCents }) => {
    // just uncomment the throw exception file to test , how the graph is behaving
    // throw new Error("something wen't wrong in the refund order !")
    return `your order number ${orderId} is currently in refunding process. The amount would be credit is ${amountCents}`;
  },

  {
    name: 'refundOrder',
    description:
      "It's a function to give you details about search orders . it takes orderId is a parameter and give you a response",
    schema: z.object({ orderId : z.string() , amountCents : z.number().describe("The amount we are refunding")}),
  }
);

const tools = [searchOrder , refundOrder]



// TODO: Step 2 — callModel node, shouldContinue router, build the graph
const toolNode = new ToolNode(tools);
const modelWithTools = llm.bindTools(tools);

// Node: call the model with the full message history.
async function callModel(state: typeof MessagesAnnotation.State) {
  const response = await modelWithTools.invoke(state.messages);
  // MessagesAnnotation's addMessages reducer appends this to history.
  return { messages: [response] };
}


// Router: look at the LAST message. Did the model request tools?
// PURE — it inspects state and returns a word. It executes nothing.
//  the whole point of this router is just to make sure is the model is requesting for tool or not
function shouldContinue(state: typeof MessagesAnnotation.State): string {
  const last = state.messages[state.messages.length - 1] as AIMessage;
  return last.tool_calls?.length ? "tools" : "done";
}

const agent = new StateGraph(MessagesAnnotation)
.addNode("callModel", callModel)
.addNode("toolNode",toolNode)
.addEdge(START , "callModel")
.addConditionalEdges("callModel",shouldContinue , { tools:"toolNode" , "done" : END })
.addEdge("toolNode","callModel")
.compile()


// TODO: Step 3 — break it two ways, record your answers in comments

async function main() {
  // TODO: run it and print the message trail
  const graphDrawing =  agent.getGraph().drawMermaid();
  console.log(graphDrawing);
  const result = await agent.invoke({
     messages: [new HumanMessage(`"What's the status of order A123, and refund it 500 cents if it's late."`)],
   });
  //  printing the message trail
  for (const m of result.messages) {
    const type = m.getType();
    const preview =
      type === "ai" && (m as AIMessage).tool_calls?.length
        ? `requests: ${(m as AIMessage).tool_calls!.map((t) => t.name).join(", ")}`
        : String(m.content).slice(0, 80);
    console.log(`   [${type.padEnd(6)}] ${preview}`);
  }
}

main().catch(console.error);
