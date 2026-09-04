/**
 * THE SAME MCP SERVER — over HTTP instead of a pipe.
 *
 * Compare with raw-server.mjs. The brain (mcp-core.mjs) is imported unchanged.
 * Everything below is TRANSPORT: the plumbing that gets a JSON-RPC message from
 * over there to over here. Nothing here knows what a "tool" is.
 *
 * This is MCP's "Streamable HTTP" transport, hand-built. ONE endpoint, /mcp,
 * that answers three verbs:
 *
 *   POST   /mcp   client -> server   (a JSON-RPC message)     ≈ the stdin pipe
 *   GET    /mcp   server -> client   (an SSE stream)          ≈ the stdout pipe
 *   DELETE /mcp   end the session                             ≈ closing the pipe
 *
 * Read those three lines again. You are rebuilding, out of HTTP, the two pipes
 * the OS handed you for free in M.1.
 */

import express from "express";
import { randomUUID } from "node:crypto";
import { handle, addRuntimeTool } from "./mcp-core.mjs";

const log = (...a) => console.log("[http-server]", ...a);

// ---------------------------------------------------------------------------
// SESSIONS
// ---------------------------------------------------------------------------
// With stdio, "the session" was free: it was the child process itself. Alive =
// connected. Dead = disconnected. Nothing to track.
//
// HTTP is stateless. Every POST is a stranger. So we have to rebuild identity
// by hand: mint an id at initialize, hand it back in a header, and require the
// client to echo it on every later request.
//
// This Map is the thing the operating system gave you for nothing.
const sessions = new Map(); // sessionId -> { sseResponse, createdAt }

export function startHttpServer(port = 4950) {
  const app = express();
  app.use(express.json());

  // -------------------------------------------------------------------------
  // SECURITY — the moment you leave the pipe, you inherit the whole internet.
  // -------------------------------------------------------------------------
  // A stdio server was reachable only by the process that spawned it. This one
  // is reachable by anything that can send it a packet — including a malicious
  // WEBSITE the user has open, which can POST to localhost from their browser.
  // That attack is called DNS rebinding, and Origin checking is the defence.
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
      return res.status(403).json({ error: "Forbidden origin" });
    }
    next();
  });

  // =========================================================================
  // POST /mcp  —  client -> server.  This replaces the stdin pipe.
  // =========================================================================
  app.post("/mcp", (req, res) => {
    const msg = req.body;
    const sessionId = req.headers["mcp-session-id"];

    log(`POST  ${msg.method ?? "(response)"}  session=${sessionId ?? "-"}`);

    // A NOTIFICATION still has no id, and still gets no reply. Over stdio we
    // just returned. Over HTTP something must still close the connection, so
    // the spec says: 202 Accepted, empty body. "Got it, nothing to say."
    if (msg.id === undefined) {
      return res.status(202).end();
    }

    let result, error;
    try {
      result = handle(msg.method, msg.params);
    } catch (e) {
      error = { code: e.code ?? -32000, message: e.message };
    }

    // initialize is where a session is born. We mint an id and put it in a
    // RESPONSE HEADER — the client must send it back on every future request.
    if (msg.method === "initialize" && !error) {
      const id = randomUUID();
      sessions.set(id, { sseResponse: null, createdAt: Date.now() });
      res.setHeader("Mcp-Session-Id", id);
      log(`session created: ${id}`);
    }

    // The JSON-RPC message that comes back is BYTE-IDENTICAL to what the stdio
    // server would have written to stdout. Only the envelope changed.
    res.json(error ? { jsonrpc: "2.0", id: msg.id, error } : { jsonrpc: "2.0", id: msg.id, result });
  });

  // =========================================================================
  // GET /mcp  —  server -> client.  This replaces the stdout pipe.
  // =========================================================================
  // Why does this exist at all? Because POST can only ever ANSWER. It cannot
  // let the server speak first. And the server genuinely needs to:
  //
  //   - "my tool list changed"        (notifications/tools/list_changed)
  //   - "run this prompt for me"      (sampling — a request travelling BACKWARDS)
  //   - "ask the user which repo"     (elicitation)
  //
  // Over stdio, pipe B did this for free — the server could write whenever it
  // liked. Over HTTP you must hold a connection OPEN. That is exactly what SSE
  // is for, and it is exactly what you hand-built in 04-agui/scratch/s5.
  app.get("/mcp", (req, res) => {
    const sessionId = req.headers["mcp-session-id"];
    const session = sessions.get(sessionId);
    if (!session) return res.status(404).json({ error: "Unknown session" });

    res.writeHead(200, {
      "Content-Type": "text/event-stream", // <- the SSE content type
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    // GOTCHA, and a real one: writeHead() does NOT send anything. Node buffers
    // the headers and sends them with the first body write. But an SSE client's
    // fetch() only resolves once headers ARRIVE — so without this line, both
    // sides sit waiting for each other, forever. (This exact bug cost me a
    // hang while writing this file.)
    res.flushHeaders();
    res.write(": connected\n\n"); // an SSE comment — ignored by clients, but real bytes

    // NOTE: no res.end(). The response stays open. THAT is the whole trick —
    // and the reason this feels like a pipe again.

    session.sseResponse = res;
    log(`SSE stream opened for ${sessionId}`);

    req.on("close", () => {
      session.sseResponse = null;
      log(`SSE stream closed for ${sessionId}`);
    });
  });

  // =========================================================================
  // DELETE /mcp  —  end the session. Replaces closing the pipe (EOF).
  // =========================================================================
  app.delete("/mcp", (req, res) => {
    const sessionId = req.headers["mcp-session-id"];
    sessions.get(sessionId)?.sseResponse?.end();
    sessions.delete(sessionId);
    log(`session deleted: ${sessionId}`);
    res.status(204).end();
  });

  // -------------------------------------------------------------------------
  // Server-initiated push. Same JSON-RPC message, sent down the held-open SSE
  // stream instead of returned from a POST. Framed with SSE's "\n\n" instead of
  // the pipe's "\n" — same idea, different delimiter.
  // -------------------------------------------------------------------------
  function pushToSession(sessionId, message) {
    const res = sessions.get(sessionId)?.sseResponse;
    if (!res) return false;
    res.write(`data: ${JSON.stringify(message)}\n\n`);
    log(`pushed ${message.method} to ${sessionId}`);
    return true;
  }

  const server = app.listen(port, () => log(`listening on http://localhost:${port}/mcp`));

  return {
    port,
    sessions,
    pushToSession,
    addRuntimeTool,
    close: () => {
      for (const s of sessions.values()) s.sseResponse?.end();
      sessions.clear();
      server.close();
      // Keep-alive sockets outlive server.close(); without this the process
      // lingers. Another thing the pipe cleaned up for free.
      server.closeAllConnections?.();
    },
  };
}

// Allow running standalone: node 05-mcp/servers/http-server.mjs
if (import.meta.url === `file://${process.argv[1]}`) startHttpServer();
