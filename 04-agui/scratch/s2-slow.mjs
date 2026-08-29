// STEP 2 — the SAME server, but it takes 4 seconds to think.
import { createServer } from "node:http";

createServer(async (req, res) => {
  res.writeHead(200, { "content-type": "text/plain" });
  await new Promise(r => setTimeout(r, 4000));      // the agent "thinking"
  res.end("Order A123 was shipped.");
}).listen(4802, () => console.log("listening on http://localhost:4802"));
