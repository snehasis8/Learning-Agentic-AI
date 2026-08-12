/**
 * Module 3.1 — Hello Graph
 *
 * WHAT YOU'LL LEARN:
 *   - Why graphs exist when we already had chains (LCEL)
 *   - The three primitives: State, Node, Edge
 *   - What Annotation does and why state needs a schema
 *   - START and END, and what .compile() actually gives you
 *   - How state flows (and MERGES) through a multi-node graph
 *   - How to put an LLM inside a node
 *
 * WHY THIS MATTERS:
 *   Everything in Phase 3 and 4 is this same graph model:
 *     3.1 one node            ← you are here
 *     3.2 richer state + reducers
 *     3.3 conditional edges (branching)
 *     3.4 the ReAct agent loop, built as a graph
 *     3.5 checkpointing (pause / resume)
 *     3.6 human-in-the-loop
 *   Master State/Node/Edge now and the rest is just variations.
 *
 * Run: npx tsx 03-langgraph/01-hello-graph.ts
 */

import "dotenv/config";
import { StateGraph, Annotation, START, END } from "@langchain/langgraph";
import { llm } from "../lib/llm.js";

// =============================================================================
// PART 1 — Why a graph? What was wrong with chains?
// =============================================================================
// In Phase 1 you built chains with LCEL:
//
//     prompt.pipe(model).pipe(parser)
//
// A chain is a STRAIGHT LINE. Data flows one way, start to finish. That is
// perfect for "prompt → model → parse". But real agents need things a straight
// line cannot express:
//
//   1. CYCLES     — "call a tool, look at the result, maybe call another tool"
//                   A chain cannot go backwards. An agent loop must.
//   2. BRANCHING  — "if the user asked about billing, go here; else go there"
//   3. STATE      — every step needs to read/write a shared scratchpad
//   4. PAUSING    — stop mid-run, wait for a human, resume later (3.5 / 3.6)
//
// `createAgent` in Module 1.6 DID all of this — but it was a black box. You
// could not see the loop, inspect it, or change the routing.
//
// LangGraph makes that loop explicit. You draw the machine yourself:
//   nodes = the work,  edges = the flow,  state = the memory.
//
// Mental model:  NODES MUTATE STATE. EDGES DECIDE WHERE TO GO NEXT.

// =============================================================================
// PART 2 — State: the shared memory of a run
// =============================================================================
// Every graph has ONE state object. Each node receives it and returns a
// PARTIAL update, which LangGraph merges back in.
//
// We declare its shape with `Annotation.Root`. This is not just TypeScript
// types — at runtime LangGraph needs to know, for each field, HOW to merge a
// node's update into the existing value. That merge function is the "reducer".
//
// NOTE — "why not zod?" LangGraph also accepts a plain zod schema here:
//     const State = z.object({ message: z.string() });
//     new StateGraph(State)
// It works, but plain zod fields are OVERWRITE-only; to attach a reducer you
// need `withLangGraph` from "@langchain/langgraph/zod". We stay on Annotation
// in this module so the focus is State/Node/Edge. Module 3.2 (State Management)
// covers zod + reducers properly and compares the two approaches.

const HelloState = Annotation.Root({
  // A plain field. Default reducer = OVERWRITE (last write wins).
  message: Annotation<string>,

  // A field with a CUSTOM reducer: instead of overwriting, append to the list.
  // (x, y) => x.concat(y)  means "old value, new value → merged value"
  // `default` supplies the starting value when the graph begins.
  steps: Annotation<string[]>({
    reducer: (existing, update) => existing.concat(update),
    default: () => [],
  }),
});

// Handy type alias for our node functions.
type HelloStateType = typeof HelloState.State;

// =============================================================================
// PART 3 — Your first graph: ONE node
// =============================================================================
// A node is just a function:  (state) => partial state update
// It does NOT mutate state directly and it does NOT return the whole state.
// It returns only the fields it wants to change.

function greet(state: HelloStateType) {
  console.log("   [node: greet] received message =", JSON.stringify(state.message));

  // Return a PARTIAL update. LangGraph merges this into state.
  return {
    message: `Hello, ${state.message}!`,
    steps: ["greet"], // reducer appends this to the existing array
  };
}

async function firstGraph() {
  console.log("\n=== PART 3: The simplest possible graph ===");

  // Build the graph: declare state shape, add nodes, wire edges, compile.
  const graph = new StateGraph(HelloState)
    .addNode("greet", greet)
    .addEdge(START, "greet") // START = the entry point (a special marker, not a node)
    .addEdge("greet", END) // END   = stop here and return the final state
    .compile(); // .compile() validates the graph and returns a Runnable

  // Because it's a Runnable, it has the SAME interface as everything else in
  // LangChain: .invoke(), .stream(), .batch(). That consistency is deliberate.
  const result = await graph.invoke({ message: "Snehasis" });

  console.log("   final state:", result);
  // Note: `steps` is ["greet"] — it started as [] (our default) and the
  // reducer appended. `message` was OVERWRITTEN (the default reducer).
}

// =============================================================================
// PART 4 — Multiple nodes: watch state flow and merge
// =============================================================================
// Now three nodes in sequence. Each one sees what the previous one wrote.
// This is the whole point of state: it is the channel between nodes.

function toUpper(state: HelloStateType) {
  console.log("   [node: toUpper] sees =", JSON.stringify(state.message));
  return { message: state.message.toUpperCase(), steps: ["toUpper"] };
}

function exclaim(state: HelloStateType) {
  console.log("   [node: exclaim] sees =", JSON.stringify(state.message));
  return { message: state.message + "!!!", steps: ["exclaim"] };
}

async function multiNodeGraph() {
  console.log("\n=== PART 4: Three nodes in sequence ===");

  const graph = new StateGraph(HelloState)
    .addNode("greet", greet)
    .addNode("toUpper", toUpper)
    .addNode("exclaim", exclaim)
    // The edges define the ORDER. Change these lines and you change the flow —
    // without touching a single node function. That separation is the payoff.
    .addEdge(START, "greet")
    .addEdge("greet", "toUpper")
    .addEdge("toUpper", "exclaim")
    .addEdge("exclaim", END)
    .compile();

  const result = await graph.invoke({ message: "world" });

  console.log("   final message:", result.message);
  console.log("   steps taken:  ", result.steps);
  // steps === ["greet", "toUpper", "exclaim"]
  // Proof the reducer accumulated instead of overwriting — each node
  // contributed one entry. This "breadcrumb trail" pattern is how you debug
  // real agents later.
}

// =============================================================================
// PART 5 — Streaming: seeing the graph run step by step
// =============================================================================
// .invoke() gives you only the final state. .stream() emits an update after
// EVERY node. This is how a UI shows "thinking..." progress — and it is
// exactly what AG-UI (Phase 3.5) will carry to your frontend.

async function streamingGraph() {
  console.log("\n=== PART 5: Streaming node-by-node updates ===");

  const graph = new StateGraph(HelloState)
    .addNode("greet", greet)
    .addNode("toUpper", toUpper)
    .addEdge(START, "greet")
    .addEdge("greet", "toUpper")
    .addEdge("toUpper", END)
    .compile();

  // Each chunk is { nodeName: partialUpdateThatNodeReturned }
  for await (const chunk of await graph.stream({ message: "stream" } , {streamMode : "values"})) {
    console.log("   update →", JSON.stringify(chunk));
  }
}

// =============================================================================
// PART 6 — A node that calls the LLM
// =============================================================================
// Nothing special: a node is just a function, so it can be async and do
// anything — call an LLM, hit a database, read a file. THAT is why graphs are
// flexible. The model is not the graph; it is just something a node uses.

const TopicState = Annotation.Root({
  topic: Annotation<string>,
  joke: Annotation<string>,
  critique: Annotation<string>,
});

async function writeJoke(state: typeof TopicState.State) {
  console.log("   [node: writeJoke] topic =", state.topic);
  const res = await llm.invoke(`Write a short one-line joke about ${state.topic}.`);
  return { joke: String(res.content) };
}

async function critiqueJoke(state: typeof TopicState.State) {
  console.log("   [node: critiqueJoke] critiquing...");
  const res = await llm.invoke(
    `In one short sentence, rate this joke out of 10 and say why:\n"${state.joke}"`,
  );
  return { critique: String(res.content) };
}

async function llmGraph() {
  console.log("\n=== PART 6: LLM inside a node ===");

  const graph = new StateGraph(TopicState)
    .addNode("writeJoke", writeJoke)
    .addNode("critiqueJoke", critiqueJoke)
    .addEdge(START, "writeJoke")
    .addEdge("writeJoke", "critiqueJoke")
    .addEdge("critiqueJoke", END)
    .compile();

  const result = await graph.invoke({ topic: "TypeScript developers" });

  console.log("   joke:     ", result.joke);
  console.log("   critique: ", result.critique);
  // You just built a two-step LLM pipeline as a graph. In 3.3 you'll add a
  // conditional edge so a bad joke loops BACK to writeJoke — a cycle, which
  // a chain simply cannot do.
}

// =============================================================================
// RUN ALL
// =============================================================================

async function main() {
  // await firstGraph();
  //  await multiNodeGraph();
   await streamingGraph();
  // await llmGraph();

  console.log("\n=============================================================");
  console.log("RECAP");
  console.log("  State  = shared memory; Annotation declares its shape + reducers");
  console.log("  Node   = (state) => partial update   (never mutate, never return all)");
  console.log("  Edge   = flow;  START -> ... -> END");
  console.log("  compile() -> a Runnable (.invoke / .stream, like any LangChain piece)");
  console.log("  Reducer decides MERGE behaviour: overwrite (default) vs append");
  console.log("=============================================================");
}

main().catch(console.error);
