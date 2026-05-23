# Module 1.5 — Tools: Q&A Reference

---

**Q: What problem do tools solve?**  
A: LLMs have two fundamental limitations they cannot overcome on their own:
1. **No real-time knowledge** — they have a training cutoff, so they can't tell you today's date, current prices, or live weather
2. **No real computation** — they predict the next token; they don't execute code. Math "answers" from an LLM are hallucinations, not calculations

Tools let you attach real functions (that run on your machine or call external APIs) that the LLM can request to use.

---

**Q: What are the three parts of a tool definition?**  
A:
- **name** — how the LLM refers to it in `tool_calls`
- **description** — what the LLM reads to decide *when* to call it. This is the most critical part. Vague descriptions lead to wrong tool selection or missed calls.
- **schema** (Zod) — the parameters the tool accepts. The LLM fills these in based on the user's message.

```ts
const myTool = tool(
  ({ input }) => { /* your real implementation */ return "result"; },
  {
    name: "tool_name",
    description: "Clear description of what this does and when to use it.",
    schema: z.object({ input: z.string().describe("The input value") }),
  }
);
```

---

**Q: What does `.bindTools()` do?**  
A: It attaches the tool schemas (name, description, parameter schema) to every request sent to the model. The model never sees your actual function code — only the schema. This is how it knows what tools exist and what arguments to provide.

```ts
const modelWithTools = model.bindTools([tool1, tool2]);
```

---

**Q: What does the model actually return when it decides to call a tool?**  
A: It returns an `AIMessage` with a `tool_calls` array. Each entry has:
- `name` — which tool to call
- `args` — an object with the parameter values it chose
- `id` — a unique identifier to match this request with its result later

The `content` field may be empty — the model skips generating text and goes straight to the tool call.

```ts
// Example AIMessage.tool_calls:
[{
  name: "calculator",
  args: { operation: "multiply", a: 1000003, b: 9999991 },
  id: "call_abc123"
}]
```

---

**Q: Who actually executes the tool?**  
A: **You do** — in your application code. The LLM only *requests* a tool call; it does not run anything. This is an important mental model: the LLM is the *brain* that decides what to call and with what arguments, but your code is the *hands* that actually execute it.

---

**Q: What is a `ToolMessage` and why is it needed?**  
A: A `ToolMessage` is how you deliver the tool's result back to the model. It must include:
- `content` — the result (as a string)
- `tool_call_id` — matches the `id` from the original `AIMessage.tool_calls` entry

Without the `tool_call_id`, the model can't correlate which result belongs to which request. This matters when the model calls multiple tools at once.

---

**Q: What is the complete tool call loop?**  
A:
```
1. Human message → modelWithTools.invoke()
2. ← AIMessage with tool_calls (no text yet)
3. You execute each tool with the provided args
4. Wrap each result in a ToolMessage with matching tool_call_id
5. Add all messages to history: [HumanMessage, AIMessage, ToolMessage, ...]
6. modelWithTools.invoke(fullHistory)
7. ← Final AIMessage with the real text answer
```
Steps 1–2 are "the model thinking". Steps 3–4 are "the world responding". Steps 5–7 are "the model answering".

---

**Q: Can the model call multiple tools in one turn?**  
A: Yes. The `tool_calls` array can have multiple entries. You should execute all of them, create a `ToolMessage` for each, and send all of them back together before the next model call. The model may also call tools in parallel when it determines the calls are independent.

---

**Q: Why does description quality matter so much?**  
A: The model has no other signal for tool selection except the description. It reads all descriptions and reasons about which fits the user's intent. Compare:

| Bad | Good |
|-----|------|
| `"Calculates things"` | `"Performs arithmetic (add, subtract, multiply, divide) on two numbers. Use whenever a precise calculation is needed."` |
| `"Gets weather"` | `"Gets the current weather for a given city. Use when the user asks about weather or temperature in a specific location."` |

A bad description causes the model to either skip a useful tool or call the wrong one.

---

**Q: What's the difference between `tool()` and defining a tool manually?**  
A: `tool()` from `@langchain/core/tools` is a convenience factory that:
1. Creates a `DynamicStructuredTool` under the hood
2. Infers TypeScript types from the Zod schema (so `args` is typed in your function)
3. Handles schema serialization for the API call

You could manually create a `DynamicStructuredTool`, but `tool()` is the idiomatic shorthand.

---

**Q: In agentic systems, why is the tool loop architecture important?**  
A: It's the foundation of the **ReAct loop** (Reason → Act → Observe) that all agents use. In Module 1.6, you'll see this same loop — the LLM reasons about what to do, calls a tool (acts), reads the result (observes), and repeats until it has the answer. Understanding the manual loop in this module is exactly the "build it raw first" prerequisite for understanding agents.
