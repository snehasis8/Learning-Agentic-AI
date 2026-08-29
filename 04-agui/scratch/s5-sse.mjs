// STEP 5 — the fix: put a delimiter between objects.
// The web already standardised one: SSE.  "data: " + json + a BLANK LINE.
import { createServer } from "node:http";

createServer(async (req, res) => {
  res.writeHead(200, { "content-type": "text/event-stream" });

  const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);  // <-- the whole trick

  send({ type: "run_started" });
  send({ type: "tool_start", id: "t1", name: "searchOrder" });
  send({ type: "tool_result", id: "t1", content: "SHIPPED" });
  send({ type: "text", id: "m1", delta: "Order A123 shipped." });
  send({ type: "run_finished" });

  res.end();
}).listen(4805, () => console.log("listening on http://localhost:4805"));
