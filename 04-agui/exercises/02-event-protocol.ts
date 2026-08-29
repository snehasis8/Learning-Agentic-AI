/**
 * Exercise — Module A.2: The Event Protocol  (short — ~20 min)
 *
 * Goal: be the frontend. Turn a stream of events back into a rendered result.
 *
 * STEP 1 — Write the event sequence by hand
 *   An agent answers "What's the status of order A123?" by calling one tool,
 *   then replying. Write that run as an array of AG-UI events, in order.
 *   Use EventType for the `type` values.
 *   You need roughly:
 *     RUN_STARTED
 *     TOOL_CALL_START / _ARGS (2-3 fragments) / _END / _RESULT
 *     TEXT_MESSAGE_START / _CONTENT (3-4 deltas) / _END
 *     RUN_FINISHED
 *   Invent your own ids (e.g. "t1", "m1").
 *
 * STEP 2 — Be the frontend: fold the events back into a result
 *   Write a reducer that walks your array once and produces:
 *     { messages: { m1: "Order A123 was shipped." },
 *       toolCalls: { t1: { name: "searchOrder", args: {...}, result: "..." } } }
 *   Rules you must respect:
 *     - route every delta by its id (do NOT just concatenate)
 *     - buffer TOOL_CALL_ARGS as a string; JSON.parse only on TOOL_CALL_END
 *   Print the result.
 *
 * STEP 3 — Validate every event against the real spec
 *   import { EventSchemas } from "@ag-ui/core";
 *   Run EventSchemas.safeParse() over each event; print PASS/FAIL.
 *   Then BREAK one on purpose (drop a required field, or misspell a field name)
 *   and record in a comment: which field, and what the error said.
 *
 * BONUS — a second message streaming at the same time
 *   Add a second message (id "m2") whose deltas interleave with m1's.
 *   Confirm your STEP 2 reducer still separates them correctly.
 *   Answer in a comment: what would break if both used the same id?
 *
 * Run: npx tsx 04-agui/exercises/02-event-protocol.ts
 */

import { EventType, EventSchemas } from "@ag-ui/core";

// TODO: Step 1 — the event sequence, in order

// TODO: Step 2 — the reducer that folds events back into { messages, toolCalls }

// TODO: Step 3 — validate each event, then break one and record the error

async function main() {
  // TODO: run your steps
}

main().catch(console.error);
