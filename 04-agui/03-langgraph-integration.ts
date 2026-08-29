/**
 * Module A.3 — LangGraph + AG-UI Integration
 *
 * WHAT YOU'LL LEARN:
 *   - What LangGraph's streamMode:"messages" actually emits for a tool-calling
 *     agent (real data, not the toy examples from A.1/A.2)
 *   - Writing your OWN translator: LangGraph chunks -> real AG-UI events
 *   - Serving that over SSE from a plain http server (your s5 pattern, for real)
 *   - The first tiny HTML client, using the browser's native EventSource
 *
 * WHY WE ARE NOT USING @ag-ui/langgraph HERE:
 *   That package's `LangGraphAgent` requires `deploymentUrl` + `graphId` - it
 *   talks HTTP to a DEPLOYED LangGraph Platform server (Module 5.4 territory).
 *   It does not wrap a local, in-process .compile()'d graph. Writing the
 *   translator ourselves is ~40 lines, needs no deployment, and teaches you
 *   exactly what that package automates - the "build it raw first" pattern
 *   that got you through 3.1-3.6 and A.1-A.2.
 *
 * Run: npx tsx 04-agui/03-langgraph-integration.ts
 *   then open http://localhost:4903 in a browser, or:
 *   curl -N "http://localhost:4903/chat?q=What%27s+the+status+of+order+A123%3F"
 */

import "dotenv/config";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { StateGraph, MessagesAnnotation, START, END } from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { tool } from "@langchain/core/tools";
import { AIMessage, HumanMessage, AIMessageChunk } from "@langchain/core/messages";
import { EventType, EventSchemas } from "@ag-ui/core";
import { llm } from "../lib/llm.js";
import * as z from "zod";

// =============================================================================
// PART 1 — The agent (same shape as 3.4 / A.1's exercise)
// =============================================================================
const searchOrder = tool(
  async ({ orderId }) => `Order ${orderId}: SHIPPED, delivered 2026-08-10.`,
  { name: "searchOrder", description: "Look up an order's status by id.",
    schema: z.object({ orderId: z.string() }) },
);
const tools = [searchOrder];
const model = llm.bindTools(tools);

const agent = new StateGraph(MessagesAnnotation)
  .addNode("llm", async (s) => ({ messages: [await model.invoke(s.messages)] }))
  .addNode("tools", new ToolNode(tools))
  .addEdge(START, "llm")
  .addConditionalEdges("llm", (s) => {
    const last = s.messages.at(-1) as AIMessage;
    return last.tool_calls?.length ? "tools" : "done";
  }, { tools: "tools", done: END })
  .addEdge("tools", "llm")
  .compile();

// =============================================================================
// PART 2 — The translator: LangGraph messages -> AG-UI events
// =============================================================================
// streamMode: "messages" yields [AIMessageChunk | ToolMessage, metadata] tuples.
// A single tool call, one at a time, maps onto these transitions:
//
//   tool_call_chunks[0] has a `name`  -> TOOL_CALL_START (first fragment)
//   tool_call_chunks[0] has only args -> TOOL_CALL_ARGS  (every fragment after)
//   message type "tool"               -> TOOL_CALL_END, then TOOL_CALL_RESULT
//   "ai" chunk with real content      -> TEXT_MESSAGE_START (first) / _CONTENT
//
// SIMPLIFICATION: this handles ONE tool call in flight at a time (matches our
// agent). A production adapter also reads streamMode:"updates" for reliable
// node-boundary signals when several tool calls can overlap - see PRODUCTION
// NOTES below.

async function* translateToAgui(userInput: string, threadId: string, runId: string) {
  yield { type: EventType.RUN_STARTED, threadId, runId };

  let openToolCallId: string | null = null;
  let openTextMessageId: string | null = null;

  const stream = await agent.stream(
    { messages: [new HumanMessage(userInput)] },
    { streamMode: "messages" },
  );

  for await (const [msg] of stream as AsyncIterable<[AIMessageChunk, unknown]>) {
    const toolChunks = (msg as any).tool_call_chunks as
      | { id?: string; name?: string; args?: string }[] | undefined;

    if (msg.getType() === "tool") {
      // A tool finished. Close whatever tool call was open, then its result.
      if (openToolCallId) {
        yield { type: EventType.TOOL_CALL_END, toolCallId: openToolCallId };
      }
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
        // first fragment for this tool call
        openToolCallId = c.id!;
        yield { type: EventType.TOOL_CALL_START, toolCallId: c.id, toolCallName: c.name };
      }
      if (c.args) {
        yield { type: EventType.TOOL_CALL_ARGS, toolCallId: openToolCallId, delta: c.args };
      }
      continue;
    }

    if (msg.content) {
      if (!openTextMessageId) {
        openTextMessageId = msg.id ?? crypto.randomUUID();
        yield { type: EventType.TEXT_MESSAGE_START, messageId: openTextMessageId, role: "assistant" };
      }
      yield { type: EventType.TEXT_MESSAGE_CONTENT, messageId: openTextMessageId, delta: String(msg.content) };
    }
    // empty "ai" chunks (no content, no tool_call_chunks) carry no signal - skip.
  }

  if (openTextMessageId) {
    yield { type: EventType.TEXT_MESSAGE_END, messageId: openTextMessageId };
  }
  yield { type: EventType.RUN_FINISHED, threadId, runId };
}

// =============================================================================
// PART 3 — Serve it over SSE (your s5 pattern, now backed by a real agent)
// =============================================================================
const __dirname = fileURLToPath(new URL(".", import.meta.url));
const clientHtml = readFileSync(__dirname + "03-client.html", "utf8");

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");

  if (url.pathname === "/") {
    res.writeHead(200, { "content-type": "text/html" });
    res.end(clientHtml);
    return;
  }

  if (url.pathname === "/chat") {
    const q = url.searchParams.get("q") ?? "What's the status of order A123?";
    res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });

    const threadId = "thread-" + Date.now();
    const runId = "run-" + Date.now();

    for await (const event of translateToAgui(q, threadId, runId)) {
      // PART 4 payoff, reused: never write an event you have not validated.
      const check = EventSchemas.safeParse(event);
      if (!check.success) {
        console.error("INVALID EVENT (not sent):", event, check.error.issues[0]);
        continue;
      }
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    }
    res.end();
    return;
  }

  res.writeHead(404).end();
});

// -----------------------------------------------------------------------------
// PRODUCTION NOTES
// -----------------------------------------------------------------------------
// 1. THIS TRANSLATOR ASSUMES ONE TOOL CALL AT A TIME. Parallel tool calls
//    (Module 3.2's fan-out) need per-index tracking - combine streamMode
//    ["messages", "updates"] and key open calls by (messageId, chunk.index),
//    not a single `openToolCallId` variable.
// 2. VALIDATE BEFORE WRITING. Every event is safeParse'd before res.write() -
//    a malformed event never reaches the client; it is dropped and logged.
// 3. threadId/runId ARE INVENTED HERE. A real client sends its own thread_id
//    on RunAgentInput; the server should honour it, not always mint one.
// 4. THIS IS WHAT @ag-ui/langgraph AUTOMATES for a DEPLOYED LangGraph Platform
//    graph - same translation, handling every edge case (interrupts,
//    subgraphs, parallel calls) that this teaching version simplifies away.

server.listen(4903, () => {
  console.log("A.3 server listening: http://localhost:4903");
  console.log("Open it in a browser, or:");
  console.log('  curl -N "http://localhost:4903/chat?q=What%27s+the+status+of+order+A123%3F"');
});
