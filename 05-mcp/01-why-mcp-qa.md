# Module M.1 — Why MCP: Q&A Reference

---

**Q: What is a "tool", really?**  
A: **Two things bolted together**, with two different consumers:

| Half | Who reads it | When |
|---|---|---|
| **Description** — name, description, schema | the **LLM** | at prompt time |
| **Implementation** — the function body | **your code** | at execution time |

`bindTools()` only ever serialises the *descriptions* into the API request. It never touches your function body.

So nothing requires the two halves to live in the same process. **That single observation is the whole of MCP.**

---

**Q: What is MCP in one sentence?**  
A: A standard wire protocol that lets the implementation half of a tool live in a **separate server**, which any agent can discover and call.

---

**Q: What's wrong with a LangChain `tool()`?**  
A: Nothing — until you count the couplings:

1. **Same process** — reads your env and memory; its bugs crash you
2. **Same language** — TypeScript. A Python team can't use it; nor can Claude Desktop
3. **Same repo** — a new tool means redeploying the agent
4. **Same framework** — it's a LangChain object; switch frameworks, rewrite it

---

**Q: What is the N×M problem?**  
A: N agent apps × M tool sources = N×M bespoke integrations. A protocol collapses it to **N + M**: each agent implements the client once, each tool source implements the server once.

Same argument AG-UI makes, on the other side of the agent:

```
Browser ⇄ AG-UI ⇄ [ your agent ] ⇄ MCP ⇄ tool servers
         (agent→UI)              (agent→tools)
```

---

**Q: What is JSON-RPC?**  
A: An agreement on three field names in your JSON:

| Field | Means |
|---|---|
| `method` | what do you want? |
| `params` | with which arguments? |
| `id` | a ticket number, to match replies to requests |

Plus `result` **or** `error` coming back. **It is not a library** — there is nothing to install. That's why an MCP server needs zero dependencies beyond a web framework.

---

**Q: Why does every request need an `id`?**  
A: Because replies can come back **out of order** — a slow call and a fast call don't finish in the order you sent them. The `id` is how you pair a reply with its request.

Same job AG-UI's `messageId` did routing text deltas to the right bubble: **on a shared channel, an id is an address.**

---

**Q: Request vs notification?**  
A: A **request** has an `id` and expects exactly one reply. A **notification** has **no `id`** and expects none, ever.

The failure mode is what makes it worth knowing: awaiting a reply that will never come doesn't crash — it **hangs silently, forever**. No error, no timeout, no stack trace.

---

**Q: What are the only two methods that matter for tools?**  
A: `tools/list` (discovery — "what have you got?") and `tools/call` (execution). That's the whole protocol surface.

The important half is **discovery**: the client hardcodes nothing. The server adds a tool and every client sees it with **no redeploy**.

---

**Q: Why is `inputSchema` JSON Schema instead of zod?**  
A: MCP is **language-agnostic** — a Python client must read the same definition, so the wire format can't depend on a JavaScript library.

And conveniently, that's the entire bridge to your agent — one rename:

```ts
{ type: "function", function: { name, description, parameters: t.inputSchema } }
```

---

**Q: Why is a tool result a content *array*?**  
A: Because one call may return text **and** an image **and** an embedded resource.

```json
{ "content": [ { "type": "text", "text": "..." } ] }
```

---

**Q: In MCP, what do "client" and "server" mean?**  
A: **Not** the web meanings. This trips up everyone:

- **Client** = the thing **holding the LLM** — your backend, Claude Desktop, Claude Code
- **Server** = a **tool provider**. No model, no API key, no brain

Your Node backend is a *web server* and an *MCP client* **at the same time**. Your Azure key never leaves it.

---

**Q: What are the three primitives, and who controls each?**  
A: The distinction is **control** — who decides it happens:

| Primitive | Controlled by | Side effects |
|---|---|---|
| **Tools** | the **model**, mid-run, inventing arguments | yes — gate them (3.6) |
| **Resources** | the **app** — what to load into context | no, read-only, URI-addressed |
| **Prompts** | a **human** picking from a menu | n/a |

For a document: if it fits in context and someone knows up front they need it → **resource**. If retrieval needs a decision based on the query → **tool**, and that's RAG (2.3).

---

**Q: A tool throws. What HTTP status comes back?**  
A: **200.** The HTTP status describes the **transport**; the JSON-RPC `error` object describes the **call**. The request succeeded — it delivered the bad news correctly.

Returning a 500 for a failed tool conflates two layers and breaks clients.

---

**Q: What breaks first in production?**  
A: **Token cost from tool descriptions.** Connect a server with 50 tools and all 50 schemas ride along on *every single* LLM call, forever. Filter what you bind.

Runners-up: not caching `tools/list`; awaiting a notification (silent hang); trusting `inputSchema` as validation when it's only a hint to the model — validate `params` server-side, because the model *will* send something malformed.

---
