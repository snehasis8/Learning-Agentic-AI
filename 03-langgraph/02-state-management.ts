/**
 * Module 3.2 — State Management
 *
 * WHAT YOU'LL LEARN:
 *   - Reducers in depth: why the merge function is the real logic of your state
 *   - The three reducer patterns you'll actually ship (overwrite / append / merge)
 *   - MessagesAnnotation + addMessages — the state every agent uses
 *   - Defining state with ZOD instead of Annotation, and how to attach reducers
 *   - Which one to ship, and why (the production decision)
 *   - Parallel nodes: where a wrong reducer silently loses data
 *
 * WHY THIS MATTERS:
 *   In 3.1 you learned nodes and edges. But in real agents, MOST bugs are state
 *   bugs: history that silently doubles, updates that overwrite each other in
 *   parallel branches, state that grows until it blows the context window.
 *   Getting reducers right IS getting agents right.
 *
 * Run: npx tsx 03-langgraph/02-state-management.ts
 */

import "dotenv/config";
import {
  StateGraph, Annotation, START, END,
  MessagesAnnotation, messagesStateReducer,
} from "@langchain/langgraph";
import { withLangGraph } from "@langchain/langgraph/zod";
import { HumanMessage, AIMessage, RemoveMessage } from "@langchain/core/messages";
import * as z from "zod";

// =============================================================================
// PART 1 — The reducer IS the logic
// =============================================================================
// A reducer answers one question: "a node returned a value for this field —
// what should the field become?"
//
//     reducer: (currentValue, incomingUpdate) => newValue
//
// That's it. But this tiny function decides whether your agent remembers
// things, forgets things, or corrupts things. Three patterns cover ~all cases:
//
//   1. OVERWRITE (default)  -> (_, next) => next          "latest wins"
//   2. APPEND                -> (cur, next) => cur.concat(next)   "history"
//   3. MERGE                 -> (cur, next) => ({...cur, ...next}) "partial object update"
//
// Pattern 3 is the one people forget, and it matters a lot — see below.

const ReducerDemo = Annotation.Root({
  // 1. OVERWRITE — the default when you pass no config
  status: Annotation<string>,

  // 2. APPEND — build a history
  history: Annotation<string[]>({
    reducer: (cur, next) => cur.concat(next),
    default: () => [],
  }),

  // 3. MERGE — a node updates ONE key of an object without destroying the rest
  profile: Annotation<Record<string, unknown>>({
    reducer: (cur, next) => ({ ...cur, ...next }),
    default: () => ({}),
  }),

  // A counter — reducers don't have to be about collections
  tokensUsed: Annotation<number>({
    reducer: (cur, next) => cur + next,
    default: () => 0,
  }),
});

async function reducerPatterns() {
  console.log("\n=== PART 1: The three reducer patterns ===");

  const graph = new StateGraph(ReducerDemo)
    .addNode("stepOne", () => ({
      status: "working",
      history: ["stepOne ran"],
      profile: { name: "Snehasis" },
      tokensUsed: 120,
    }))
    .addNode("stepTwo", () => ({
      status: "done", // overwrites "working"
      history: ["stepTwo ran"], // appends
      profile: { role: "engineer" }, // MERGES — does not wipe `name`
      tokensUsed: 80, // adds -> 200
    }))
    .addEdge(START, "stepOne")
    .addEdge("stepOne", "stepTwo")
    .addEdge("stepTwo", END)
    .compile();

  const result = await graph.invoke({ status: "idle" });
  console.log("   status    :", result.status, "  <- overwritten");
  console.log("   history   :", result.history, "  <- appended");
  console.log("   profile   :", result.profile, "  <- MERGED (name survived!)");
  console.log("   tokensUsed:", result.tokensUsed, "  <- summed");

  // TRY THIS — and note the two different meanings of the word "default":
  //
  //   `default:` KEY      -> the INITIAL VALUE, e.g. default: () => ({})
  //   the DEFAULT REDUCER -> the built-in OVERWRITE behaviour you get when you
  //                          pass NO config object at all
  //
  // The experiment is the second one. Change the whole field declaration from:
  //
  //     profile: Annotation<Record<string, unknown>>({ reducer: ..., default: ... }),
  //   to:
  //     profile: Annotation<Record<string, unknown>>,        // no parens, no config
  //
  // Now stepTwo's { role } REPLACES the entire object instead of merging, so
  // { name } is silently gone:
  //     with merge reducer -> { name: 'Snehasis', role: 'engineer' }
  //     with default (overwrite) -> { role: 'engineer' }
  //
  // That is the classic "my user context keeps disappearing" bug in production
  // agents: each enrichment node wipes the previous node's work, with no error.
  //
  // (Removing only the `default:` key changes nothing here — the first write
  //  simply becomes the initial value, as you saw in 3.1 Bonus B.)
}

// =============================================================================
// PART 2 — MessagesAnnotation: the state every agent uses
// =============================================================================
// Almost every agent's state is "a list of messages". LangGraph ships a
// prebuilt annotation for it, because naive appending is NOT enough.
//
// MessagesAnnotation is EXACTLY equivalent to writing:
//
//     Annotation.Root({
//       messages: Annotation<BaseMessage[]>({
//         reducer: messagesStateReducer,   // aka addMessages
//         default: () => [],
//       }),
//     })
//
// So `messages` is not a reserved word — it's a convention with a smart reducer.
//
// Why `addMessages` instead of plain concat? Because it also handles:
//   - de-duplication / replacement BY MESSAGE ID (re-emitting a message with the
//     same id updates it in place instead of appending a duplicate)
//   - RemoveMessage instances, which DELETE messages from history
// That is how you trim history without rebuilding the array by hand.

async function messagesState() {
  console.log("\n=== PART 2: MessagesAnnotation + addMessages ===");

  const graph = new StateGraph(MessagesAnnotation)
    .addNode("userTurn", () => ({
      messages: [new HumanMessage({ id: "m1", content: "Hello!" })],
    }))
    .addNode("assistantTurn", () => ({
      messages: [new AIMessage({ id: "m2", content: "Hi, how can I help?" })],
    }))
    // Re-emitting id "m1" REPLACES it rather than appending a copy:
    .addNode("editEarlier", () => ({
      messages: [new HumanMessage({ id: "m1", content: "Hello! (edited)" })],
    }))
    .addEdge(START, "userTurn")
    .addEdge("userTurn", "assistantTurn")
    .addEdge("assistantTurn", "editEarlier")
    .addEdge("editEarlier", END)
    .compile();

  const result = await graph.invoke({ messages: [] });
  console.log("   count:", result.messages.length, "(3 writes, but m1 was replaced)");
  for (const m of result.messages) {
    console.log(`   - [${m.getType()}] id=${m.id} :: ${m.content}`);
  }
}

async function trimmingHistory() {
  console.log("\n=== PART 2b: Deleting messages with RemoveMessage ===");
  // Unbounded history = growing cost + eventual context-window failure.
  // RemoveMessage is how you drop old turns inside the reducer.

  const graph = new StateGraph(MessagesAnnotation)
    .addNode("seed", () => ({
      messages: [
        new HumanMessage({ id: "a", content: "first" }),
        new AIMessage({ id: "b", content: "second" }),
        new HumanMessage({ id: "c", content: "third" }),
      ],
    }))
    .addNode("trim", (state) => {
      // keep only the last message; delete the rest by id
      const toDelete = state.messages.slice(0, -1);
      return { messages: toDelete.map((m) => new RemoveMessage({ id: m.id! })) };
    })
    .addEdge(START, "seed")
    .addEdge("seed", "trim")
    .addEdge("trim", END)
    .compile();

  const result = await graph.invoke({ messages: [] });
  console.log("   after trim:", result.messages.map((m) => m.content));
}

// =============================================================================
// PART 3 — The same state, defined with ZOD
// =============================================================================
// LangGraph also accepts a standard zod schema. Two important facts:
//   1. Plain zod fields are OVERWRITE-only.
//   2. To attach a reducer you wrap the field with `withLangGraph`.
//
// Note the extra power zod gives you: `.min()`, `.email()`, `.default()` etc.
// are RUNTIME VALIDATION. Annotation gives you no validation at all.

const ZodState = z.object({
  // plain field -> overwrite, plus runtime validation
  status: z.string().min(1),

  // field with a reducer -> same behaviour as the Annotation version
  history: withLangGraph(z.array(z.string()), {
    reducer: {
      schema: z.array(z.string()),
      fn: (cur, next) => cur.concat(next),
    },
    default: () => [],
  }),
});

async function zodState() {
  console.log("\n=== PART 3: State defined with zod ===");

  const graph = new StateGraph(ZodState)
    .addNode("one", () => ({ status: "working", history: ["one"] }))
    .addNode("two", () => ({ status: "done", history: ["two"] }))
    .addEdge(START, "one")
    .addEdge("one", "two")
    .addEdge("two", END)
    .compile();

  const result = await graph.invoke({ status: "idle", history: [] });
  console.log("   status :", result.status, " <- overwritten");
  console.log("   history:", result.history, " <- appended via withLangGraph");
}

// =============================================================================
// PART 4 — THE PRODUCTION DECISION: Annotation or zod?
// =============================================================================
// Both work. Here is the honest trade-off:
//
//   ANNOTATION
//     + reducers are first-class, no wrapper, least ceremony
//     + what most LangGraph JS docs/examples use -> easiest to google
//     + MessagesAnnotation is the ubiquitous convention for agent state
//     - NO runtime validation. Garbage in state stays garbage.
//     - a LangGraph-only concept; can't reuse the schema elsewhere
//
//   ZOD (+ withLangGraph)
//     + RUNTIME VALIDATION — bad input fails loudly at the boundary
//     + ONE schema language across your whole app: tools (1.5), structured
//       output (1.3), API request bodies, and now graph state
//     + the schema can be exported, reused, and turned into JSON Schema
//     - reducers need the `withLangGraph` wrapper (more ceremony)
//
// WHAT TO SHIP (a defensible answer in an interview):
//   "Use MessagesAnnotation for message-carrying agent state — it's the
//    convention and its reducer handles ids and deletions correctly. Use zod
//    for custom domain state, especially anything crossing a trust boundary
//    (API input, tool results), because runtime validation catches bad data
//    before it corrupts the run. They can be mixed in one codebase."
//
// The general principle: VALIDATE AT THE EDGES, keep the interior fast.

// =============================================================================
// PART 5 — Parallel nodes: why fan-out REQUIRES a reducer
// =============================================================================
// So far every graph has been a straight line, so "overwrite" was harmless:
// only one node wrote to a field per step.
//
// Now run two nodes IN PARALLEL (both branch from the same node). They execute
// in the SAME super-step, so BOTH write to the same field at once.
//
// What happens? You might expect "last writer wins" and silent data loss.
// LangGraph is better than that: a default (overwrite) field is backed by a
// `LastValue` channel, which REFUSES more than one write per step and throws:
//
//     InvalidUpdateError: Invalid update for channel "overwritten"
//     with values ["A","B"]: LastValue can only receive one value per step.
//     lc_error_code: INVALID_CONCURRENT_GRAPH_UPDATE
//
// That is a deliberate safety design: it fails LOUDLY at the moment of
// ambiguity instead of quietly discarding a result. Your job is to tell
// LangGraph how to combine concurrent writes — i.e. supply a reducer.

const ParallelState = Annotation.Root({
  // NO reducer -> LastValue channel -> throws if two nodes write in one step
  overwritten: Annotation<string>,
  // WITH a reducer -> both contributions are merged
  collected: Annotation<string[]>({
    reducer: (cur, next) => cur.concat(next),
    default: () => [],
  }),
});

// --- 5a: BAD — both workers write `overwritten`, which has NO reducer --------
// Note the two edges leaving "fanOut": that is what makes A and B run in the
// SAME step. Nothing else about this graph is special.
const badFanOut = new StateGraph(ParallelState)
  .addNode("fanOut", () => ({}))
  .addNode("workerA", () => ({ overwritten: "A", collected: ["A"] }))
  .addNode("workerB", () => ({ overwritten: "B", collected: ["B"] }))
  .addNode("join", () => ({}))
  .addEdge(START, "fanOut")
  .addEdge("fanOut", "workerA") // ← both edges leave fanOut, so
  .addEdge("fanOut", "workerB") // ← A and B run in the same step
  .addEdge("workerA", "join")
  .addEdge("workerB", "join")
  .addEdge("join", END)
  .compile();

// --- 5b: GOOD — identical graph, but workers only write the reduced field ----
const goodFanOut = new StateGraph(ParallelState)
  .addNode("fanOut", () => ({}))
  .addNode("workerA", () => ({ collected: ["A"] }))
  .addNode("workerB", () => ({ collected: ["B"] }))
  .addNode("join", () => ({}))
  .addEdge(START, "fanOut")
  .addEdge("fanOut", "workerA")
  .addEdge("fanOut", "workerB")
  .addEdge("workerA", "join")
  .addEdge("workerB", "join")
  .addEdge("join", END)
  .compile();

async function parallelWrites() {
  console.log("\n=== PART 5: Parallel nodes require reducers ===");

  // 5a — writing a no-reducer field from two parallel nodes -> LangGraph throws
  try {
    await badFanOut.invoke({ overwritten: "none" });
    console.log("   (unexpected: no error)");
  } catch (err: any) {
    console.log("   ✗ two parallel nodes wrote `overwritten` (no reducer) -> THROWS:");
    console.log("     ", err.constructor.name, "|", err.lc_error_code);
    console.log("      => LangGraph refuses to guess which write wins");
  }

  // 5b — the same fan-out, but only writing `collected` (which HAS a reducer)
  const result = await goodFanOut.invoke({ overwritten: "none" });
  console.log("   ✓ with a reducer, both parallel results survive:");
  console.log("      collected:", result.collected);

  // THE PRODUCTION RULE: any field that parallel branches write to MUST have a
  // reducer. This is the #1 state bug in multi-agent systems (Module 4.3) — a
  // supervisor fanning out to 3 researchers will crash on the results field
  // until you decide how their outputs combine. The crash is the feature.
}

// =============================================================================
// RUN ALL
// =============================================================================

async function main() {
  // await reducerPatterns();
   //await messagesState();
  //  await trimmingHistory();
  // await zodState();
   await parallelWrites();

  console.log("\n=============================================================");
  console.log("RECAP");
  console.log("  reducer(current, incoming) -> next   IS your state logic");
  console.log("  3 patterns: overwrite (default) | append | merge {...cur,...next}");
  console.log("  MessagesAnnotation = messages + addMessages (ids, RemoveMessage)");
  console.log("  zod + withLangGraph = same power PLUS runtime validation");
  console.log("  SHIP: MessagesAnnotation for chat state, zod for domain/edge state");
  console.log("  Parallel writes to a no-reducer field THROW (LastValue) - by design");
  console.log("=============================================================");
}

main().catch(console.error);
