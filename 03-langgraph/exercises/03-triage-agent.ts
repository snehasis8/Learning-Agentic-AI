/**
 * Exercise — Modules 3.2 + 3.3 combined:  SUPPORT TICKET TRIAGE AGENT
 *
 * One build that exercises everything from both modules:
 *   state design + reducers (3.2)   ·   routing + cycles (3.3)
 *
 * THE SHAPE YOU'RE BUILDING
 *
 *            START
 *              |
 *          classify                 (LLM: category + urgency, structured output)
 *              |
 *      ┌───────┴───────┐            conditional edge on category
 *   billing         technical       general ──┐
 *      └───────┬───────┘                      |
 *          enrich                             |   two nodes IN PARALLEL
 *         ┌────┴────┐                         |   (fan-out — needs a reducer!)
 *   checkSentiment  checkPriority             |
 *         └────┬────┘                         |
 *          draftReply <────────────┐          |
 *              |                   │          |
 *           review ────────────────┘          |   cycle: retry if weak
 *              |  (good OR maxAttempts)       |
 *             END <─────────────────────────-─┘
 *
 * ---------------------------------------------------------------------------
 * STEP 1 — State (3.2)
 *   Fields, each with the RIGHT reducer — add a one-line comment justifying each:
 *     ticketText  string                    set once
 *     category    string                    overwritten by classify
 *     customer    Record<string, unknown>   built by DIFFERENT nodes -> merge
 *     findings    string[]                  written by PARALLEL nodes -> append
 *     draft       string                    overwritten each rewrite
 *     score       number                    overwritten by review
 *     attempts    number                    counts up -> sum
 *     costCents   number                    accumulates -> sum
 *
 * STEP 2 — Classify with the LLM (3.3 PART 5)
 *   Use llm.withStructuredOutput() with a zod schema:
 *     { category: "billing" | "technical" | "general", urgent: boolean }
 *   Node returns { category, costCents: 5 }.
 *
 * STEP 3 — Route on the result (3.3 PART 2)
 *   addConditionalEdges("classify", router, pathMap)
 *     billing / technical -> "enrich"
 *     general             -> "draftReply"   (skip enrichment — cheap path)
 *   Keep the router PURE: read state, return a word. No work, no state writes.
 *
 * STEP 4 — Parallel enrichment (3.2 PART 5)
 *   `enrich` fans out to TWO nodes that run together:
 *     checkSentiment -> { findings: ["sentiment: ..."], costCents: 10 }
 *     checkPriority  -> { findings: ["priority: ..."],  costCents: 10 }
 *   Both then flow into `draftReply`.
 *   ✅ PASS when findings has BOTH entries.
 *   🔬 Then break it: make both also write `category`. What error? Revert after.
 *
 * STEP 5 — The review cycle (3.3 PART 3 + 4)
 *   draftReply -> review -> conditional edge:
 *     score >= 7            -> END
 *     attempts >= 3         -> END      (escape hatch — do NOT skip this)
 *     otherwise             -> back to draftReply
 *   Fake the score if you like (e.g. attempts * 3) so the loop terminates.
 *
 * STEP 6 — Prove it works
 *   Run all three ticket types and print category, findings, attempts, costCents:
 *     "I was charged twice this month"      -> billing,   enriched
 *     "the app crashes when I log in"       -> technical, enriched
 *     "just wanted to say thanks!"          -> general,   NOT enriched (cheap path)
 *   Answer in a comment: why does the general path cost less?
 *
 * BONUS — stream it with streamMode "updates" and watch the cycle re-enter
 *   draftReply. That visible loop is what a chain can never do.
 *
 * Run: npx tsx 03-langgraph/exercises/03-triage-agent.ts
 */

import "dotenv/config";
import { StateGraph, Annotation, START, END } from "@langchain/langgraph";
import { llm } from "../../lib/llm.js";
import * as z from "zod";


// TODO: Step 1 — state with justified reducers
const GraphState = Annotation.Root({
  ticketText : Annotation<string>,
  categories : Annotation<string>,
  urgent : Annotation<boolean>,
  customer : Annotation<string[]>({
    reducer:(curr, next) => ( curr.concat(next) )
  }),
  findings : Annotation<string[]>({
    reducer:(curr, next) => ( curr.concat(next) ), 
    default : ()=> []
    }),
  draft : Annotation<string>,
  score : Annotation<number>,
  attempts : Annotation<number>({
    reducer:(curr, next) => ( curr + next ),
    default: ()=> 0
  }),
  costCents : Annotation<number>({
    reducer:(curr, next) => ( curr += next ),
    default: ()=> 0
  })
  
})

type GraphState = typeof GraphState.State;

// preparing zod schema for the structural output
  
const Decision = z.object({
  categories : z.enum(["billing" , "technical" , "general"]),
  urgent : z.boolean()
})  

// TODO: Step 2 — classify node (LLM + structured output)
 async function  classify(state: GraphState)  {
    const decider  =  llm.withStructuredOutput(Decision) ;
    const result = await decider.invoke(  `Classify this text.\n Message  ${state.ticketText}` );
   
    console.log('In classify Node ')
    console.log('returing object shape  :'  , 'Step 1')
    console.log(`categories : ${result.categories},
      urgent : ${result.urgent ? true :false},
      costCents:5`)
    return {
      categories : result.categories,
      urgent : result.urgent ? true :false,
      costCents:5
    }
  }

// TODO: Step 3 — pure router + path map

function router (state : GraphState ,){

  return state.categories;
}

// TODO: Step 4 — parallel enrichment nodes
function enrich(state:GraphState){

  console.log('This is enrich' , "Step 3");

 console.log(state.findings)

return {
  costCents : 5,
  attempts: 1 ,
  
}

}


// TODO: Step 5 — draftReply, review, and the retry cycle

function draftReply(state:GraphState){
  console.log('draft State inititated' , 'no of attempts :' , state.attempts)
  
  let pass = false ;

  if(state.findings.length > 0){
  pass = true
  }
if(pass){
return {
  costCents: 5,
  attempts :1,
  draft: `draft v${state.attempts + 1} for ${state.categories}`,
  score: state.attempts * 3
}
}else {
  return {draft:'findings not completed'}
}

}

function checkSentiment (state:GraphState){
  console.log('check sentiment node ' , "sub part step 3 a");
  console.log(state.urgent);

  return {
   costCents : 10,
   findings : [ `sentiment : ${state.urgent ? "sentiment is angry" : "sentiment is ok " }`]
  }

}

function checkPriority (state:GraphState){
  console.log('subpart step 3b')
 return {
   costCents : 10,
    findings : [ `priority : ${state.urgent ? "priority high" : "priority low"}`]
  }
}

function reviewNodeRouter (state:GraphState){

if(state.categories === "general"){
  return "end"
}
  if (state.score >= 7 || state.attempts>=3 ) {
   return "end"
  }else{
    return "shouldEnd"
  }

  
}

function reviewNode (state:GraphState){
  return {score : state.score , 
    attempts : state.attempts
  }
}



// TODO: Step 6 — build, compile, run all three ticket types

const graph = new StateGraph(GraphState)
.addNode("classify" , classify)
.addNode("enrich" , enrich)
.addNode("draftReply", draftReply)
.addNode("checkSentiment", checkSentiment)
.addNode("checkPriority",checkPriority)
.addNode("review", reviewNode)
.addEdge(START , "classify")
.addConditionalEdges("classify",router, {
  billing :"enrich",
  technical:"enrich",
  general:"draftReply"
})
.addEdge("enrich", "checkPriority")
.addEdge("enrich","checkSentiment")
.addEdge("checkPriority","draftReply")
.addEdge("checkSentiment","draftReply")
.addEdge("draftReply", "review")
.addConditionalEdges("review", reviewNodeRouter , {  shouldEnd : "draftReply" ,  end :END})
.compile()

async function main() {
//  const drawResult = await graph.getGraph().drawMermaid()
//   console.log(drawResult);
  // TODO: call your steps
 const result = await graph.invoke({ticketText:'I was charged twice this month , no worries it is one ruppes only'});
 const result2 = await graph.invoke({ticketText:"just wanted to say thanks! "});
 console.log(result);
 console.log(result2);
}

main().catch(console.error);
