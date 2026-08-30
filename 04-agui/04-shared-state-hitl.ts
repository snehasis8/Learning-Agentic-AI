/**
 * Module A.4 — Shared State & HITL over AG-UI
 *
 * WHAT YOU'LL LEARN:
 *   - How a paused (interrupt()'d) run actually surfaces in an AG-UI stream
 *   - RUN_FINISHED.outcome — pausing is a FLAVOR of "finished", not a new event
 *   - Resuming: the browser's decision travels back as RunAgentInput.resume[]
 *   - STATE_SNAPSHOT / STATE_DELTA for live shared state alongside messages
 *
 * WHY THIS MATTERS:
 *   Your 3.6 interrupt()/Command({resume}) code is REUSED UNCHANGED here — this
 *   module is just the wire format around it. Once an agent can pause for a
 *   human, the browser needs to render that pause as a real UI, and needs a way
 *   to send the human's decision back. This is the last AG-UI module.
 *
 * Run: npx tsx 04-agui/04-shared-state-hitl.ts
 *   then open http://localhost:4904 in a browser, or:
 *   curl -N "http://localhost:4904/chat?q=Refund+order+A123+5000+cents"
 */

import "dotenv/config";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  StateGraph, MessagesAnnotation, MemorySaver, START, END, interrupt, Command,
} from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { tool } from "@langchain/core/tools";
import { AIMessage, HumanMessage, AIMessageChunk, ToolMessage } from "@langchain/core/messages";
import { EventType, EventSchemas } from "@ag-ui/core";
import { llm } from "../lib/llm.js";
import * as z from "zod";

// =============================================================================
// PART 1 — An agent with an approval-gated tool (same code as 3.6, no changes)
// =============================================================================
const searchOrder = tool(
  async ({ orderId }) => `Order ${orderId}: SHIPPED, delivered 2026-08-10.`,
  { name: "searchOrder", description: "Look up an order's status by id.",
    schema: z.object({ orderId: z.string() }) },
);

// The refund tool itself does no gating - the GRAPH gates it, via a guard node.
const refundOrder = tool(
  async ({ orderId, amountCents }) => `Refund of ${amountCents}c issued for order ${orderId}.`,
  { name: "refundOrder", description: "Refund an order for a given amount in cents.",
    schema: z.object({ orderId: z.string(), amountCents: z.number() }) },
);

const tools = [searchOrder, refundOrder];
const toolNode = new ToolNode(tools);
const model = llm.bindTools(tools);

// Guard node: sits between "llm deciding to refund" and "the refund executing".
// The interrupt's VALUE is shaped to match AG-UI's Interrupt schema fields
// directly (reason, message, toolCallId) - that is a deliberate design choice
// that makes the translator below a near-zero-effort mapping.
function approvalGate(state: typeof MessagesAnnotation.State) {
  const last = state.messages.at(-1) as AIMessage;
  const call = last.tool_calls!.find((c) => c.name === "refundOrder")!;

  const decision = interrupt({
    reason: "approval_needed",
    message: `Approve refund of ${call.args.amountCents}c for order ${call.args.orderId}?`,
    toolCallId: call.id,
  });

  if (decision !== "approve") {
    return { messages: [new ToolMessage({ tool_call_id: call.id!, content: "Refund declined by reviewer." })] };
  }
  return {}; // approved: NO message change - the router below reads that as "go run it"
}

// ONE router per node. "llm" has exactly one outgoing decision: done, or which
// node handles the requested tool.
function routeFromLlm(state: typeof MessagesAnnotation.State): string {
  const last = state.messages.at(-1) as AIMessage;
  if (!last.tool_calls?.length) return "done";
  if (last.tool_calls.some((c) => c.name === "refundOrder")) return "approve";
  return "tools";
}

// "approve" has exactly one outgoing decision: declined (a ToolMessage now
// exists - go tell the model) vs approved (state unchanged - go execute it).
function routeFromApprove(state: typeof MessagesAnnotation.State): string {
  const last = state.messages.at(-1);
  return last?.getType() === "tool" ? "llm" : "tools";
}

const agent = new StateGraph(MessagesAnnotation)
  .addNode("llm", async (s) => ({ messages: [await model.invoke(s.messages)] }))
  .addNode("approve", approvalGate)
  .addNode("tools", toolNode)
  .addEdge(START, "llm")
  .addConditionalEdges("llm", routeFromLlm, { approve: "approve", tools: "tools", done: END })
  .addConditionalEdges("approve", routeFromApprove, { llm: "llm", tools: "tools" })
  .addEdge("tools", "llm")
  .compile({ checkpointer: new MemorySaver() });

// =============================================================================
// PART 2 — The translator, extended for interrupts + shared state
// =============================================================================
// KEY FINDING (verified by probing, not assumed): streamMode:"messages" yields
// NOTHING while a run is paused - interrupt() stops execution before any
// message is produced. The only way to detect the pause is to check
// getState() AFTER the stream loop ends normally.

// `input` is either a fresh { messages } payload or a Command({resume}) - the
// exact union LangGraph's own .stream() accepts is awkward to spell out here
// and is not the point of this module, so it's typed loosely on purpose.
async function* translateToAgui(
  input: any,
  threadId: string,
  runId: string,
) {
  yield { type: EventType.RUN_STARTED, threadId, runId };
  // A tiny piece of SHARED STATE, sent as a snapshot up front (A.2's rule:
  // snapshot on connect, deltas thereafter).
  yield { type: EventType.STATE_SNAPSHOT, snapshot: { approvalStatus: "none" } };

  let openToolCallId: string | null = null;
  let openTextMessageId: string | null = null;

  const stream = await agent.stream(input, {
    configurable: { thread_id: threadId },
    streamMode: "messages",
  });

  for await (const [msg] of stream as AsyncIterable<[AIMessageChunk, unknown]>) {
    const toolChunks = (msg as any).tool_call_chunks as
      | { id?: string; name?: string; args?: string }[] | undefined;

    if (msg.getType() === "tool") {
      if (openToolCallId) yield { type: EventType.TOOL_CALL_END, toolCallId: openToolCallId };
      yield {
        type: EventType.TOOL_CALL_RESULT,
        toolCallId: (msg as any).tool_call_id,
        messageId: msg.id ?? crypto.randomUUID(),
        content: String(msg.content),
      };
      openToolCallId = null;
      continue;
    }
    if (toolChunks?.length) {
      const c = toolChunks[0];
      if (c.name) {
        openToolCallId = c.id!;
        yield { type: EventType.TOOL_CALL_START, toolCallId: c.id, toolCallName: c.name };
      }
      if (c.args) yield { type: EventType.TOOL_CALL_ARGS, toolCallId: openToolCallId, delta: c.args };
      continue;
    }
    if (msg.content) {
      if (!openTextMessageId) {
        openTextMessageId = msg.id ?? crypto.randomUUID();
        yield { type: EventType.TEXT_MESSAGE_START, messageId: openTextMessageId, role: "assistant" };
      }
      yield { type: EventType.TEXT_MESSAGE_CONTENT, messageId: openTextMessageId, delta: String(msg.content) };
    }
  }
  if (openTextMessageId) yield { type: EventType.TEXT_MESSAGE_END, messageId: openTextMessageId };

  // THE PAYOFF: check whether the run is paused, not finished.
  const snap = await agent.getState({ configurable: { thread_id: threadId } });
  const pending = snap.tasks?.[0]?.interrupts as { id: string; value: any }[] | undefined;

  if (pending?.length) {
    // A shared-state delta: the UI's "approval pending" indicator flips on.
    yield { type: EventType.STATE_DELTA, delta: [{ op: "replace", path: "/approvalStatus", value: "pending" }] };
    yield {
      type: EventType.RUN_FINISHED,
      threadId, runId,
      outcome: {
        type: "interrupt",
        // .value was shaped to match AG-UI's Interrupt fields directly - see approvalGate().
        interrupts: pending.map((p) => ({ id: p.id, ...p.value })),
      },
    };
  } else {
    yield { type: EventType.STATE_DELTA, delta: [{ op: "replace", path: "/approvalStatus", value: "resolved" }] };
    yield { type: EventType.RUN_FINISHED, threadId, runId };
  }
}

// =============================================================================
// PART 3 — Serve it: one endpoint starts a run, one endpoint resumes it
// =============================================================================
const __dirname = fileURLToPath(new URL(".", import.meta.url));
const clientHtml = readFileSync(__dirname + "04-client.html", "utf8");

function writeEvents(res: import("node:http").ServerResponse, gen: AsyncGenerator<any>) {
  return (async () => {
    for await (const event of gen) {
      const check = EventSchemas.safeParse(event);
      if (!check.success) { console.error("INVALID EVENT (not sent):", event, check.error.issues[0]); continue; }
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    }
    res.end();
  })();
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");

  if (url.pathname === "/") {
    res.writeHead(200, { "content-type": "text/html" });
    res.end(clientHtml);
    return;
  }

  if (url.pathname === "/chat") {
    const q = url.searchParams.get("q") ?? "Refund order A123 5000 cents";
    const threadId = "thread-" + Date.now();
    const runId = "run-" + Date.now();
    res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
    // Tell the client which thread this is, so it can resume later.
    res.write(`data: ${JSON.stringify({ type: "THREAD_ID", threadId })}\n\n`);
    await writeEvents(res, translateToAgui({ messages: [new HumanMessage(q)] }, threadId, runId));
    return;
  }

  if (url.pathname === "/resume") {
    const threadId = url.searchParams.get("threadId")!;
    const payload = url.searchParams.get("payload") ?? "reject";
    const runId = "run-" + Date.now();
    res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
    // This IS your 3.6 code, unchanged - AG-UI's resume[] just carries the value here.
    await writeEvents(res, translateToAgui(new Command({ resume: payload }), threadId, runId));
    return;
  }

  res.writeHead(404).end();
});

// -----------------------------------------------------------------------------
// PRODUCTION NOTES
// -----------------------------------------------------------------------------
// 1. THIS SERVER USES A CUSTOM "THREAD_ID" EVENT (not in the 33) so the client
//    knows what to resume. AG-UI's real convention: the client generates its
//    OWN threadId up front and sends it on every request, including the first -
//    it does not wait for the server to mint one. Simplified here for brevity.
// 2. THE INTERRUPT VALUE SHAPE IS A CHOICE, NOT A REQUIREMENT. interrupt() can
//    carry anything; shaping it as {reason, message, toolCallId} up front is
//    what makes `{ id: p.id, ...p.value }` a valid mapping with zero translation
//    logic. A different team's interrupt() payloads would need a real mapper.
// 3. STATE_SNAPSHOT/DELTA HERE ARE ILLUSTRATIVE. A real app's shared state is
//    usually the whole relevant slice of your domain object (order details,
//    form fields), not a single status string - same JSON Patch mechanics, more
//    fields.
// 4. IN PRODUCTION (per your own question a moment ago): @ag-ui/langgraph's
//    LangGraphAgent handles interrupt translation like this automatically, once
//    your graph is deployed to LangGraph Platform - Module 5.4.

server.listen(4904, () => {
  console.log("A.4 server listening: http://localhost:4904");
  console.log('Ask something that refunds, e.g. "Refund order A123 5000 cents"');
});
