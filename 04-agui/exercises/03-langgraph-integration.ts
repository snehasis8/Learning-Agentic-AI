/**
 * Exercise — Module A.3: LangGraph + AG-UI Integration  (short — ~20 min)
 *
 * Goal: extend the real translator from 03-langgraph-integration.ts.
 *
 * STEP 1 — Add a second tool
 *   Add a `calculate` tool (reuse the one from 3.4) alongside searchOrder.
 *   Ask a question needing both in one turn: "What's the status of order A123,
 *   and what is 12 * 7?" Run it through YOUR OWN copy of translateToAgui and
 *   print the raw event stream.
 *
 * STEP 2 — Break the "one tool call at a time" assumption
 *   With two tools requested in the same turn, does the model call them
 *   sequentially or does tool_call_chunks ever show index > 0 in the same
 *   message? Print each chunk's `index` field to find out.
 *   Answer in a comment: did the single `openToolCallId` variable produce a
 *   CORRECT event sequence for this case, or did you spot a bug?
 *
 * STEP 3 — Validate under load
 *   Run 3 different questions through the translator back to back. Collect
 *   ALL emitted events into one array and safeParse every single one.
 *   Print how many passed vs failed.
 *
 * BONUS — A dropped connection
 *   In the real server, kill the SSE response mid-stream (e.g. call res.end()
 *   after 3 events, then keep iterating the generator). What happens to the
 *   agent run on the server side — does it keep going, wasting the rest of the
 *   LLM call? Answer in a comment: what would you need (hint: Module 3.5) to
 *   let a client reconnect and resume instead of losing the run?
 *
 * Run: npx tsx 04-agui/exercises/03-langgraph-integration.ts
 */

import "dotenv/config";

// TODO: Step 1 — second tool + your own translator run

// TODO: Step 2 — inspect chunk.index under two simultaneous tool calls

// TODO: Step 3 — validate a batch of runs' events

async function main() {
  // TODO: run your steps
}

main().catch(console.error);
