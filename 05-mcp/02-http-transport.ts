/**
 * Module M.2 — MCP over HTTP (the Streamable HTTP transport), hand-built
 *
 * WHAT YOU'LL LEARN:
 *   - Why a deployed agent CANNOT use the stdio transport
 *   - How one /mcp endpoint replaces two pipes: POST = stdin, GET+SSE = stdout
 *   - Why sessions suddenly need a header when the pipe gave you one for free
 *   - Server-initiated messages: watch a tool appear at RUNTIME
 *   - The security you inherit the moment you leave the process boundary
 *
 * WHY THIS MATTERS:
 *   You're deploying the capstone. A deployed agent can't spawn a child process
 *   on the user's laptop, so remote MCP is HTTP. And you already own both
 *   halves of it: JSON-RPC from M.1, SSE hand-built in A.1 (scratch/s5).
 *   This module bolts them together.
 *
 *   THE HEADLINE: every JSON-RPC message here is byte-identical to M.1's.
 *   The brain (servers/mcp-core.mjs) is imported UNCHANGED by both servers.
 *   Only the envelope changed.
 *
 * Run: npx tsx 05-mcp/02-http-transport.ts
 */

import "dotenv/config";
// @ts-ignore -- plain .mjs, no type declarations; that's fine for a teaching file
import { startHttpServer } from "./servers/http-server.mjs";

const PORT = 4950;
const URL = `http://localhost:${PORT}/mcp`;
const show = (label: string, v: unknown) =>
  console.log(`${label}\n${JSON.stringify(v, null, 2)}\n`);

// =============================================================================
// A raw MCP-over-HTTP client. Compare it with M.1's RawMcpClient.
// =============================================================================
class HttpMcpClient {
  private nextId = 1;
  private sessionId: string | null = null;

  /** POST = the stdin pipe. Client speaks, server answers. */
  async request<T = any>(method: string, params?: unknown): Promise<T> {
    const id = this.nextId++;
    const res = await fetch(URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // The session id, echoed back on every request after initialize.
        // Over stdio this was free — the process WAS the session.
        ...(this.sessionId ? { "Mcp-Session-Id": this.sessionId } : {}),
      },
      // The body is the EXACT same JSON-RPC object M.1 wrote to a pipe.
      body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
    });

    // The server mints the session id on initialize and returns it in a header.
    const assigned = res.headers.get("Mcp-Session-Id");
    if (assigned) {
      this.sessionId = assigned;
      console.log(`   ↳ server assigned session ${assigned}\n`);
    }

    const msg = await res.json();
    if (msg.error) throw new Error(`[${msg.error.code}] ${msg.error.message}`);
    return msg.result as T;
  }

  /** No id, so no reply. Over HTTP the server answers 202 Accepted, empty body. */
  async notify(method: string, params?: unknown): Promise<void> {
    const res = await fetch(URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(this.sessionId ? { "Mcp-Session-Id": this.sessionId } : {}),
      },
      body: JSON.stringify({ jsonrpc: "2.0", method, params }),
    });
    console.log(`   ↳ notification -> HTTP ${res.status} (${res.statusText}), no body\n`);
  }

  /**
   * GET = the stdout pipe. Opens an SSE stream the server can write to whenever
   * it likes. Returns a callback that fires for each pushed message.
   */
  async openStream(onMessage: (m: any) => void): Promise<() => void> {
    const controller = new AbortController();
    const res = await fetch(URL, {
      headers: { "Mcp-Session-Id": this.sessionId! },
      signal: controller.signal,
    });

    // FRAMING, a third time. The pipe cut on "\n". SSE cuts on "\n\n".
    // Same lesson: bytes are not messages, so you impose a delimiter.
    (async () => {
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let idx: number;
          while ((idx = buffer.indexOf("\n\n")) !== -1) {
            const frame = buffer.slice(0, idx);
            buffer = buffer.slice(idx + 2);
            const line = frame.split("\n").find((l) => l.startsWith("data: "));
            if (line) onMessage(JSON.parse(line.slice(6)));
          }
        }
      } catch {
        /* aborted — expected on close */
      }
    })();

    return () => controller.abort();
  }

  async end(): Promise<void> {
    await fetch(URL, { method: "DELETE", headers: { "Mcp-Session-Id": this.sessionId! } });
  }

  get session() {
    return this.sessionId;
  }
}

// =============================================================================
// PART 1 — The same handshake, over a different pipe
// =============================================================================
async function part1(client: HttpMcpClient) {
  console.log("\n=== PART 1 — handshake over HTTP ===\n");

  const init = await client.request("initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "http-client", version: "1.0.0" },
  });
  show("initialize ->", init);

  await client.notify("notifications/initialized");

  // Look at what you just sent. Identical JSON to M.1 — same method, same
  // params, same shape. Only the ENVELOPE differs:
  //
  //   stdio:  write the bytes to fd 1, terminated by "\n"
  //   http:   put the bytes in a POST body, terminated by Content-Length
  //
  // That is the whole difference. The protocol never noticed.
}

// =============================================================================
// PART 2 — Tools work exactly as before
// =============================================================================
async function part2(client: HttpMcpClient) {
  console.log("\n=== PART 2 — tools over HTTP ===\n");

  const { tools } = await client.request<{ tools: any[] }>("tools/list");
  console.log("tools:", tools.map((t) => t.name).join(", "), "\n");

  show(
    "tools/call getWeather ->",
    await client.request("tools/call", {
      name: "getWeather",
      arguments: { city: "Rotterdam" },
    }),
  );

  // Errors still come back as JSON-RPC errors, not HTTP errors. Note that:
  // a tool that fails is a 200 OK with an `error` object inside. HTTP status
  // describes the TRANSPORT; the JSON-RPC error describes the CALL.
  try {
    await client.request("tools/call", { name: "noSuchTool", arguments: {} });
  } catch (e) {
    console.log("missing tool ->", (e as Error).message, "\n");
  }
}

// =============================================================================
// PART 3 — The server speaks first (this is why GET/SSE exists)
// =============================================================================
async function part3(client: HttpMcpClient, server: any) {
  console.log("\n=== PART 3 — server-initiated push ===\n");

  const pushed: any[] = [];
  const closeStream = await client.openStream((m) => {
    console.log("📥 PUSHED BY SERVER:", JSON.stringify(m));
    pushed.push(m);
  });
  console.log("SSE stream open — the server can now speak whenever it wants.\n");

  // Now the server changes its own tool list at runtime and TELLS us.
  // A POST could never do this: POST can only ever answer a question we asked.
  await new Promise((r) => setTimeout(r, 100));
  server.addRuntimeTool();
  server.pushToSession(client.session, {
    jsonrpc: "2.0",
    method: "notifications/tools/list_changed",
  });

  await new Promise((r) => setTimeout(r, 200));

  // The client reacts by re-listing. No restart, no redeploy.
  const { tools } = await client.request<{ tools: any[] }>("tools/list");
  console.log("\nre-listed after push:", tools.map((t) => t.name).join(", "));
  show("flipCoin ->", await client.request("tools/call", { name: "flipCoin", arguments: {} }));

  console.log(`messages the server pushed unprompted: ${pushed.length}\n`);
  closeStream();

  // THIS is the capability that makes MCP not-a-REST-API. Sampling and
  // elicitation travel down this same stream: the server asking the client
  // to run an LLM, or to ask the human a question.
}

// =============================================================================
// PART 4 — What HTTP costs you
// =============================================================================
async function part4(client: HttpMcpClient) {
  console.log("\n=== PART 4 — the bill for leaving the pipe ===\n");

  // 1. NO SESSION -> the server has no idea who you are.
  const noSession = await fetch(URL, { headers: { "Mcp-Session-Id": "made-up-id" } });
  console.log(`GET with a bogus session -> HTTP ${noSession.status}`);

  // 2. BAD ORIGIN -> a website in the user's browser must not reach your server.
  const badOrigin = await fetch(URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "https://evil.example.com" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 99, method: "tools/list" }),
  });
  console.log(`POST from a foreign Origin -> HTTP ${badOrigin.status}`);

  // 3. Clean shutdown is now an HTTP verb, not an EOF.
  await client.end();
  console.log(`DELETE sent — session terminated\n`);

  // -------------------------------------------------------------------------
  // stdio                              HTTP
  // -------------------------------------------------------------------------
  // session = the process              session = a header + a Map you maintain
  // auth    = the OS                   auth    = OAuth / bearer tokens (M.3)
  // push    = free (pipe B)            push    = hold an SSE stream open
  // reach   = the parent only          reach   = anything that can send a packet
  // failure = process died             failure = 401 / timeout / dropped stream
  // shutdown= close the pipe (EOF)     shutdown= DELETE, or a timeout sweep
  // -------------------------------------------------------------------------
}

// =============================================================================
// PRODUCTION NOTES
// =============================================================================
// - ONE endpoint, three verbs. POST = client→server, GET = server→client (SSE),
//   DELETE = end session. Older servers use a deprecated two-endpoint variant.
// - HTTP status describes the TRANSPORT; JSON-RPC `error` describes the CALL.
//   A failed tool is 200 OK with an error inside. Don't conflate them.
// - Notifications get 202 Accepted with an empty body. Never a JSON-RPC reply.
// - Validate `Origin`. A localhost server is reachable from any webpage the
//   user has open — that's DNS rebinding, and it's a real attack.
// - Sessions leak. This file's `sessions` Map grows forever; production needs a
//   TTL sweep. The pipe cleaned up after itself; HTTP will not.
// - Streams drop. Real clients reconnect and resume with `Last-Event-ID`.
// - Bind to 127.0.0.1 for local servers, never 0.0.0.0, unless you mean it.
//
// -----------------------------------------------------------------------------
// 🎯 THE THREE INTERVIEW QUESTIONS
// -----------------------------------------------------------------------------
// 1. Why can't a deployed agent use the stdio transport?
// 2. What does the GET/SSE stream buy you that POST alone cannot — and name two
//    MCP features that depend on it.
// 3. stdio gave you sessions, auth, and cleanup for free. Explain how each one
//    has to be rebuilt over HTTP, and what breaks if you skip it.

async function main() {
  const server = startHttpServer(PORT);
  await new Promise((r) => setTimeout(r, 300));

  const client = new HttpMcpClient();
  try {
    await part1(client);
    await part2(client);
    await part3(client, server);
    await part4(client);
  } finally {
    server.close();
    console.log("server closed.");
  }
}

main().catch(console.error);
