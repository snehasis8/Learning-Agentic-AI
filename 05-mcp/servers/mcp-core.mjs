/**
 * THE BRAIN — transport-independent.
 *
 * This file is lifted almost verbatim out of raw-server.mjs (M.1). Compare them
 * side by side: the tool definitions and the `handle()` switch are IDENTICAL.
 *
 * That is the entire point of a layered protocol:
 *
 *      MCP methods  (initialize, tools/list, tools/call)   ← this file
 *      ────────────────────────────────────────────────
 *      JSON-RPC 2.0 message shapes                        ← unchanged
 *      ────────────────────────────────────────────────
 *      stdio pipes   OR   HTTP + SSE                      ← the ONLY thing that swaps
 *
 * raw-server.mjs bolts this brain onto stdin/stdout.
 * http-server.mjs bolts the SAME brain onto Express.
 * Neither one knows or cares which.
 */

export const PROTOCOL_VERSION = "2025-06-18";

// --- PRIMITIVE 1: TOOLS (model-controlled) ---------------------------------
export const TOOLS = [
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

const TOOL_IMPLS = {
  getWeather: ({ city }) => `It is 18°C and raining in ${city}.`,
  addNumbers: ({ a, b }) => `${a} + ${b} = ${a + b}`,
};

// A tool we add at RUNTIME in PART 3, to prove the server can push.
export function addRuntimeTool() {
  if (TOOLS.some((t) => t.name === "flipCoin")) return;
  TOOLS.push({
    name: "flipCoin",
    description: "Flip a coin. Added at runtime.",
    inputSchema: { type: "object", properties: {} },
  });
  TOOL_IMPLS.flipCoin = () => (Math.random() < 0.5 ? "heads" : "tails");
}

// --- PRIMITIVE 2: RESOURCES (app-controlled) -------------------------------
const RESOURCES = [
  {
    uri: "notes://team-handbook",
    name: "Team Handbook",
    description: "Internal engineering handbook.",
    mimeType: "text/plain",
  },
];

const RESOURCE_CONTENTS = {
  "notes://team-handbook":
    "Deploys are frozen on Fridays. All PRs need one approval. On-call rotates weekly.",
};

// --- PRIMITIVE 3: PROMPTS (user-controlled) --------------------------------
const PROMPTS = [
  {
    name: "code-review",
    description: "Review a code snippet for bugs and style.",
    arguments: [
      { name: "language", description: "Programming language", required: true },
      { name: "code", description: "The code to review", required: true },
    ],
  },
];

// ---------------------------------------------------------------------------
// THE DISPATCHER. Takes a method name and params, returns a result.
// Notice what is NOT in here: no stdin, no stdout, no req, no res, no sockets.
// It has no idea how the message reached it, and no idea how the answer leaves.
// ---------------------------------------------------------------------------
export function handle(method, params) {
  switch (method) {
    case "initialize":
      return {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: true }, resources: {}, prompts: {} },
        serverInfo: { name: "http-demo-server", version: "1.0.0" },
      };

    case "tools/list":
      return { tools: TOOLS };

    case "tools/call": {
      const impl = TOOL_IMPLS[params.name];
      if (!impl) throw new Error(`Unknown tool: ${params.name}`);
      return { content: [{ type: "text", text: impl(params.arguments ?? {}) }] };
    }

    case "resources/list":
      return { resources: RESOURCES };

    case "resources/read": {
      const text = RESOURCE_CONTENTS[params.uri];
      if (text === undefined) throw new Error(`Unknown resource: ${params.uri}`);
      return { contents: [{ uri: params.uri, mimeType: "text/plain", text }] };
    }

    case "prompts/list":
      return { prompts: PROMPTS };

    case "prompts/get": {
      const { language, code } = params.arguments ?? {};
      return {
        description: `Review this ${language} snippet`,
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `Review this ${language} code for bugs and style:\n\n${code}`,
            },
          },
        ],
      };
    }

    default: {
      const err = new Error(`Method not found: ${method}`);
      err.code = -32601;
      throw err;
    }
  }
}
