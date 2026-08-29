/**
 * Module A.2 — The Event Protocol
 *
 * WHAT YOU'LL LEARN:
 *   - The THREE patterns that every one of the 33 events follows
 *   - Why a message is start/content/end, and why the id is an address
 *   - Why tool arguments arrive as broken JSON on purpose
 *   - snapshot vs delta, and what RFC-6902 JSON Patch actually is
 *   - How to VALIDATE your events against the real spec schemas
 *
 * WHY THIS MATTERS:
 *   A.1 told you WHICH events exist. This is what is INSIDE them. Once you see
 *   the three patterns you never need to memorise the list — you can look at any
 *   event name and know its shape.
 *
 * Run: npx tsx 04-agui/02-event-protocol.ts
 */

import { EventType, EventSchemas } from "@ag-ui/core";

// =============================================================================
// PART 1 — Pattern 1: a streamed thing (start -> content x N -> end)
// =============================================================================
// Anything that arrives gradually uses three events, joined by an id.
// The reason is simple: the UI must draw the container BEFORE the content
// exists. start = "make this", content = "append this", end = "it's finished".

function streamedThings() {
  console.log("\n=== PART 1: start / content / end, joined by an id ===");

  // Two messages streaming AT THE SAME TIME - which is normal for an agent.
  const wire = [
    { type: EventType.TEXT_MESSAGE_START, messageId: "m1", role: "assistant" },
    { type: EventType.TEXT_MESSAGE_START, messageId: "m2", role: "assistant" },
    { type: EventType.TEXT_MESSAGE_CONTENT, messageId: "m1", delta: "Order " },
    { type: EventType.TEXT_MESSAGE_CONTENT, messageId: "m2", delta: "Meanwhile, " },
    { type: EventType.TEXT_MESSAGE_CONTENT, messageId: "m1", delta: "A123 " },
    { type: EventType.TEXT_MESSAGE_CONTENT, messageId: "m2", delta: "checking " },
    { type: EventType.TEXT_MESSAGE_CONTENT, messageId: "m1", delta: "shipped." },
    { type: EventType.TEXT_MESSAGE_CONTENT, messageId: "m2", delta: "stock..." },
    { type: EventType.TEXT_MESSAGE_END, messageId: "m1" },
    { type: EventType.TEXT_MESSAGE_END, messageId: "m2" },
  ];

  // If you ignore the id and just glue deltas together:
  const naive = wire.filter((e: any) => e.delta).map((e: any) => e.delta).join("");
  console.log("   ignoring ids :", JSON.stringify(naive));
  console.log("                  ^ two messages shredded into each other");

  // Grouping by id is all a frontend actually does:
  const bubbles: Record<string, string> = {};
  for (const e of wire as any[]) {
    if (e.type === EventType.TEXT_MESSAGE_START) bubbles[e.messageId] = "";
    if (e.type === EventType.TEXT_MESSAGE_CONTENT) bubbles[e.messageId] += e.delta;
  }
  console.log("   grouped by id:", bubbles);

  // THE POINT: the id is not bookkeeping, it is an ADDRESS. It tells a fragment
  // which container it belongs to. Without it, concurrent streams are lost.
}

// -----------------------------------------------------------------------------
// The same pattern for tools - with one twist worth knowing.
// -----------------------------------------------------------------------------
function toolArgsArriveBroken() {
  console.log("\n=== PART 1b: tool args are PARTIAL JSON, not objects ===");

  // The model writes arguments one token at a time, exactly like it writes text.
  const wire = [
    { type: EventType.TOOL_CALL_START, toolCallId: "t1", toolCallName: "refundOrder" },
    { type: EventType.TOOL_CALL_ARGS, toolCallId: "t1", delta: '{"order' },
    { type: EventType.TOOL_CALL_ARGS, toolCallId: "t1", delta: 'Id":"A1' },
    { type: EventType.TOOL_CALL_ARGS, toolCallId: "t1", delta: '23","amount' },
    { type: EventType.TOOL_CALL_ARGS, toolCallId: "t1", delta: 'Cents":500}' },
    { type: EventType.TOOL_CALL_END, toolCallId: "t1" },
  ];

  let buffer = "";
  for (const e of wire as any[]) {
    if (e.type !== EventType.TOOL_CALL_ARGS) continue;
    buffer += e.delta;
    let status: string;
    try { JSON.parse(buffer); status = "parses OK"; }
    catch { status = "NOT valid JSON yet"; }
    console.log(`   buffer: ${buffer.padEnd(34)} <- ${status}`);
  }
  console.log("   after TOOL_CALL_END ->", JSON.parse(buffer));

  // RULE: buffer the deltas, parse only after END. Parsing early throws.
  // So why stream them at all? Because TOOL_CALL_START already gave the UI the
  // tool NAME - it can show "refundOrder..." while the args are still typing.
}

// =============================================================================
// PART 2 — Pattern 2: shared data (snapshot vs delta)
// =============================================================================
// State is not streamed in fragments; it is either sent whole, or as a diff.

function snapshotVsDelta() {
  console.log("\n=== PART 2: snapshot vs delta ===");

  const state = {
    customer: { name: "Acme Corp", plan: "free", seats: 3 },
    ticket: { id: "A123", status: "open" },
  };

  console.log("   STATE_SNAPSHOT -> the whole object");
  console.log("     ", JSON.stringify(state));

  // A delta is RFC-6902 JSON Patch: an array of tiny operations.
  const patch = [{ op: "replace", path: "/customer/plan", value: "enterprise" }];
  console.log("   STATE_DELTA    -> only what changed (JSON Patch)");
  console.log("     ", JSON.stringify(patch));

  // Applied by hand so it is not magic. Three ops cover almost everything:
  // replace, add, remove.
  const applyPatch = (obj: any, ops: any[]) => {
    const copy = structuredClone(obj);
    for (const { op, path, value } of ops) {
      const keys = path.split("/").slice(1);   // "/customer/plan" -> ["customer","plan"]
      const last = keys.pop()!;
      let target = copy;
      for (const k of keys) target = target[k];
      if (op === "replace" || op === "add") target[last] = value;
      if (op === "remove") delete target[last];
    }
    return copy;
  };

  console.log("   before:", JSON.stringify(state.customer));
  console.log("   after :", JSON.stringify(applyPatch(state, patch).customer));

  // THE RULE: snapshot on connect (the UI needs a baseline), deltas for every
  // change after that. A client that joins late and only gets deltas has
  // nothing to apply them to.
}

// =============================================================================
// PART 3 — Pattern 3: bare signals, and the whole spec on one screen
// =============================================================================
// The third pattern carries no real payload. It just says "this happened".

function threePatterns() {
  console.log("\n=== PART 3: all 33 events are three patterns ===");

  const all = Object.values(EventType) as string[];

  // Derived from the live enum, so this never goes stale if the spec grows.
  const streamed = all.filter((e) => /_(START|CONTENT|ARGS|END|CHUNK)$/.test(e));
  const shared = all.filter((e) => /_(SNAPSHOT|DELTA)$/.test(e));
  const signals = all.filter((e) => /^RUN_|^STEP_/.test(e));
  const other = all.filter((e) => ![...streamed, ...shared, ...signals].includes(e));

  const show = (label: string, list: string[]) => {
    console.log(`\n   ${label}  (${list.length})`);
    console.log(`      ${list.join(", ")}`);
  };

  show("PATTERN 1 - streamed: start/content/end + id", streamed);
  show("PATTERN 2 - shared data: snapshot or delta", shared);
  show("PATTERN 3 - bare signal: 'this happened'", signals);
  show("leftovers - escape hatches + one-offs", other);
  // TOOL_CALL_RESULT sits in "leftovers" only because its NAME does not end in
  // START/ARGS/END - in practice it is the closing beat of the pattern-1 tool
  // sequence. RAW/CUSTOM are the escape hatches; REASONING_ENCRYPTED_VALUE is a
  // genuine one-off (it carries chain-of-thought across turns, opaquely).

  console.log(`\n   ${streamed.length + shared.length + signals.length} of ${all.length} events`);
  console.log("   are the three patterns applied to different subjects.");
  console.log("   Learn the patterns; look the names up when you need them.");
}

// =============================================================================
// PART 4 — Validate against the REAL spec, not your memory
// =============================================================================
// @ag-ui/core ships zod schemas. "Spec-compliant" becomes something you CHECK,
// not something you claim.

function validateEvents() {
  console.log("\n=== PART 4: validating with the real schemas ===");

  const candidates: [string, unknown][] = [
    ["valid text start", { type: "TEXT_MESSAGE_START", messageId: "m1", role: "assistant" }],
    ["valid tool start", { type: "TOOL_CALL_START", toolCallId: "t1", toolCallName: "searchOrder" }],
    ["MISSING messageId", { type: "TEXT_MESSAGE_START", role: "assistant" }],
    ["WRONG field name", { type: "TOOL_CALL_START", toolCallId: "t1", name: "searchOrder" }],
    ["invented event", { type: "TOOL_STARTED", toolCallId: "t1" }],
  ];

  for (const [label, event] of candidates) {
    const result = EventSchemas.safeParse(event);
    if (result.success) {
      console.log(`   PASS  ${label}`);
    } else {
      const issue = result.error.issues[0];
      // the "unknown type" error lists all 33 valid names - trim it for reading
      const msg = issue.message.length > 60
        ? issue.message.slice(0, 60) + "... (lists every valid type)"
        : issue.message;
      console.log(`   FAIL  ${label.padEnd(18)} -> ${msg} at [${issue.path.join(".")}]`);
    }
  }

  // Note "WRONG field name": it is `toolCallName`, not `name`. That is exactly
  // the kind of mistake you cannot catch by eye but a schema catches instantly.
  // Validate at your server boundary and you can never ship a malformed stream.
}

// -----------------------------------------------------------------------------
// PRODUCTION NOTES
// -----------------------------------------------------------------------------
// 1. IDS MUST BE UNIQUE within a run. Reuse one and two streams merge into the
//    wrong bubble - a bug that only shows under concurrency.
// 2. NEVER parse tool args before TOOL_CALL_END. Mid-stream JSON is invalid by
//    design, not by accident.
// 3. SEND A SNAPSHOT ON CONNECT. A client that joins mid-run and receives only
//    deltas has no baseline to apply them to.
// 4. RAW and CUSTOM are escape hatches. Anything you send through them is, by
//    definition, no longer portable to another frontend.
// 5. VALIDATE ON THE WAY OUT. safeParse each event before writing it to the
//    socket; a malformed event fails silently in the browser otherwise.

async function main() {
  streamedThings();
  toolArgsArriveBroken();
  snapshotVsDelta();
  threePatterns();
  validateEvents();

  console.log("\n=============================================================");
  console.log("RECAP");
  console.log("  P1 streamed : start -> content xN -> end, joined by an id");
  console.log("  P2 shared   : snapshot (whole) or delta (JSON Patch)");
  console.log("  P3 signal   : 'this happened', no payload");
  console.log("  the id is an ADDRESS, not bookkeeping");
  console.log("  tool args are partial JSON text - parse only after END");
  console.log("  EventSchemas.safeParse() makes compliance checkable");
  console.log("  NEXT (A.3): emit these from a real LangGraph run");
  console.log("=============================================================");
}

main().catch(console.error);
