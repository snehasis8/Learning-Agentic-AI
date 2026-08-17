/**
 * Module 3.4 — Tool-Calling Agent (the ReAct loop, built by hand)
 *
 * WHAT YOU'LL LEARN:
 *   - bindTools(): how the model learns which tools exist
 *   - tool_calls: what the model actually returns when it wants a tool
 *   - ToolNode: executing those calls and feeding results back as ToolMessages
 *   - The agent loop as a graph — the SAME cycle you built in 3.3
 *   - What createAgent() was hiding all along
 *
 * WHY THIS MATTERS:
 *   In Module 1.6 you used createAgent() and it worked, but it was a black box.
 *   After this module it isn't: an agent is a conditional edge plus a cycle,
 *   which you already know how to build.
 *
 * Run: npx tsx 03-langgraph/04-tool-calling-agent.ts
 */

import "dotenv/config";
import { StateGraph, MessagesAnnotation, START, END } from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { tool } from "@langchain/core/tools";
import { AIMessage, HumanMessage } from "@langchain/core/messages";
import { llm } from "../lib/llm.js";
import * as z from "zod";

// =============================================================================
// The tools (same idea as Module 1.5 — a name, a schema, a function)
// =============================================================================
const getWeather = tool(
  async ({ city }) => `It is 22°C and sunny in ${city}.`,
  {
    name: "get_weather",
    description: "Get the current weather for a city.",
    schema: z.object({ city: z.string().describe("The city name") }),
  },
);

const calculate = tool(
  async ({ expression }) => {
    // Deliberately tiny + safe: digits and operators only.
    if (!/^[\d+\-*/(). ]+$/.test(expression)) return "Invalid expression.";
    // eslint-disable-next-line no-new-func
    return String(Function(`"use strict"; return (${expression})`)());
  },
  {
    name: "calculate",
    description: "Evaluate a basic arithmetic expression like '3 * (2 + 4)'.",
    schema: z.object({ expression: z.string().describe("e.g. 12 * 7") }),
  },
);

const tools = [getWeather, calculate];

// =============================================================================
// PART 1 — bindTools(): teaching the model what it can call
// =============================================================================
// The model cannot run code. bindTools() just adds the tool SCHEMAS to the
// request, so the model can reply "I would like to call get_weather({city})".
// Executing it is entirely YOUR job — that is the part createAgent hid.

async function whatBindToolsDoes() {
  console.log("\n=== PART 1: What the model returns when it wants a tool ===");

  const modelWithTools = llm.bindTools(tools);
  const res = (await modelWithTools.invoke([
    new HumanMessage("What's the weather in Amsterdam?"),
  ])) as AIMessage;

  console.log("   content   :", JSON.stringify(res.content), "  <- usually empty!");
  console.log("   tool_calls:", JSON.stringify(res.tool_calls, null, 2));
  // KEY INSIGHT: the model did NOT answer. It returned a REQUEST:
  //   { name: "get_weather", args: { city: "Amsterdam" }, id: "call_..." }
  // Nothing has been executed. The loop exists to service that request.
}

// =============================================================================
// PART 2 — The agent loop, built by hand
// =============================================================================
// Two nodes and one conditional edge. That is the whole agent.
//
//        llm ──────────────┐
//         ▲                ▼
//         │        (tool_calls present?)
//         │           yes │      │ no
//       tools ◄───────────┘      ▼
//                              END
//
// Compare with your 3.3 triage cycle: identical shape, different question.

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
function shouldContinue(state: typeof MessagesAnnotation.State): string {
  const last = state.messages[state.messages.length - 1] as AIMessage;
  return last.tool_calls?.length ? "tools" : "done";
}

const agent = new StateGraph(MessagesAnnotation)
  .addNode("llm", callModel)
  .addNode("tools", toolNode)
  .addEdge(START, "llm")
  .addConditionalEdges("llm", shouldContinue, {
    tools: "tools",
    done: END,
  })
  // the cycle: after running tools, ALWAYS go back to the model so it can
  // read the results and decide what to do next
  .addEdge("tools", "llm")
  .compile();

async function runAgent() {
  console.log("\n=== PART 2: The hand-built agent loop ===");
  console.log(agent.getGraph().drawMermaid());

  const result = await agent.invoke({
    messages: [new HumanMessage("What's the weather in Paris, and what is 12 * 7?")],
  });

  console.log("   --- full message trail ---");
  for (const m of result.messages) {
    const type = m.getType();
    const preview =
      type === "ai" && (m as AIMessage).tool_calls?.length
        ? `requests: ${(m as AIMessage).tool_calls!.map((t) => t.name).join(", ")}`
        : String(m.content).slice(0, 80);
    console.log(`   [${type.padEnd(6)}] ${preview}`);
  }
}

// =============================================================================
// PART 3 — Reading the trail: think -> act -> observe -> think
// =============================================================================
// The message history IS the agent's reasoning trace. Typical shape:
//
//   [human]  What's the weather in Paris, and what is 12 * 7?
//   [ai]     (no content) requests: get_weather, calculate      <- THINK
//   [tool]   It is 22°C and sunny in Paris.                     <- ACT/OBSERVE
//   [tool]   84                                                 <- ACT/OBSERVE
//   [ai]     It's 22°C and sunny in Paris, and 12 * 7 = 84.     <- THINK (final)
//
// Notice the loop ran TWICE through `llm`: once to request tools, once to use
// the results. `shouldContinue` returned "tools" then "done".
//
// This is also why MessagesAnnotation matters: every step appends to the same
// history, and the model sees the whole trail on the next pass.

// =============================================================================
// PART 4 — What createAgent() was hiding
// =============================================================================
// The prebuilt helper builds exactly the graph above. Same nodes, same
// conditional edge, same cycle.
//
//    import { createAgent } from "langchain";
//    const a = createAgent({ llm, tools });
//
// Use the prebuilt one in real code. But now you can answer the interview
// question "how does an agent actually work?" — and, more importantly, you can
// CHANGE it: add a guard node before tools, cap the iterations, log every
// tool call, require human approval (3.6). None of that is possible with a
// black box.

// -----------------------------------------------------------------------------
// PRODUCTION NOTES
// -----------------------------------------------------------------------------
// 1. BOUND THE LOOP. A confused model can ping-pong llm->tools forever.
//    recursionLimit is the backstop; a step counter in state is the real fix.
// 2. TOOL ERRORS: a throwing tool kills the run. Catch inside the tool and
//    return an error STRING — the model can often recover from "not found".
// 3. COST: every loop iteration is a full LLM call with the whole history.
//    Long tool outputs get re-sent on every pass — truncate them.
// 4. Validate tool args with zod (you already do) — the model WILL eventually
//    send a malformed argument.

async function main() {
  await whatBindToolsDoes();
  await runAgent();

  console.log("\n=============================================================");
  console.log("RECAP");
  console.log("  bindTools() = tell the model what exists (it still can't run it)");
  console.log("  tool_calls  = the model's REQUEST, sitting on the AIMessage");
  console.log("  ToolNode    = executes them, appends ToolMessages to history");
  console.log("  the agent   = llm -> (tool_calls?) -> tools -> back to llm");
  console.log("  createAgent = this exact graph, prebuilt");
  console.log("=============================================================");
}

main().catch(console.error);
