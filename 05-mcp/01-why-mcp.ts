/**
 * Module M.1 — Why MCP (an Express server your agent can call)
 *
 * WHAT YOU'LL LEARN:
 *   - What a "tool" really is: a DESCRIPTION and an IMPLEMENTATION, bolted together
 *   - Why those two halves don't have to live in the same process
 *   - JSON-RPC: three agreed field names, and why each one exists
 *   - tools/list and tools/call — the only two methods that matter
 *   - Plugging an MCP server into the 3.4 agent loop, unchanged
 *
 * WHY THIS MATTERS:
 *   In 1.5 and 3.4 you wrote tools with `tool()`. They work, but they're welded
 *   to your process, your language, your repo, your framework. MCP unwelds them.
 *   Your project uses `mcp-use` and GitHub MCP — both are thin wrappers over
 *   what's in this file.
 *
 * Run: npx tsx 05-mcp/01-why-mcp.ts
 */

import "dotenv/config";
import express from "express";
import { tool } from "@langchain/core/tools";
import { HumanMessage, AIMessage, ToolMessage } from "@langchain/core/messages";
import { llm } from "../lib/llm.js";
import * as z from "zod";

const PORT = 5100;
const URL = `http://localhost:${PORT}/mcp`;

// =============================================================================
// PART 1 — What a "tool" actually is
// =============================================================================
// Here's the kind of tool you've written since 1.5.

const getWeatherLocal = tool(async ({ city }) => `It is 18°C and raining in ${city}.`, {
  name: "getWeather",
  description: "Get the current weather for a city.",
  schema: z.object({ city: z.string() }),
});

async function whatAToolReallyIs() {
  console.log("\n=== PART 1: a tool is TWO things ===");
  console.log("   calling it directly:", await getWeatherLocal.invoke({ city: "Amsterdam" }));

  // Look at what you passed to tool(). It is two completely different things:
  //
  //   DESCRIPTION                        IMPLEMENTATION
  //   name + description + schema        async ({city}) => "..."
  //          │                                   │
  //          ▼                                   ▼
  //   goes into the PROMPT               runs in YOUR process
  //   read by the MODEL                  the model never sees it
  //   needed at PROMPT time              needed at EXECUTION time
  //
  // KEY INSIGHT: two different consumers, at two different moments.
  // bindTools() only ever serialises the DESCRIPTIONS into the API request.
  // It never touches your function body.
  //
  // So nothing — nothing at all — requires those two halves to live in the
  // same process. That single observation is the whole of MCP.
}

// =============================================================================
// PART 2 — An MCP server is an Express server
// =============================================================================
// No SDK, no magic. One endpoint, JSON in, JSON out.
//
// The client and server agree on three field names in that JSON:
//
//     method   what do you want?
//     params   with which arguments?
//     id       a ticket number, so replies can be matched to requests
//
// That agreement has a name: JSON-RPC 2.0. It is nothing more than those
// field names written down, which is why this file installs nothing to use it.

// ── HALF 1: the DESCRIPTIONS (what the model will read) ──────────────────────
// Plain JSON Schema, not zod — MCP is language-agnostic, so the wire format
// can't depend on a JavaScript library. A Python client reads this too.
const TOOLS = [
  {
    name: "getWeather",
    description: "Get the current weather for a city.",
    inputSchema: {
      type: "object",
      properties: { city: { type: "string", description: "City name" } },
      required: ["city"],
    },
  },
  {
    name: "addNumbers",
    description: "Add two numbers together.",
    inputSchema: {
      type: "object",
      properties: { a: { type: "number" }, b: { type: "number" } },
      required: ["a", "b"],
    },
  },
];

// ── HALF 2: the IMPLEMENTATIONS (the model never sees these) ─────────────────
const IMPLS: Record<string, (args: any) => string> = {
  getWeather: ({ city }) => `It is 4°C, windy, with sleet in ${city}.`,
  addNumbers: ({ a, b }) => `${a} + ${b} = ${a + b}`,
};

// The entire server logic. Note what is NOT here: no express, no req, no res.
// It has no idea how the message arrived, which is exactly the point — swap
// HTTP for a pipe (stdio) and this function doesn't change.
function handle(method: string, params: any) {
  switch (method) {
    case "tools/list":
      return { tools: TOOLS }; // "here's what I have"

    case "tools/call": {
      const impl = IMPLS[params.name];
      if (!impl) throw new Error(`Unknown tool: ${params.name}`);
      // Always a content ARRAY — one call may return text AND an image AND more.
      return { content: [{ type: "text", text: impl(params.arguments) }] };
    }

    default:
      throw new Error(`Method not found: ${method}`);
  }
}

function startServer() {
  const app = express();
  app.use(express.json());

  app.post("/mcp", (req, res) => {
    const { id, method, params } = req.body;
    try {
      res.json({ jsonrpc: "2.0", id, result: handle(method, params) });
    } catch (e) {
      // A failed CALL is not a failed REQUEST. The HTTP status stays 200 and
      // the failure rides inside the JSON. Two layers, two kinds of error —
      // conflating them is a classic bug.
      res.json({ jsonrpc: "2.0", id, error: { code: -32601, message: (e as Error).message } });
    }
  });

  return app.listen(PORT);
}

// The client half: send a JSON-RPC message, get one back.
let nextId = 1;
async function askServer(method: string, params: any = {}) {
  const res = await fetch(URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: nextId++, method, params }),
  });
  const msg: any = await res.json();
  if (msg.error) throw new Error(`[${msg.error.code}] ${msg.error.message}`);
  return msg.result;
}

// =============================================================================
// PART 3 — Discover, then call
// =============================================================================
async function discoverAndCall() {
  console.log("\n=== PART 3: the two methods that matter ===");

  // DISCOVERY. The client hardcodes nothing — it ASKS what exists. That's the
  // payoff: the server adds a tool and every client sees it, with no redeploy.
  const { tools } = await askServer("tools/list");
  console.log("   tools/list ->", tools.map((t: any) => t.name).join(", "));

  const result = await askServer("tools/call", {
    name: "getWeather",
    arguments: { city: "Dublin" },
  });
  console.log("   tools/call ->", JSON.stringify(result));

  try {
    await askServer("tools/call", { name: "noSuchTool", arguments: {} });
  } catch (e) {
    console.log("   a missing tool ->", (e as Error).message);
  }

  // That's the whole protocol surface for tools. Two methods.
}

// =============================================================================
// PART 4 — Plug it into the 3.4 agent loop
// =============================================================================
async function theAgentLoop() {
  console.log("\n=== PART 4: a real LLM calling a tool it has never heard of ===");

  const { tools } = await askServer("tools/list");

  // THE ONLY GLUE IN THE WHOLE THING: `inputSchema` becomes `parameters`.
  // That one rename is the entire bridge between MCP and your agent.
  const model = llm.bindTools(
    tools.map((t: any) => ({
      type: "function",
      function: { name: t.name, description: t.description, parameters: t.inputSchema },
    })),
  );

  // From here down it is byte-for-byte the loop from module 3.4.
  const messages: any[] = [new HumanMessage("What's the weather in Amsterdam?")];

  const first = (await model.invoke(messages)) as AIMessage;
  messages.push(first);
  console.log("   model requested:", JSON.stringify(first.tool_calls));

  for (const call of first.tool_calls ?? []) {
    // The model NAMED a tool. YOU go and run it — over HTTP, on another server.
    const out = await askServer("tools/call", { name: call.name, arguments: call.args });
    console.log("   server executed  ->", out.content[0].text);
    messages.push(new ToolMessage({ content: out.content[0].text, tool_call_id: call.id! }));
  }

  console.log("   final answer     :", (await model.invoke(messages)).content);

  // KEY INSIGHT: the LLM never learned MCP. It saw descriptions and emitted a
  // name, exactly as in 3.4. YOU were the translator, in both directions.
}

// =============================================================================
// PART 5 — The other two primitives (nothing to run — read this)
// =============================================================================
// Tools are one of three things a server can offer. The distinction that
// matters is CONTROL — who decides it happens:
//
//   TOOLS      model-controlled   the LLM decides, mid-run, and invents the
//                                 arguments. Has side effects. Gate it (3.6).
//   RESOURCES  app-controlled     the HOST decides what to load into context.
//                                 Read-only, addressed by URI. Think "@-mention
//                                 a file" — the model never chose.
//   PROMPTS    user-controlled    a HUMAN picks it off a menu. In Claude Code
//                                 these appear as slash commands.
//
// Their methods mirror tools exactly: resources/list + resources/read,
// prompts/list + prompts/get. Same JSON-RPC, same dispatcher, same shape.
//
// Getting this wrong is expensive: a "tool" the model calls 40 times to read a
// static file, or a "resource" that quietly deletes something.
//
// Rule of thumb for a document: if it fits in context and someone knows up
// front they need it, it's a RESOURCE. If retrieval requires a decision based
// on the query, it's a TOOL — and at that point you're doing RAG (2.3).

// =============================================================================
// PART 6 — Why bother (nothing to run — read this)
// =============================================================================
// The tool in PART 1 has four couplings, all invisible until they hurt:
//
//   1. SAME PROCESS    it reads your env and memory; its bugs crash you
//   2. SAME LANGUAGE   TypeScript. A Python team can't use it. Nor can Claude Desktop
//   3. SAME REPO       new tool = redeploy the agent
//   4. SAME FRAMEWORK  it's a LangChain object; switch frameworks, rewrite it
//
// THE N×M PROBLEM: N agent apps × M tool sources = N×M integrations.
// A protocol collapses that to N+M.
//
//     WITHOUT                        WITH
//     agent ──┬── GitHub             agent ──┐
//     agent ──┼── Jira               agent ──┼── MCP ──┬── GitHub
//     agent ──┼── Postgres           agent ──┤         ├── Jira
//     agent ──┴── your API           agent ──┘         └── Postgres
//
// Same argument AG-UI makes, on the other side of the agent:
//
//     Browser ⇄ AG-UI ⇄ [ your agent ] ⇄ MCP ⇄ tool servers
//              (agent→UI)              (agent→tools)
//
// One warning on vocabulary, because it trips everyone: in MCP, "client" and
// "server" are NOT the web meanings. The CLIENT is the thing holding the LLM
// (your backend). The SERVER is a tool provider with no model and no API key.
// Your backend is a web server AND an MCP client at the same time.

// -----------------------------------------------------------------------------
// PRODUCTION NOTES
// -----------------------------------------------------------------------------
// 1. HTTP status describes the TRANSPORT; the JSON-RPC `error` describes the
//    CALL. A tool that throws is a 200 with an error inside, not a 500.
// 2. Tool DESCRIPTIONS are prompt tokens. Connect a server with 50 tools and
//    all 50 schemas ride along on every single call. Filter what you bind.
// 3. Validate `params` on the server. The model WILL send malformed arguments,
//    and `inputSchema` is a hint to the model, not enforcement.
// 4. Discovery is not free — cache `tools/list`; don't re-fetch per turn.
// 5. A tool call is a network call now: it can time out, retry, and fail in
//    ways an in-process function never could.
// 6. Anything with side effects (refunds, deletes, sends) belongs behind a 3.6
//    interrupt, not behind a hopeful description.
//
// -----------------------------------------------------------------------------
// 🎯 THE THREE INTERVIEW QUESTIONS
// -----------------------------------------------------------------------------
// 1. What problem does MCP solve that a LangChain `tool()` doesn't?
// 2. A tool is a description plus an implementation. Where does each half live
//    with MCP, and who consumes it?
// 3. Tools vs resources vs prompts — what's the distinction, and why does it
//    matter in production?

async function main() {
  const server = startServer();
  await new Promise((r) => setTimeout(r, 200));

  try {
    await whatAToolReallyIs();
    await discoverAndCall();
    await theAgentLoop();
  } finally {
    server.close();
  }

  console.log("\n=============================================================");
  console.log("RECAP");
  console.log("  a tool      = a DESCRIPTION (for the model) + an IMPLEMENTATION (for you)");
  console.log("  MCP server  = an Express endpoint answering JSON-RPC");
  console.log("  JSON-RPC    = three agreed fields: method, params, id");
  console.log("  tools/list  = discovery — the client hardcodes nothing");
  console.log("  tools/call  = execution — on someone else's machine");
  console.log("  the bridge  = inputSchema -> parameters -> bindTools()");
  console.log("  the LLM     = never knew any of this happened");
  console.log("=============================================================");
}

main().catch(console.error);
