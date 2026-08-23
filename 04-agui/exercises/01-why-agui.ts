/**
 * Exercise — Module A.1: Why AG-UI  (short — ~15 min, no frontend)
 *
 * Goal: feel the gap yourself, by hand-translating a real agent run.
 *
 * STEP 1 — Capture a run
 *   Build (or copy) a small tool-calling agent. Stream it with
 *   streamMode: "updates" and log every chunk verbatim.
 *
 * STEP 2 — Answer, in comments, from YOUR output:
 *   a) Which chunk tells a UI the run has STARTED?
 *   b) Which tells it a tool is RUNNING (not finished)?
 *   c) If you renamed your "llm" node to "brain", what would break in a
 *      frontend written against this stream?
 *
 * STEP 3 — Hand-translate to AG-UI
 *   Write the sequence of AG-UI events your run WOULD emit, as an array of
 *   plain objects (no library calls needed — just the shapes). Use EventType
 *   from "@ag-ui/core" for the type values. Aim for something like:
 *     RUN_STARTED -> TOOL_CALL_START -> TOOL_CALL_ARGS -> TOOL_CALL_END
 *       -> TOOL_CALL_RESULT -> TEXT_MESSAGE_START -> ..._CONTENT -> ..._END
 *       -> RUN_FINISHED
 *   Print them in order.
 *   Answer in a comment: which ids did you have to invent, and what would
 *   break if two tool calls shared one id?
 *
 * BONUS — Where does approval fit?
 *   Your 3.6 agent paused with interrupt() carrying a payload. Look at the 33
 *   event types and decide which one(s) you would use to get that payload to a
 *   browser. Justify it in a comment. (There is no single "right" answer — the
 *   reasoning is the exercise. A.4 shows what the LangGraph integration does.)
 *
 * Run: npx tsx 04-agui/exercises/01-why-agui.ts
 */

import "dotenv/config";
import { EventType } from "@ag-ui/core";

// TODO: Step 1 — capture a run with streamMode "updates"

// TODO: Step 2 — your three answers, in comments

// TODO: Step 3 — the hand-written AG-UI event sequence

async function main() {
  // TODO: run your steps
}

main().catch(console.error);
