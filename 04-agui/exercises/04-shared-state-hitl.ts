/**
 * Exercise — Module A.4: Shared State & HITL over AG-UI  (short — ~20 min)
 *
 * Goal: extend the real pause/resume flow from 04-shared-state-hitl.ts.
 *
 * STEP 1 — Reject path
 *   Hit /chat to get a paused run, note the threadId, then hit /resume with
 *   payload=reject instead of approve. Confirm: no TOOL_CALL_START for
 *   refundOrder appears after resume, and the model's reply reflects the
 *   decline. Print the full event sequence for this path.
 *
 * STEP 2 — A second interrupt reason
 *   Add a SECOND guard: any refund over 100000 cents also requires approval
 *   with reason: "large_amount" (reuse the same approvalGate pattern, or
 *   extend it to accept a reason parameter). Trigger it and confirm the
 *   RUN_FINISHED.outcome.interrupts[0].reason reflects the right one.
 *
 * STEP 3 — Validate the full interrupt outcome shape
 *   Take a captured RUN_FINISHED-with-interrupt event and run it through
 *   EventSchemas.safeParse. Then break it: remove `reason` from one interrupt
 *   object and confirm it fails. Record the exact error in a comment.
 *
 * BONUS — What if the client never resumes?
 *   Nothing in this server expires a pending interrupt. Sketch (in a comment,
 *   no code needed) how you'd add a timeout: what would need to happen to the
 *   thread's state, and which module's tool (hint: 3.5) would you reach for to
 *   check how long a run has been sitting paused?
 *
 * Run: npx tsx 04-agui/exercises/04-shared-state-hitl.ts
 */

import "dotenv/config";

// TODO: Step 1 — reject path, full event sequence

// TODO: Step 2 — a second interrupt reason for large amounts

// TODO: Step 3 — validate + deliberately break an interrupt outcome event

async function main() {
  // TODO: run your steps
}

main().catch(console.error);
