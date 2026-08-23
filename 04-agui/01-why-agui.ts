/**
 * Module A.1 — Why AG-UI
 *
 * WHAT YOU'LL LEARN:
 *   - What a frontend actually needs from an agent (and why text isn't enough)
 *   - Why LangGraph's streamMode is a great debugger but a poor WIRE CONTRACT
 *   - The AG-UI event model: 33 typed events, and the start/content/end discipline
 *   - What standardising buys you: swap the agent OR the UI without a rewrite
 *
 * WHY THIS MATTERS:
 *   You already stream agent events (3.1) and pause for approval (3.6). AG-UI is
 *   the standard way to get those across a network to a browser. This module is
 *   the "why" — no frontend, no server yet. Just the problem, made concrete.
 *
 * Run: npx tsx 04-agui/01-why-agui.ts
 */

import "dotenv/config";
import { StateGraph, MessagesAnnotation, START, END } from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { tool } from "@langchain/core/tools";
import { AIMessage, HumanMessage } from "@langchain/core/messages";
import { EventType } from "@ag-ui/core";
import { llm } from "../lib/llm.js";
import * as z from "zod";

// =============================================================================
// PART 1 — What a real UI needs (and why "just stream the text" fails)
// =============================================================================
// Picture the chat UI you actually want to ship. To render it you need to know:
//
//   1. a run STARTED          -> show a spinner, disable the input box
//   2. tokens are ARRIVING    -> type them out live, into the RIGHT message
//   3. a TOOL was called      -> show "🔧 Searching orders…"
//   4. the tool RETURNED      -> collapse it, show the result
//   5. agent STATE changed    -> update a sidebar, a form, a progress bar
//   6. approval is NEEDED     -> render a dialog with Approve / Edit / Reject
//   7. the run ENDED (or FAILED) -> re-enable input, or show an error
//
// A plain text stream gives you exactly ONE of those seven. Everything else has
// to be inferred by the frontend — and inference is where UIs rot.

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

const agent = new StateGraph(MessagesAnnotation)
  .addNode("llm", async (s) => ({ messages: [await model.invoke(s.messages)] }))
  .addNode("tools", new ToolNode(tools))
  .addEdge(START, "llm")
  .addConditionalEdges("llm", (s) => {
    const last = s.messages.at(-1) as AIMessage;
    return last.tool_calls?.length ? "tools" : "done";
  }, { tools: "tools", done: END })
  .addEdge("tools", "llm")
  .compile();

// =============================================================================
// PART 2 — What LangGraph actually emits, and why it is not a contract
// =============================================================================
// streamMode "updates" is excellent for debugging. But look at the SHAPE:
// the keys are YOUR node names. A frontend written against this is coupled to
// your graph's internals — rename a node and the UI breaks.

async function rawLangGraphEvents() {
  console.log("\n=== PART 2: raw LangGraph events (streamMode: 'updates') ===");

  for await (const chunk of await agent.stream(
    { messages: [new HumanMessage("What's the status of order A123?")] },
    { streamMode: "updates" },
  )) {
    for (const [node, update] of Object.entries(chunk)) {
      const msgs = (update as any)?.messages ?? [];
      const summary = msgs.map((m: any) => {
        const t = m.getType?.() ?? "?";
        if (m.tool_calls?.length) return `${t}(requests ${m.tool_calls.map((c: any) => c.name).join(",")})`;
        return `${t}("${String(m.content).slice(0, 40)}")`;
      }).join(" ");
      console.log(`   node "${node}" -> ${summary}`);
    }
  }

  // Now ask the hard questions about what you just saw:
  //   - Which event says "the run started"?               -> none
  //   - Which says "these tokens belong to message X"?    -> none (no token stream here)
  //   - Which says "a tool STARTED" vs "tool FINISHED"?   -> you must diff messages
  //   - What is the shape if I swap to CrewAI or Mastra?  -> completely different
  //
  // It is a debug feed, not an interface. That is the gap AG-UI fills.
}

// =============================================================================
// PART 3 — The AG-UI event model
// =============================================================================
// AG-UI defines a fixed vocabulary of typed events. Your agent EMITS them; any
// compliant frontend CONSUMES them. Neither side knows the other's internals.

function theEventCatalogue() {
  console.log("\n=== PART 3: the AG-UI event vocabulary ===");
  const all = Object.values(EventType);
  console.log(`   ${all.length} event types, grouped by job:\n`);

  const groups: Record<string, string[]> = {
    "Lifecycle  (run + step boundaries)": all.filter((e) => /^RUN_|^STEP_/.test(e)),
    "Text       (streaming a message)": all.filter((e) => /^TEXT_MESSAGE_/.test(e)),
    "Tools      (calls + results)": all.filter((e) => /^TOOL_CALL_/.test(e)),
    "State      (shared app state)": all.filter((e) => /^STATE_|^MESSAGES_SNAPSHOT/.test(e)),
    "Reasoning  (visible thinking)": all.filter((e) => /^REASONING_|^THINKING_/.test(e)),
    "Activity   (custom progress)": all.filter((e) => /^ACTIVITY_/.test(e)),
    "Escape     (anything else)": all.filter((e) => /^RAW$|^CUSTOM$/.test(e)),
  };

  for (const [label, evs] of Object.entries(groups)) {
    console.log(`   ${label}`);
    console.log(`      ${evs.join(", ")}\n`);
  }

  // THE KEY DISCIPLINE: streaming things come in THREE parts.
  //
  //   TEXT_MESSAGE_START   { messageId, role }        <- open a bubble
  //   TEXT_MESSAGE_CONTENT { messageId, delta }       <- append a token (many)
  //   TEXT_MESSAGE_END     { messageId }              <- close it
  //
  //   TOOL_CALL_START      { toolCallId, toolCallName }
  //   TOOL_CALL_ARGS       { toolCallId, delta }      <- args stream in as JSON text
  //   TOOL_CALL_END        { toolCallId }
  //   TOOL_CALL_RESULT     { toolCallId, content }
  //
  // Why three and not one? Because the UI must render BEFORE the content is
  // finished. START tells it what to create, CONTENT fills it in, END finalises.
  // The shared messageId / toolCallId is how a delta finds its own bubble when
  // several things stream at once.
}

// =============================================================================
// PART 4 — What the standard actually buys you
// =============================================================================
function whatItBuys() {
  console.log("\n=== PART 4: why bother ===");
  const rows = [
    ["Swap LangGraph -> another framework", "rewrite the UI", "change the server only"],
    ["Add a second frontend (mobile/CLI)", "reimplement parsing", "reuse the same events"],
    ["Show 'tool running' state", "diff message arrays", "TOOL_CALL_START"],
    ["Human approval dialog", "invent your own format", "state + custom events"],
    ["Partial/streaming state to UI", "resend everything", "STATE_DELTA (JSON Patch)"],
  ];
  console.log("   scenario".padEnd(38), "without AG-UI".padEnd(26), "with AG-UI");
  console.log("   " + "-".repeat(84));
  for (const [a, b, c] of rows) {
    console.log("   " + a.padEnd(38) + b.padEnd(26) + c);
  }

  // STATE_DELTA is worth a second look: it uses RFC-6902 JSON Patch, so instead
  // of resending the whole state every tick you send:
  //     [{ "op": "replace", "path": "/customer/plan", "value": "enterprise" }]
  // That is 3.2's reducer idea, moved onto the wire.
}

async function main() {
  await rawLangGraphEvents();
  theEventCatalogue();
  whatItBuys();

  console.log("\n=============================================================");
  console.log("RECAP");
  console.log("  a UI needs 7 things; a text stream gives you 1");
  console.log("  streamMode is a DEBUG feed keyed by YOUR node names");
  console.log("  AG-UI = 33 typed events any agent emits + any UI consumes");
  console.log("  streaming discipline: START -> CONTENT(xN) -> END, joined by id");
  console.log("  STATE_DELTA = JSON Patch, reducers moved onto the wire");
  console.log("  NEXT (A.2): the event schemas in detail");
  console.log("=============================================================");
}

main().catch(console.error);
