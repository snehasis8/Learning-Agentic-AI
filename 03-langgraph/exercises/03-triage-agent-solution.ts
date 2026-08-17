/**
 * REFERENCE SOLUTION — Modules 3.2 + 3.3: Support Ticket Triage Agent
 *
 * Compare this against your own `03-triage-agent.ts`. Your architecture was
 * already correct; the notes below mark the five places where state plumbing
 * differs, since those are the bugs that bite in production.
 *
 * Run: npx tsx 03-langgraph/exercises/03-triage-agent-solution.ts
 */

import "dotenv/config";
import { StateGraph, Annotation, START, END } from "@langchain/langgraph";
import { llm } from "../../lib/llm.js";
import * as z from "zod";

// =============================================================================
// STEP 1 — State. The reducer choice per field is the real work here.
// =============================================================================
const TriageState = Annotation.Root({
  // Set once by the caller, never changed -> default (overwrite).
  ticketText: Annotation<string>,

  // Written once by `classify` -> default (overwrite).
  // NOTE: singular. It holds ONE value, so `category` reads better than `categories`.
  category: Annotation<string>,

  // Written once by `classify` -> default (overwrite).
  urgent: Annotation<boolean>,

  // Built up piecemeal by DIFFERENT nodes, each adding its own key.
  // MERGE, so one node's write never wipes another's.
  customer: Annotation<Record<string, unknown>>({
    reducer: (cur, next) => ({ ...cur, ...next }),
    default: () => ({}),
  }),

  // Written by two PARALLEL nodes in the same super-step.
  // APPEND is mandatory here — with the default reducer this would throw
  // INVALID_CONCURRENT_GRAPH_UPDATE.
  findings: Annotation<string[]>({
    reducer: (cur, next) => cur.concat(next),
    default: () => [],
  }),

  // Replaced on every rewrite -> default (overwrite).
  draft: Annotation<string>,

  // Recomputed by `review` each pass -> default (overwrite).
  score: Annotation<number>,

  // Counts up across loop iterations -> SUM.
  // This is what makes the escape hatch work, so exactly ONE node may
  // contribute `attempts: 1` per pass (see draftReply).
  attempts: Annotation<number>({
    reducer: (cur, next) => cur + next,
    default: () => 0,
  }),

  // Every node adds what it spent -> SUM. Integer cents, never floats.
  costCents: Annotation<number>({
    reducer: (cur, next) => cur + next,
    default: () => 0,
  }),
});
type TriageStateType = typeof TriageState.State;

// =============================================================================
// STEP 2 — classify: the only node that calls the LLM for a decision.
// =============================================================================
// Structured output means the branch value is a typed enum, not parsed text.
const Decision = z.object({
  category: z.enum(["billing", "technical", "general"]),
  urgent: z.boolean(),
});

async function classify(state: TriageStateType) {
  const decider = llm.withStructuredOutput(Decision);
  const result = await decider.invoke(
    `Classify this support ticket.\nTicket: "${state.ticketText}"`,
  );
  return {
    category: result.category,
    urgent: result.urgent,
    costCents: 5,
  };
}

// =============================================================================
// STEP 3 — the router. PURE: reads state, returns a domain word. No work.
// =============================================================================
function routeByCategory(state: TriageStateType): string {
  // Urgent tickets always get enriched, even "general" ones — routing can
  // depend on more than one field.
  if (state.urgent) return "enrich";
  return state.category; // "billing" | "technical" | "general"
}

// =============================================================================
// STEP 4 — enrichment: one entry node that fans out to two parallel nodes.
// =============================================================================
// `enrich` itself does the customer lookup (demonstrating the MERGE reducer),
// then the graph fans out from it.
function enrich(state: TriageStateType) {
  return {
    customer: { tier: "enterprise" }, // merges, doesn't replace
    costCents: 5,
  };
}

// These two run IN PARALLEL — same super-step, both writing `findings`.
function checkSentiment(state: TriageStateType) {
  return {
    findings: [`sentiment: ${state.urgent ? "angry" : "neutral"}`],
    customer: { lastContact: "2026-08-01" }, // merge again, from a different node
    costCents: 10,
  };
}

function checkPriority(state: TriageStateType) {
  return {
    findings: [`priority: ${state.urgent ? "high" : "low"}`],
    costCents: 10,
  };
}

// =============================================================================
// STEP 5 — the retry cycle: draft -> review -> (retry | done)
// =============================================================================
// Division of labour matters:
//   draftReply -> produces the draft AND increments attempts
//   review     -> judges it, returns ONLY the score
//   router     -> decides, returns ONLY a word
function draftReply(state: TriageStateType) {
  const attempt = state.attempts + 1;

  // The general path legitimately has no findings — that is not an error,
  // it is the cheap path. Handle it instead of failing.
  const context = state.findings.length
    ? ` (${state.findings.join(", ")})`
    : "";

  return {
    draft: `draft v${attempt} for ${state.category}${context}`,
    attempts: 1, // exactly one contributor to the sum, once per pass
    costCents: 5,
  };
}

function review(state: TriageStateType) {
  // Pretend quality improves with each attempt so the loop terminates.
  // Returns ONLY score — echoing `attempts` here would double it via the
  // sum reducer (the 3.1 Bonus B.2 trap).
  return { score: state.attempts * 3 };
}

function shouldRetry(state: TriageStateType): string {
  if (state.score >= 7) return "done"; // quality exit
  if (state.attempts >= 3) return "done"; // escape hatch — never omit this
  return "retry";
}

// =============================================================================
// STEP 6 — wire it up
// =============================================================================
const graph = new StateGraph(TriageState)
  .addNode("classify", classify)
  .addNode("enrich", enrich)
  .addNode("checkSentiment", checkSentiment)
  .addNode("checkPriority", checkPriority)
  .addNode("draftReply", draftReply)
  .addNode("review", review)
  .addEdge(START, "classify")
  // conditional: billing/technical (or anything urgent) get enriched,
  // plain general tickets skip straight to the draft — the cheap path
  .addConditionalEdges("classify", routeByCategory, {
    billing: "enrich",
    technical: "enrich",
    enrich: "enrich",
    general: "draftReply",
  })
  // fan-out: two edges leaving `enrich` => both run in the SAME super-step
  .addEdge("enrich", "checkSentiment")
  .addEdge("enrich", "checkPriority")
  // fan-in
  .addEdge("checkSentiment", "draftReply")
  .addEdge("checkPriority", "draftReply")
  // the cycle
  .addEdge("draftReply", "review")
  .addConditionalEdges("review", shouldRetry, {
    retry: "draftReply", // backwards edge = CYCLE
    done: END,
  })
  .compile();

async function main() {
  console.log(graph.getGraph().drawMermaid());

  const tickets = [
    "I was charged twice this month",
    "the app crashes when I log in",
    "just wanted to say thanks!",
  ];

  for (const ticketText of tickets) {
    const r = await graph.invoke({ ticketText });
    console.log(`\n"${ticketText}"`);
    console.log(`   category : ${r.category} (urgent: ${r.urgent})`);
    console.log(`   findings : ${JSON.stringify(r.findings)}`);
    console.log(`   customer : ${JSON.stringify(r.customer)}`);
    console.log(`   attempts : ${r.attempts}   score: ${r.score}`);
    console.log(`   cost     : ${r.costCents}c`);
    console.log(`   draft    : ${r.draft}`);
  }

  // WHY THE GENERAL PATH IS CHEAPER (Step 6's question):
  // it skips `enrich` + both parallel checks, so it never pays for those
  // three nodes. Routing is not just about correctness — it is about not
  // paying for work a ticket does not need.
}

main().catch(console.error);
