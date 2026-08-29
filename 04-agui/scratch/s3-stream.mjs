// STEP 3 — same 4 seconds of work, but we WRITE as we go instead of waiting.
import { createServer } from "node:http";

createServer(async (req, res) => {
  res.writeHead(200, { "content-type": "text/plain" });

  for (const word of ["Order ", "A123 ", "was ", "shipped."]) {
    res.write(word);                                 // <-- write, do NOT end
    await new Promise(r => setTimeout(r, 1000));
  }

  res.end();                                         // <-- only now: close
}).listen(4803, () => console.log("listening on http://localhost:4803"));
