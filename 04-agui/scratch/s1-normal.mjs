// STEP 1 — an ordinary web server. Nothing clever.
import { createServer } from "node:http";

createServer((req, res) => {
  res.writeHead(200, { "content-type": "text/plain" });
  res.end("Order A123 was shipped.");   // <-- .end() = "I'm done, close it"
}).listen(4801, () => console.log("listening on http://localhost:4801"));
