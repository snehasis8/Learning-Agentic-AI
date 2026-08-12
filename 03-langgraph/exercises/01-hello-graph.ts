/**
 * Exercise — Module 3.1: Hello Graph
 *
 * CHALLENGE: Build a "text processing pipeline" as a graph, from scratch.
 *
 * You will build a graph that takes a raw sentence and runs it through several
 * processing steps, keeping an audit trail of everything that happened.
 *
 * STEP 1 — Define the state
 *   Create an Annotation.Root with these fields:
 *     - text:      string          (the sentence being transformed)
 *     - wordCount: number          (how many words the CURRENT text has)
 *     - log:       string[]        (an audit trail — MUST accumulate, not overwrite)
 *   Hint: only `log` needs a custom reducer + default.
 *
 * STEP 2 — Write three nodes
 *   a) `clean`      — trim whitespace and collapse multiple spaces into one
 *                     Hint: text.trim().replace(/\s+/g, " ")
 *   b) `countWords` — set wordCount from the current text
 *   c) `titleCase`  — capitalise the first letter of every word
 *   Each node must also append a line to `log` describing what it did.
 *
 * STEP 3 — Wire and compile the graph
 *   Order: START -> clean -> countWords -> titleCase -> END
 *   Invoke it with a messy sentence, e.g. "   the   quick  brown fox   "
 *   Print the final state.
 *
 * STEP 4 — Prove the reducer works
 *   Print `log` and confirm it contains THREE entries (one per node), not one.
 *   Answer in a comment: what would happen if you removed the custom reducer?
 *
 * STEP 5 — Stream it
 *   Re-run the same graph with .stream() instead of .invoke().
 *   Print each chunk. Answer in a comment: what shape is each chunk?
 *
 * STEP 6 — Change the flow WITHOUT touching the nodes
 *   Build a second graph that runs: START -> clean -> titleCase -> countWords -> END
 *   (countWords now runs LAST). Only the edges change — reuse the same functions.
 *   Answer in a comment: why is the final `wordCount` the same or different?
 *
 * BONUS A — Add an LLM node
 *   Add a `summarise` node that asks the model for a 5-word summary of `text`,
 *   storing it in a new state field. Import { llm } from "../../lib/llm.js".
 *
 * BONUS B — Break it on purpose (learn the failure modes)
 *   1. Remove `default: () => []` from `log` and run it. What error do you get? Why?
 *   2. Make a node return the ENTIRE state instead of a partial update.
 *      Does it still work? What does that tell you about how merging works?
 *
 * Run: npx tsx 03-langgraph/exercises/01-hello-graph.ts
 */

import "dotenv/config";
import { StateGraph, Annotation, START, END } from "@langchain/langgraph";
// Uncomment for BONUS A:
// import { llm } from "../../lib/llm.js";

// TODO: Step 1 — Define your state schema
const PipelineState = Annotation.Root({
  text : Annotation<string>,
  wordCount: Annotation<number> , 
  log: Annotation<string[]>( {
    reducer: (prevLogs , currentLogs)=>{
      return  prevLogs.concat(currentLogs)
    },
      default:  ()=> []
  } )

  });

  type stateType = typeof PipelineState.State;

// TODO: Step 2a — the `clean` node

function clean( state : stateType){

    const text = state.text.trim().replace(/\s+/g, " ");
    return {
      text: text,
      log:["Clean Function"]
    }

}

// TODO: Step 2b — the `countWords` node


function countWords(state : stateType){
  const wordCount = state.text.split(' ').length
    return{
      wordCount: wordCount,
      log:["Count words"]
    }
}

// TODO: Step 2c — the `titleCase` node

function titleCase(state: stateType) {
  // A string is already indexable and sliceable — no need to split it into chars.
  //   word[0]        -> first character
  //   word.slice(1)  -> everything after it
  // The `word ? ... : word` guard covers empty strings, since ""[0] is undefined
  // and would produce the literal text "undefined".
  const titleCased = state.text
    .split(" ")
    .map((word) => (word ? word[0].toUpperCase() + word.slice(1) : word))
    .join(" ");

  return {
    text: titleCased,
    log: ["Title Case"],
  };
}

// TODO: Step 3 — build, compile, and invoke the graph

const graph = new StateGraph(PipelineState)

.addNode("clean", clean)
.addNode("wordCounter", countWords)
.addNode("titleCase", titleCase)
.addEdge(START , "clean")
.addEdge("clean","wordCounter")
.addEdge("wordCounter","titleCase")
.addEdge("titleCase", END)
.compile()

const secondGraph = new StateGraph(PipelineState)
.addNode("clean", clean)
.addNode("wordCounter", countWords)
.addNode("titleCase", titleCase)
.addEdge(START , "clean")
.addEdge("clean","titleCase")
.addEdge("titleCase","wordCounter")
.compile()

// TODO: Step 4 — print the log and verify three entries

 //loging is happening in each and every function 
 // the main reason for adding the reducers because if I don't add reducers it will not accumulate the log , 
  // rest of the state items are replacing the value  only the log is accumulating 

// TODO: Step 5 — run the same graph with .stream()

 // so I have implemented stream mode , and I have tested two different streamMode  "values " & "update"
 // value will give me the each steps what is going on . 
 // and update is only giving what each node is returning to me. that's the main difference that I have found.

// TODO: Step 6 — second graph with reordered edges
//  yes the word count is going to be the same , titleCase is just capitalizing the word , it will be same 9.
// I just to need to change the edges if I need to change the order.
// but if we don't run the clean node first there will be difference and might break as well due to empty spaces

// ---------------------------------------------------------------------------
// BONUS A — Add an LLM node
// ---------------------------------------------------------------------------
// A `summarise` node needs exactly three things, nothing special:
//   1. a new field on the state (e.g. `summary: Annotation<string>`)
//   2. an async node function that calls llm.invoke(...) and returns { summary }
//   3. one more edge to place it in the flow
// The key insight: the LLM is NOT part of the graph. A node is just a function,
// so it can call a model, a database, or an API. The graph neither knows nor
// cares what happens inside a node — it only merges whatever the node returns.

// ---------------------------------------------------------------------------
// BONUS B.1 — Removing `default: () => []` from the reducer
// ---------------------------------------------------------------------------
// VERIFIED: it does NOT throw. The graph still runs and log === ["from A"].
// LangGraph treats the FIRST write as the initial value instead of reducing
// onto undefined — the same way JS `[1,2,3].reduce((a,b) => a+b)` uses the
// first element as the accumulator when no initial value is supplied.
//
// Still worth setting `default` explicitly, because it:
//   - makes the "node never ran" case predictable (you get [] instead of undefined)
//   - documents the intended starting value for the next reader

// ---------------------------------------------------------------------------
// BONUS B.2 — A node returning the ENTIRE state instead of a partial update
// ---------------------------------------------------------------------------
// VERIFIED: this SILENTLY CORRUPTS accumulating fields.
// A node that returns { ...state, text: "world" } hands the EXISTING log back.
// The reducer then does exactly what it was told:  ["a"].concat(["a"])
//   final log: [ "a", "a" ]      <- duplicated
//   correct:   [ "a" ]
//
// Field-by-field impact:
//   - overwrite reducer (text, wordCount) -> harmless, same value written twice
//   - accumulating reducer (log)          -> data duplicated on every node
//
// THE PRODUCTION LESSON: "return only what you changed" is not a style rule.
// There is no error and no warning — just wrong data. This is how agent message
// histories silently double in size, blowing up context windows and token cost.

async function main() {
  // TODO: call your steps here
    
  const result = await secondGraph.invoke( {text:"The quick brown fox jumps over the lazy dog      "}) ;
  console.log(result)
  console.log("-----------RESULT----------------");


  for await ( let chunk of await graph.stream( {text:"The quick brown fox jumps over the lazy dog      "} , {streamMode : "values"} )) {
     console.log("-----------Strem Result----------------");
     console.log(chunk)
  } ;



}

main().catch(console.error);
