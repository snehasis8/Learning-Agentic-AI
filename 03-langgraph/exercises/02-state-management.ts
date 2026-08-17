/**
 * Exercise — Module 3.2: State Management  (short — ~20 min)
 *
 * Goal: prove you can pick the RIGHT reducer for each kind of field.
 * You'll reuse this state in the 3.3 exercise, so keep it.
 *
 * STEP 1 — Design the state
 *   Annotation.Root with four fields. For EACH, write a one-line comment
 *   saying which reducer you chose and why:
 *     - ticketText: string                   (set once at the start)
 *     - customer:   Record<string, unknown>  (built up by DIFFERENT nodes)
 *     - findings:   string[]                 (written by PARALLEL nodes)
 *     - costCents:  number                   (each step ADDS to a running total)
 *
 * STEP 2 — Two sequential nodes, one shared object
 *   a) lookupCustomer -> { customer: { name: "Acme" },       costCents: 5 }
 *   b) lookupPlan     -> { customer: { plan: "enterprise" }, costCents: 5 }
 *   Wire START -> lookupCustomer -> lookupPlan -> END, invoke, print state.
 *   ✅ PASS when: customer has BOTH keys, costCents === 10.
 *   ❌ If `name` vanished, your customer reducer is wrong — fix it.
 *
 * STEP 3 — Fan-out, and break it on purpose
 *   Add two nodes branching from lookupPlan (both edges from the same node):
 *     checkSentiment -> { findings: ["sentiment: angry"], costCents: 10 }
 *     checkPriority  -> { findings: ["priority: high"],   costCents: 10 }
 *   Both join into a `summarise` node before END.
 *   ✅ PASS when: findings has BOTH entries, costCents === 30.
 *
 *   Then BREAK it: make both parallel nodes also write `ticketText`.
 *   Run it, and answer in a comment:
 *     - what error do you get?
 *     - why is throwing better than silently keeping one value?
 *   Then revert.
 *
 * Run: npx tsx 03-langgraph/exercises/02-state-management.ts
 */

import "dotenv/config";
import { StateGraph, Annotation, START, END } from "@langchain/langgraph";

// TODO: Step 1 — the state (one comment per field justifying the reducer)

// TODO: Step 2 — sequential enrichment

// TODO: Step 3 — parallel fan-out, then break it on purpose

async function main() {
  // TODO: call your steps
}

main().catch(console.error);
