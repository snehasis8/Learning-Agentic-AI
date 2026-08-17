/**
 * Module 3.3 — Conditional Edges
 *
 * WHAT YOU'LL LEARN:
 *   - addConditionalEdges: letting the GRAPH decide where to go next
 *   - The routing function: (state) => nodeName  — it picks, it doesn't work
 *   - Path maps: decoupling the router's vocabulary from node names
 *   - CYCLES: routing backwards, the thing a chain fundamentally cannot do
 *   - recursionLimit: the safety net that stops runaway loops
 *   - Routing on an LLM decision (the seed of the agent loop in 3.4)
 *
 * WHY THIS MATTERS:
 *   3.1 gave you fixed flow. 3.2 gave you correct state. This module gives you
 *   DYNAMIC flow — and with it, cycles. Every agent is a cycle: think -> act ->
 *   observe -> think again. Module 3.4 is literally this module plus tools.
 *
 * Run: npx tsx 03-langgraph/03-conditional-edges.ts
 */

import "dotenv/config";
import { StateGraph, Annotation, START, END } from "@langchain/langgraph";
import { llm } from "../lib/llm.js";
import * as z from "zod";

// =============================================================================
// PART 1 — Static edges vs conditional edges
// =============================================================================
// So far:   .addEdge("a", "b")            -> ALWAYS go from a to b.
// Now:      .addConditionalEdges("a", fn) -> ASK fn where to go after a.
//
// The routing function has one job:
//
//     (state) => "nameOfNextNode"
//
// It reads state and RETURNS A NODE NAME. It must not do work and must not
// update state — that's a node's job. Keeping routers pure makes flow easy to
// reason about (and easy to unit-test on its own).

const TriageState = Annotation.Root({
  message: Annotation<string>,
  category: Annotation<string>,
  reply: Annotation<string>,
  trail: Annotation<string[]>({
    reducer: (cur, next) => cur.concat(next),
    default: () => [],
  }),
});
type TriageStateType = typeof TriageState.State;

// A node: does work, updates state.
function classify(state: TriageStateType) {
  const text = state.message.toLowerCase();
  const category = text.includes("refund") || text.includes("charge")
    ? "billing"
    : text.includes("error") || text.includes("crash")
      ? "technical"
      : "general";
  return { category, trail: [`classified as ${category}`] };
}

// A ROUTER: reads state, returns the next node's name. No work, no state update.
function routeByCategory(state: TriageStateType): string {
  if (state.category === "billing") return "billingReply";
  if (state.category === "technical") return "techReply";
  return "generalReply";
}

const billingReply = (s: TriageStateType) => ({
  reply: "Your refund has been queued.", trail: ["handled by billing"],
});
const techReply = (s: TriageStateType) => ({
  reply: "Please send us your error logs.", trail: ["handled by tech"],
});
const generalReply = (s: TriageStateType) => ({
  reply: "Thanks for reaching out!", trail: ["handled by general"],
});

async function basicRouting() {
  console.log("\n=== PART 1: Routing by intent ===");

  const graph = new StateGraph(TriageState)
    .addNode("classify", classify)
    .addNode("billingReply", billingReply)
    .addNode("techReply", techReply)
    .addNode("generalReply", generalReply)
    .addEdge(START, "classify")
    // after "classify", ask routeByCategory which node comes next
    .addConditionalEdges("classify", routeByCategory)
    // every branch then goes to END
    .addEdge("billingReply", END)
    .addEdge("techReply", END)
    .addEdge("generalReply", END)
    .compile();

  for (const msg of ["I want a refund", "the app crashes on login", "hello there"]) {
    const r = await graph.invoke({ message: msg });
    console.log(`   "${msg}"`);
    console.log(`      -> ${r.category.padEnd(9)} | ${r.reply}`);
  }
}

// =============================================================================
// PART 2 — Path maps: decoupling router output from node names
// =============================================================================
// Above, the router returned literal node names. That couples your routing
// logic to your graph's wiring — rename a node and the router breaks silently.
//
// A PATH MAP lets the router speak its own vocabulary:
//
//     .addConditionalEdges("classify", router, {
//        billing:   "billingReply",     // router says "billing" -> go to billingReply
//        technical: "techReply",
//        general:   "generalReply",
//     })
//
// Now the router returns DOMAIN words, and the map translates to node names.
// It also documents every possible destination in one place — which is what
// graph visualisers read to draw your diagram.

function routeByCategoryDomain(state: TriageStateType): string {
  return state.category; // "billing" | "technical" | "general"
}

async function pathMapRouting() {
  console.log("\n=== PART 2: The same routing, via a path map ===");

  const graph = new StateGraph(TriageState)
    .addNode("classify", classify)
    .addNode("billingReply", billingReply)
    .addNode("techReply", techReply)
    .addNode("generalReply", generalReply)
    .addEdge(START, "classify")
    .addConditionalEdges("classify", routeByCategoryDomain, {
      billing: "billingReply",
      technical: "techReply",
      general: "generalReply",
    })
    .addEdge("billingReply", END)
    .addEdge("techReply", END)
    .addEdge("generalReply", END)
    .compile();

  const r = await graph.invoke({ message: "I was charged twice" });
  console.log("   category:", r.category, "| reply:", r.reply);
}

// =============================================================================
// PART 3 — CYCLES: the thing a chain cannot do
// =============================================================================
// A conditional edge can point BACKWARDS to a node that already ran. That
// creates a loop — retry, refine, re-plan.
//
// Here: write a draft, critique it, and if it's not good enough, go back and
// rewrite. This is the "reflection" pattern (Module 4.5) in miniature.

const DraftState = Annotation.Root({
  topic: Annotation<string>,
  draft: Annotation<string>,
  score: Annotation<number>,
  attempts: Annotation<number>({ reducer: (c, n) => c + n, default: () => 0 }),
});
type DraftStateType = typeof DraftState.State;

function write(state: DraftStateType) {
  // Pretend each rewrite gets a little better.
  const attempt = state.attempts + 1;
  return { draft: `draft v${attempt} about ${state.topic}`, attempts: 1 };
}

function critique(state: DraftStateType) {
  // Fake scorer: improves with each attempt so the loop terminates.
  return { score: state.attempts * 4 };
}

// The router that closes the loop:
function shouldRewrite(state: DraftStateType): string {
  if (state.score >= 8) return "done"; // good enough -> exit
  if (state.attempts >= 5) return "done"; // ALWAYS have an escape hatch
  return "rewrite"; // -> back to `write`
}

async function cycleGraph() {
  console.log("\n=== PART 3: A cycle (write -> critique -> maybe rewrite) ===");

  const graph = new StateGraph(DraftState)
    .addNode("write", write)
    .addNode("critique", critique)
    .addEdge(START, "write")
    .addEdge("write", "critique")
    // the loop: critique decides whether to go BACK to write, or finish
    .addConditionalEdges("critique", shouldRewrite, {
      rewrite: "write", // <- backwards edge = CYCLE
      done: END,
    })
    .compile();

  const r = await graph.invoke({ topic: "LangGraph" });
  console.log("   attempts:", r.attempts, "| score:", r.score);
  console.log("   final   :", r.draft);
}

// =============================================================================
// PART 4 — recursionLimit: the safety net
// =============================================================================
// A cycle with no exit runs forever. LangGraph caps the number of super-steps
// (default 25) and throws GraphRecursionError instead of hanging.
//
// TREAT THAT ERROR AS A BUG IN YOUR ROUTER, NOT AS A LIMIT TO RAISE.
// Raising recursionLimit to "fix" a runaway loop just burns more tokens.

async function runawayLoop() {
  console.log("\n=== PART 4: recursionLimit stops runaway cycles ===");

  const graph = new StateGraph(DraftState)
    .addNode("write", write)
    .addNode("critique", critique)
    .addEdge(START, "write")
    .addEdge("write", "critique")
    // BROKEN router: never returns "done"
    .addConditionalEdges("critique", () => "rewrite", { rewrite: "write", done: END })
    .compile();

  try {
    await graph.invoke({ topic: "infinite" }, { recursionLimit: 8 });
    console.log("   (unexpected: it finished)");
  } catch (err: any) {
    console.log("   ✗ caught:", err.constructor.name);
    console.log("     ", String(err.message).split("\n")[0]);
    console.log("      => the router never returned an exit path");
  }
}

// =============================================================================
// PART 5 — Routing on an LLM decision
// =============================================================================
// Everything so far routed on hand-written rules. Real agents route on what the
// MODEL decides. Use structured output so the decision is a typed value, not
// free text you have to parse (Module 1.3's lesson, applied to control flow).
//
// This is the seed of the agent loop: in 3.4, the same shape becomes
// "did the model ask for a tool? -> tools node : -> END".

const Decision = z.object({
  category: z.enum(["billing", "technical", "general"]),
  urgent: z.boolean(),
});

async function  llmClassify(state: TriageStateType) {
  const decider = llm.withStructuredOutput(Decision);
  const d = await decider.invoke(
    `Classify this support message.\nMessage: "${state.message}"`,
  );
  return {
    category: d.category,
    trail: [`llm says ${d.category}${d.urgent ? " (urgent)" : ""}`],
  };
}

async function llmRouting() {
  console.log("\n=== PART 5: Letting the LLM choose the branch ===");

  const graph = new StateGraph(TriageState)
    .addNode("classify", llmClassify)
    .addNode("billingReply", billingReply)
    .addNode("techReply", techReply)
    .addNode("generalReply", generalReply)
    .addEdge(START, "classify")
    .addConditionalEdges("classify", (s) => s.category, {
      billing: "billingReply",
      technical: "techReply",
      general: "generalReply",
    })
    .addEdge("billingReply", END)
    .addEdge("techReply", END)
    .addEdge("generalReply", END)
    .compile();

  const r = await graph.invoke({ message: "My card was billed twice this month" });
  console.log("   trail:", r.trail);
  console.log("   reply:", r.reply);
}

// =============================================================================
// PRODUCTION NOTES
// =============================================================================
// 1. ALWAYS give a cycle an escape hatch (a max-attempts check), not just a
//    quality check. Models can plateau below your threshold forever.
// 2. Keep routers PURE: read state, return a name. A router that also mutates
//    state makes flow untraceable — and it won't be re-run on resume (3.5).
// 3. Use a PATH MAP so every destination is declared. Returning an unmapped
//    name is a runtime error, and visualisers can't draw undeclared edges.
// 4. GraphRecursionError = your router is wrong. Fix the exit condition; don't
//    just raise recursionLimit.
// 5. Route on STRUCTURED output, never on parsing free-form model text.

async function main() {
  await basicRouting();
  // await pathMapRouting();
  // await cycleGraph();
  // await runawayLoop();
  // await llmRouting();

  console.log("\n=============================================================");
  console.log("RECAP");
  console.log("  addConditionalEdges(from, router[, pathMap])");
  console.log("  router = (state) => nodeName    (pure: picks, never works)");
  console.log("  path map decouples domain words from node names");
  console.log("  a backwards edge = a CYCLE = what chains cannot do");
  console.log("  every cycle needs an escape hatch + recursionLimit is a net");
  console.log("=============================================================");
}

main().catch(console.error);
