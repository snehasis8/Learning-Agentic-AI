// STEP 4 — text isn't enough. Send JSON objects instead... and hit a problem.
import { createServer } from "node:http";

createServer(async (req, res) => {
  res.writeHead(200, { "content-type": "text/plain" });

  res.write(JSON.stringify({ type: "tool", name: "searchOrder" }));
  res.write(JSON.stringify({ type: "text", word: "Order " }));
  res.write(JSON.stringify({ type: "done" }));

  res.end();
}).listen(4804, () => console.log("listening on http://localhost:4804"));
