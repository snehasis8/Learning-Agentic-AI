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

// TODO: Step 1 — state, propose / confirm / execute nodes, compile with checkpointer

// TODO: Step 2 — the reject path on a new thread_id

// TODO: Step 3 — interruptBefore on your 3.4 agent's tool node

async function main() {
  // TODO: run your steps
}

main().catch(console.error);
