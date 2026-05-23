# Module 1.3 — Structured Output: Q&A Reference

---

**Q: Why is asking the model to "respond only in JSON" unreliable?**  
A: Three reasons:
1. The model may add text before/after the JSON ("Here is the result: {...}")
2. It may use invalid JSON syntax (single quotes, trailing commas)
3. You still receive a `string` — you must `JSON.parse()` it manually, wrap in try/catch, and handle failures
Even if it works 95% of the time, that 5% causes production bugs that are hard to reproduce.

---

**Q: What does `.withStructuredOutput(schema)` do under the hood?**  
A: It uses the model's **function calling / tool use** capability. The model is forced to "call a function" whose parameters match your Zod schema. The API returns a structured JSON object that LangChain deserializes into a typed TypeScript object. You never see a string — you get the object directly.

---

**Q: What is the return type difference between `model.invoke()` and `structuredModel.invoke()`?**  
A:
- `model.invoke()` → returns `AIMessage` with `.content` as a string
- `structuredModel.invoke()` → returns a typed object matching your Zod schema, with no `.content` at all

---

**Q: Why do we always set `temperature: 0` for structured extraction tasks?**  
A: Extraction has one correct answer — the price is `1299`, not an approximate. `temperature: 0` makes the model deterministic and picks the highest-probability token at each step, minimizing hallucination and formatting errors. Randomness is the enemy of reliable data extraction.

---

**Q: What does `.describe()` do on a Zod field?**  
A: It passes a description to the model as part of the function calling schema. The model reads it to understand what to put in each field. Example: `price: z.number().describe("The price as a number, without currency symbols")` tells the model to return `1299` not `"$1,299"`. It's prompt engineering at the schema level.

---

**Q: How do you extract a list of items (e.g., job requirements) into a real JS array?**  
A: Use `z.array(z.string())`:
```ts
requirements: z.array(z.string()).describe("List of key requirements")
```
The model returns a proper JS array you can directly call `.join()`, `.map()`, `.filter()` on — no string splitting needed.

---

**Q: What does `z.enum()` do and why is it useful for LLM outputs?**  
A: `z.enum(["low", "medium", "high", "critical"])` restricts the field to exactly those values. The model cannot return anything outside that set. This is critical for routing, classification, and any logic that branches on the model's output — you can write `if (result.priority === "critical")` safely, knowing those are the only possible values.

---

**Q: How do you make a field optional in a Zod schema?**  
A: Chain `.optional()`:
```ts
affectedFeature: z.string().optional()
```
TypeScript types it as `string | undefined`. If the model can't find the value in the text, it returns `undefined`. Use the nullish coalescing operator to handle it: `result.affectedFeature ?? "N/A"`.

---

**Q: How do you constrain a number to integers only?**  
A: Use `z.number().int()`:
```ts
estimatedMinutesToResolve: z.number().int()
```
This tells both the model and Zod's runtime validation that the value must be a whole number.

---

**Q: How does the model reason about enum values vs. just pattern-matching keywords?**  
A: It reasons about meaning, not just keywords. Example: a ticket saying "urgent, meeting in 30 minutes" got `high` priority, not `critical` — because the model evaluated it as time-sensitive but not a system-wide outage. You can guide this reasoning by writing precise `.describe()` text:
```ts
priority: z.enum(["low", "medium", "high", "critical"])
  .describe("critical = system down or all users blocked, high = time-sensitive but workaround exists")
```

---

**Q: What is the full flow of `.withStructuredOutput()`?**  
A:
```
1. Define Zod schema (shape + field descriptions)
2. model.withStructuredOutput(schema) → creates structured model instance
3. structuredModel.invoke([messages]) → HTTP call with function calling
4. Model fills schema fields from the text
5. You receive a typed TypeScript object — no parsing, no try/catch
```
