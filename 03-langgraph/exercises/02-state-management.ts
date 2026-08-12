/**
 * Exercise — Module 3.2: State Management
 *
 * CHALLENGE: Build a "support ticket triage" state and make its reducers correct.
 *
 * You'll design state for a system that enriches a support ticket through
 * several nodes — including two that run IN PARALLEL.
 *
 * STEP 1 — Design the state (pick the RIGHT reducer for each field)
 *   Create an Annotation.Root with:
 *     - ticketText:  string                  (the raw ticket; set once)
 *     - stage:       string                  (current stage: "new"|"triaged"|"done")
 *     - customer:    Record<string, unknown> (enriched piecemeal by DIFFERENT nodes)
 *     - findings:    string[]                (collected by PARALLEL nodes)
 *     - costCents:   number                  (each LLM/tool call ADDS to a running total)
 *   For EACH field, decide: overwrite, append, merge, or sum? Write your reasoning
 *   in a comment above each one. This is the actual exercise — the code is easy.
 *
 * STEP 2 — Sequential enrichment
 *   Write two nodes that each add a DIFFERENT key to `customer`:
 *     a) `lookupCustomer` -> { customer: { name: "Acme Corp" }, costCents: 5 }
 *     b) `lookupPlan`     -> { customer: { plan: "enterprise" }, costCents: 5 }
 *   Wire START -> lookupCustomer -> lookupPlan -> END and invoke.
 *   VERIFY: the final `customer` has BOTH name and plan, and costCents is 10.
 *   If `name` disappeared, your reducer is wrong — fix it and note why in a comment.
 *
 * STEP 3 — Parallel analysis (the important one)
 *   Add two nodes that branch from the SAME node and run in parallel:
 *     a) `checkSentiment` -> { findings: ["sentiment: angry"], costCents: 10 }
 *     b) `checkPriority`  -> { findings: ["priority: high"],   costCents: 10 }
 *   Wire: START -> lookupCustomer -> [checkSentiment, checkPriority] -> summarise -> END
 *   VERIFY: `findings` contains BOTH entries and costCents summed correctly.
 *
 * STEP 4 — Prove the failure mode
 *   Temporarily make BOTH parallel nodes also write to `stage`
 *   (e.g. `stage: "triaged"`). Run it.
 *   Answer in a comment: what error do you get, and WHY is throwing better than
 *   silently keeping one value?
 *
 * STEP 5 — Rebuild the state with ZOD
 *   Redefine the same state using z.object + withLangGraph for the reducer fields.
 *   Import: import { withLangGraph } from "@langchain/langgraph/zod";
 *   Add real validation to at least one field (e.g. ticketText: z.string().min(10)).
 *   Invoke with an INVALID ticketText and answer in a comment: what happens, and
 *   why is that useful at a trust boundary?
 *
 * STEP 6 — Message history + trimming
 *   Build a small graph on MessagesAnnotation that:
 *     a) adds 4 messages (give each an explicit id)
 *     b) has a `trim` node keeping only the last 2, using RemoveMessage
 *   Answer in a comment: why can't you just do `state.messages.slice(-2)`
 *   and return that? (Think about what the addMessages reducer does with it.)
 *
 * BONUS — Real cost tracking
 *   Make `lookupCustomer` call the LLM (import { llm } from "../../lib/llm.js")
 *   and add the real token usage to costCents from response.usage_metadata.
 *
 * Run: npx tsx 03-langgraph/exercises/02-state-management.ts
 */

import "dotenv/config";
import {
  StateGraph, Annotation, START, END,
  MessagesAnnotation,
} from "@langchain/langgraph";
// Uncomment for Step 5:
// import { withLangGraph } from "@langchain/langgraph/zod";
// import * as z from "zod";
// Uncomment for Step 6:
// import { HumanMessage, RemoveMessage } from "@langchain/core/messages";
// Uncomment for BONUS:
// import { llm } from "../../lib/llm.js";

// TODO: Step 1 — design the state, with a comment justifying EACH reducer choice
// const TicketState = Annotation.Root({
//   ...
// });

// TODO: Step 2 — sequential enrichment nodes

// TODO: Step 3 — parallel analysis nodes

// TODO: Step 4 — prove the parallel-write failure mode (then revert it)

// TODO: Step 5 — the same state defined with zod + withLangGraph

// TODO: Step 6 — MessagesAnnotation graph with RemoveMessage trimming

async function main() {
  // TODO: call your steps here
}

main().catch(console.error);
