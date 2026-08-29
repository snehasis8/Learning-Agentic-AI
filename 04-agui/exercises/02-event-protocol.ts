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

// STEP 1 — the event sequence, in order
// Same shapes validated in A.1's exercise (threadId on RUN_*, messageId on
// TOOL_CALL_RESULT) — reused here since the schema already confirmed them.

const events = [
  { type: EventType.RUN_STARTED, threadId: "thread-1", runId: "run-1" },

  { type: EventType.TOOL_CALL_START, toolCallId: "t1", toolCallName: "searchOrder" },
  { type: EventType.TOOL_CALL_ARGS, toolCallId: "t1", delta: '{"order' },
  { type: EventType.TOOL_CALL_ARGS, toolCallId: "t1", delta: 'Id":"A123' },
  { type: EventType.TOOL_CALL_ARGS, toolCallId: "t1", delta: '"}' },
  { type: EventType.TOOL_CALL_END, toolCallId: "t1" },
  {
    type: EventType.TOOL_CALL_RESULT,
    toolCallId: "t1",
    messageId: "tool-result-1",
    content: "Order A123: SHIPPED, delivered 2026-08-10.",
  },

  { type: EventType.TEXT_MESSAGE_START, messageId: "m1", role: "assistant" },
  { type: EventType.TEXT_MESSAGE_CONTENT, messageId: "m1", delta: "Order " },
  { type: EventType.TEXT_MESSAGE_CONTENT, messageId: "m1", delta: "A123 " },
  { type: EventType.TEXT_MESSAGE_CONTENT, messageId: "m1", delta: "was " },
  { type: EventType.TEXT_MESSAGE_CONTENT, messageId: "m1", delta: "shipped." },
  { type: EventType.TEXT_MESSAGE_END, messageId: "m1" },

  { type: EventType.RUN_FINISHED, threadId: "thread-1", runId: "run-1" },
];

console.log(`Step 1 — ${events.length} events:`);
for (const e of events) console.log(" ", JSON.stringify(e));

// STEP 2 — be the frontend: fold events back into a rendered result.
// Walk the array ONCE. Route every delta by its id (never just concatenate
// blindly) and buffer TOOL_CALL_ARGS as a string, parsing only on END.

function reduceEvents(evts: typeof events) {
  const messages: Record<string, string> = {};
  const toolCalls: Record<string, { name: string; args: unknown; result?: string }> = {};
  const argBuffers: Record<string, string> = {};

  for (const e of evts) {
    switch (e.type) {
      case EventType.TEXT_MESSAGE_START:
        messages[(e as any).messageId] = "";
        break;
      case EventType.TEXT_MESSAGE_CONTENT:
        messages[(e as any).messageId] += (e as any).delta;
        break;

      case EventType.TOOL_CALL_START:
        argBuffers[(e as any).toolCallId] = "";
        toolCalls[(e as any).toolCallId] = { name: (e as any).toolCallName, args: undefined };
        break;
      case EventType.TOOL_CALL_ARGS:
        argBuffers[(e as any).toolCallId] += (e as any).delta;
        break;
      case EventType.TOOL_CALL_END:
        // ONLY here is the buffered string guaranteed to be complete JSON.
        toolCalls[(e as any).toolCallId].args = JSON.parse(argBuffers[(e as any).toolCallId]);
        break;
      case EventType.TOOL_CALL_RESULT:
        toolCalls[(e as any).toolCallId].result = (e as any).content;
        break;

      // TEXT_MESSAGE_END / RUN_STARTED / RUN_FINISHED carry no payload we need
      // to fold in here — they are Pattern-3 signals, not data.
    }
  }

  return { messages, toolCalls };
}

const result = reduceEvents(events);
console.log("\nStep 2 — folded result:");
console.log(JSON.stringify(result, null, 2));

// STEP 3 — validate every event against the REAL spec, not by eye.
console.log("\nStep 3 — schema validation:");
for (const e of events) {
  const r = EventSchemas.safeParse(e);
  console.log(" ", r.success ? "PASS" : "FAIL", e.type);
}

// Break one on purpose: drop the required `toolCallName` field.
const broken = { type: EventType.TOOL_CALL_START, toolCallId: "t9" };
const brokenResult = EventSchemas.safeParse(broken);
console.log("  BROKEN (missing toolCallName):", brokenResult.success);
if (!brokenResult.success) {
  console.log("   ", brokenResult.error.issues[0].message, "at", brokenResult.error.issues[0].path);
}
// ANSWER: dropped `toolCallName`. Error: "Required" at ["toolCallName"].
// Same lesson as A.1/A.2's teaching file - a missing required field never
// shows up by reading the object; the schema is what catches it.

// BONUS — a second message streaming CONCURRENTLY with m1.
const concurrent = [
  { type: EventType.TEXT_MESSAGE_START, messageId: "m1", role: "assistant" },
  { type: EventType.TEXT_MESSAGE_START, messageId: "m2", role: "assistant" },
  { type: EventType.TEXT_MESSAGE_CONTENT, messageId: "m1", delta: "Order " },
  { type: EventType.TEXT_MESSAGE_CONTENT, messageId: "m2", delta: "Meanwhile, " },
  { type: EventType.TEXT_MESSAGE_CONTENT, messageId: "m1", delta: "shipped." },
  { type: EventType.TEXT_MESSAGE_CONTENT, messageId: "m2", delta: "checking stock." },
  { type: EventType.TEXT_MESSAGE_END, messageId: "m1" },
  { type: EventType.TEXT_MESSAGE_END, messageId: "m2" },
];
console.log("\nBonus — two interleaved messages, folded by the SAME reducer:");
console.log(JSON.stringify(reduceEvents(concurrent as any).messages, null, 2));
// ANSWER: if m1 and m2 shared one id, `messages[id] += delta` would append
// BOTH streams into the same string in wire order, producing
// "Order Meanwhile, shipped.checking stock." - garbage, exactly like the
// A.2 PART 1 demo. The id is what makes concurrent streaming decodable at all.

async function main() {
  // all steps run at module load above; nothing further needed here
}

main().catch(console.error);
