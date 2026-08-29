# Module A.2 — The Event Protocol: Q&A Reference

---

**Q: What are the three patterns every AG-UI event follows?**  
A:
| Pattern | Shape | Used by |
|---|---|---|
| **1. Streamed thing** | `start` → `content`×N → `end`, joined by an `id` | text, tool calls, reasoning, thinking |
| **2. Shared data** | `snapshot` (whole) or `delta` (JSON Patch) | state, messages, activity |
| **3. Bare signal** | "this happened", no payload | run/step lifecycle |

29 of the 33 events are these three ideas applied to different subjects. Learn the patterns; look the names up when you need them.

---

**Q: Why is a message three events instead of one?**  
A: Because **the UI must draw the container before the content exists.**

```
TEXT_MESSAGE_START   { messageId, role }   → create the bubble now
TEXT_MESSAGE_CONTENT { messageId, delta }  → append a fragment (many times)
TEXT_MESSAGE_END     { messageId }         → stop the cursor, re-enable input
```

Send it as one event and you're back to the 4-second blank screen — the problem the whole protocol exists to solve.

---

**Q: What is the `id` actually for?**  
A: It's an **address, not bookkeeping.** An agent often streams two things at once, so deltas arrive interleaved. Glue them blindly and you get garbage:

```
"Order Meanwhile, A123 checking shipped.stock..."
```

Group by `id` and they separate cleanly into two messages. Without ids, concurrent streams are unrecoverable.

---

**Q: Why do tool arguments arrive as broken JSON?**  
A: Because the model writes them one token at a time, exactly like text:

```
{"order          ← not valid JSON
{"orderId":"A1   ← not valid JSON
{"orderId":"A123","amountCents":500}   ← finally parses
```

**Rule: buffer the deltas, parse only after `TOOL_CALL_END`.** Parsing mid-stream throws.

---

**Q: If args are unusable until the end, why stream them at all?**  
A: Because `TOOL_CALL_START` already gave the UI the tool's **name**. It can render `🔧 refundOrder…` immediately while the arguments are still arriving — progress the user can see.

---

**Q: What's the difference between a snapshot and a delta?**  
A:
- **snapshot** — the whole state object. Simple, but resending everything on every change is wasteful.
- **delta** — only what changed, as **RFC-6902 JSON Patch**:

```json
[{ "op": "replace", "path": "/customer/plan", "value": "enterprise" }]
```

`path` is a route through the object, written like a file path. Three ops cover nearly everything: `replace`, `add`, `remove`.

---

**Q: When do you send which?**  
A: **Snapshot on connect, deltas thereafter.** A client that joins mid-run and receives only deltas has no baseline to apply them to.

---

**Q: How do you know your events are actually spec-compliant?**  
A: `@ag-ui/core` ships zod schemas — compliance is checkable, not a claim:

```ts
import { EventSchemas } from "@ag-ui/core";
const result = EventSchemas.safeParse(event);
```

It catches the mistakes you can't see by eye:
```
FAIL  MISSING messageId  -> Required at [messageId]
FAIL  WRONG field name   -> Required at [toolCallName]   ← it's toolCallName, not name
FAIL  invented event     -> Invalid discriminator value at [type]
```

---

**Q: What are `RAW` and `CUSTOM` for?**  
A: Escape hatches. `RAW` wraps an underlying framework event passed through untranslated; `CUSTOM` carries an app-specific `{ name, value }`. They stop the spec being a cage — but anything sent through them is **no longer portable** to another frontend.

---

**Q: What breaks first in production? (interview question 3)**  
A:
1. **Duplicate ids within a run** — two streams merge into the wrong bubble. Only shows under concurrency.
2. **Parsing tool args before `END`** — throws on partial JSON, which is the normal case, not an edge case.
3. **No snapshot on connect** — a client joining mid-run has nothing to apply deltas to, so its state silently diverges.
4. **Unvalidated events** — a malformed event fails *silently* in the browser. `safeParse` on the way out is the fix.
