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

import "dotenv/config";
import { StateGraph, MessagesAnnotation, START, END } from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { tool } from "@langchain/core/tools";
import { AIMessage, HumanMessage } from "@langchain/core/messages";
import { llm } from "../../lib/llm.js";
import * as z from "zod";

// TODO: Step 1 — the two tools

// TODO: Step 2 — callModel node, shouldContinue router, build the graph

// TODO: Step 3 — break it two ways, record your answers in comments

async function main() {
  // TODO: run it and print the message trail
}

main().catch(console.error);
