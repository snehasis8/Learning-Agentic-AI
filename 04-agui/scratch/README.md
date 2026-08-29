# AG-UI from the ground up — 5 steps

No libraries. No AG-UI yet. You run a tiny server, poke it with `curl`, and see
what actually goes over the wire.

**Read the words first, then run the command, then look at the output.**
Each step is one idea and about 10 lines of code.

Each server prints its port and stays running — stop it with `Ctrl-C` before
starting the next one.

---

## Step 1 — A normal web server

**The idea:** an ordinary HTTP response. Browser asks, server answers, connection
closes. `res.end()` means *"I'm finished, close it."*

```bash
node 04-agui/scratch/s1-normal.mjs      # terminal 1
curl -N http://localhost:4801           # terminal 2
```

**You see:** `Order A123 was shipped.` — instantly.

**Takeaway:** one request → one response → done. This is how almost all web
requests work.

---

## Step 2 — The problem

**The idea:** same server, but the "agent" thinks for 4 seconds first.

```bash
node 04-agui/scratch/s2-slow.mjs
curl -N http://localhost:4802
```

**You see:** nothing at all for 4 seconds… then the whole sentence at once.

**Takeaway:** the user stares at a blank screen for 4 seconds. A real agent takes
20+. This is the problem we are solving. Nothing more complicated than that.

---

## Step 3 — The fix: don't close the connection

**The idea:** send the headers, then keep writing into the *same* open connection.
Only call `res.end()` when you are truly finished.

```bash
node 04-agui/scratch/s3-stream.mjs
curl -N http://localhost:4803
```

**You see:** one word appears per second.

**Takeaway:** **that is all "streaming" is.** Write, don't end. No framework, no
websockets, no magic. (The `-N` on curl means "don't buffer" — without it curl
would hide the effect from you.)

---

## Step 4 — Text isn't enough, so send JSON… and hit a wall

**The idea:** a UI needs more than words. It needs to know *a tool ran*, *the run
finished*, *this failed*. So send little JSON objects instead of bare text.

```bash
node 04-agui/scratch/s4-json.mjs
curl -N http://localhost:4804
```

**You see:**

```
{"type":"tool",...}{"type":"text",...}{"type":"done"}
```

…all glued together, and `JSON.parse` fails on it.

**Takeaway:** the connection is a **stream of bytes**, not a stream of messages.
It has no idea where one object stops and the next begins. **You must add a
delimiter yourself.**

---

## Step 5 — SSE is just an agreed delimiter

**The idea:** the web already standardised a delimiter for exactly this, called
**Server-Sent Events**. The entire convention is:

```
data: {"your":"json"}<blank line>
```

That's it. Prefix each object with `data: `, end it with a blank line.

```bash
node 04-agui/scratch/s5-sse.mjs
curl -N http://localhost:4805
```

**You see:** each object on its own `data:` line, separated by blank lines — and
now every one parses cleanly.

**Takeaway:** SSE isn't a technology to learn, it's a **formatting rule**. Two
bonuses for free: browsers speak it natively (`new EventSource(url)`), and it
reconnects on its own.

---

## Where this leaves you

Look at the objects you sent in Step 5:

```json
{"type":"run_started"}
{"type":"tool_start",  "id":"t1", "name":"searchOrder"}
{"type":"tool_result", "id":"t1", "content":"SHIPPED"}
{"type":"text",        "id":"m1", "delta":"Order A123 shipped."}
{"type":"run_finished"}
```

You invented those names. Someone else building the same thing would invent
different ones — `start`/`begin`/`init`, `tool`/`function`/`action`. Their UI
would not understand your agent.

**AG-UI is just that list, agreed on by everyone.** Their names for what you
already wrote:

| yours | AG-UI |
|---|---|
| `run_started` | `RUN_STARTED` |
| `tool_start` | `TOOL_CALL_START` |
| `tool_result` | `TOOL_CALL_RESULT` |
| `text` | `TEXT_MESSAGE_CONTENT` |
| `run_finished` | `RUN_FINISHED` |

Two details in your own objects worth noticing, because AG-UI keeps both:

- **`id`** (`t1`, `m1`) — two things can be streaming at once, so each piece of
  text needs to say which message it belongs to.
- **`delta`** — you send a *fragment*, not the whole message, because the whole
  message doesn't exist yet.

Next: `01-why-agui.ts` shows the full agreed list and why it matters.


---
---

# Part 2 — what goes INSIDE the events (steps 6–9)

Steps 1–5 built the pipe. These four explain the shape of what travels down it.

**No server this time** — one terminal, just `node <file>`. These are about event
content, not transport.

There are only three patterns. Learn them and the rest of the spec is obvious.

---

## Step 6 — why one message is THREE events

**The idea:** you could send a message as one event. Watch why nobody does.

```bash
node 04-agui/scratch/s6-why-three-events.mjs
```

**You see:** attempt A waits 2 seconds then dumps everything. Attempt B opens a
bubble immediately, fills it word by word, then closes it.

**Takeaway:** the UI has to draw the bubble **before the text exists**.
- `start` → "make a container, here is its id"
- `content` → "append this fragment" (many times)
- `end` → "done, stop the cursor, re-enable input"

Same three-part shape is used for tool calls and for reasoning. **Pattern 1.**

---

## Step 7 — why every event carries an id

**The idea:** an agent often streams two things at once.

```bash
node 04-agui/scratch/s7-why-ids.mjs
```

**You see:** the deltas arrive interleaved. Glued together blindly they read
`"Order Meanwhile, A123 checking shipped.stock..."` — garbage. Grouped by `id`
they cleanly become two separate messages.

**Takeaway:** the `id` is not bookkeeping, it is **the address**. It tells a
fragment which bubble it belongs to. Without it, concurrent streams are
unrecoverable.

---

## Step 8 — tool arguments arrive as broken JSON

**The idea:** the model types arguments one token at a time, exactly like text.

```bash
node 04-agui/scratch/s8-tool-args.mjs
```

**You see:** `{"order` … `{"orderId":"A1` … each buffer stage failing
`JSON.parse`, until the final piece completes it.

**Takeaway:** `tool_args` deltas are **fragments of a JSON string**, not objects.
Buffer them, and only parse after `tool_end`. Parsing early throws.

So why bother streaming them? Because `tool_start` already told the UI the tool's
**name** — it can show `🔧 refundOrder…` while the arguments are still arriving.

---

## Step 9 — state: snapshot vs delta

**The idea:** the agent's state changes. How do you tell the UI?

```bash
node 04-agui/scratch/s9-state.mjs
```

**You see:** the whole object sent once, then the same change expressed as
`[{"op":"replace","path":"/customer/plan","value":"enterprise"}]`, and that patch
applied by hand.

**Takeaway:** **Pattern 2 — snapshot vs delta.**
- **snapshot** = the whole object. Send on connect, so the UI has a starting point.
- **delta** = only what changed, as JSON Patch (RFC 6902). Send for every change after.

Three ops cover nearly everything: `replace`, `add`, `remove`.

---

## The three patterns

Everything in the spec is one of these:

| Pattern | Shape | Used by |
|---|---|---|
| **1. Streamed thing** | `start` → `content`×N → `end`, joined by an `id` | text, tool calls, reasoning, thinking |
| **2. Shared data** | `snapshot` (whole) or `delta` (JSON Patch) | state, messages, activity |
| **3. Bare signal** | just "this happened", no payload | run started/finished/error, step started/finished |

That is the entire protocol. The 33 event names are these three ideas applied to
different subjects.

**Their names for what you just built:**

| yours | AG-UI |
|---|---|
| `text_start` / `text_content` / `text_end` | `TEXT_MESSAGE_START` / `_CONTENT` / `_END` |
| `tool_args` | `TOOL_CALL_ARGS` |
| `state_snapshot` | `STATE_SNAPSHOT` |
| `state_delta` | `STATE_DELTA` |

Next: **A.3** — emitting these from a real LangGraph run.
