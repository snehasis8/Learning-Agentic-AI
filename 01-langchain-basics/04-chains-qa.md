# Module 1.4 — Chains (LCEL): Q&A Reference

---

**Q: What problem do chains solve that manual sequential awaits don't?**  
A: Three problems with manual awaits:
1. **Not reusable** — the pipeline is buried in a function, hard to share
2. **Not composable** — can't pipe it into another step or extend it
3. **Not a value** — you can't pass the pipeline around, store it, or stream from it
A chain is a single `Runnable` object representing the entire pipeline — you can invoke it, stream it, batch it, and pipe it into other chains.

---

**Q: What is the `Runnable` interface and why does it matter?**  
A: Every component in LCEL (templates, models, parsers, plain functions) implements `Runnable`, meaning they all have:
- `.invoke(input)` — run once, return result
- `.stream(input)` — stream results token by token
- `.batch(inputs[])` — run multiple inputs in parallel
Because they all share this interface, they can all be connected with `.pipe()`. That's the entire design — a consistent contract that makes everything composable.

---

**Q: What does `.pipe()` do?**  
A: It connects two Runnables so the output of the first becomes the input of the second. It's the same mental model as Unix pipes or array method chaining:
```ts
// Array chaining
arr.map(x => x * 2).filter(el => el % 2 === 0)

// LCEL chaining — same idea, but async
template.pipe(model).pipe(outputParser)
```
Execution flows left to right. Each step awaits internally.

---

**Q: What does `StringOutputParser` do?**  
A: It extracts `.content` from an `AIMessage` and returns a plain `string`. It handles the `string | MessageContentComplex[]` type narrowing cleanly so you never need `as string` casts. It sits at the end of a chain when you want a plain string output instead of an `AIMessage` object.

---

**Q: What is the difference between `StringOutputParser`, `JsonOutputParser`, and `.withStructuredOutput()`?**  
A:
- `StringOutputParser` → extracts content, returns `string`
- `JsonOutputParser` → extracts content AND parses it as JSON, returns `object`
- `.withStructuredOutput(schema)` → uses function calling for guaranteed schema-validated typed object (most reliable)

---

**Q: When connecting two chains where the output of step 1 is a `string` but step 2 expects `{ key: string }`, what do you do?**  
A: Add a shape adapter function between them:
```ts
chain1.pipe((output: string) => ({ key: output })).pipe(chain2)
```
`ChatPromptTemplate` always expects an object with named keys matching its `{placeholders}`. A bare string doesn't match, so you wrap it. This is the ES6 shorthand: `({ key })` is the same as `({ key: key })`.

---

**Q: What is `RunnableSequence.from([...])` and when do you use it over `.pipe()`?**  
A: Both produce identical chains. `RunnableSequence.from([step1, step2, step3])` is more readable for longer chains where chaining many `.pipe()` calls becomes hard to follow. Plain functions can be included as steps — they're automatically wrapped as Runnables.

---

**Q: What is `RunnableParallel` and what is it equivalent to in plain JavaScript?**  
A: It runs multiple chains concurrently with the same input and returns an object with named results. Equivalent to `Promise.all()`, but as a reusable, composable chain object:
```ts
// Promise.all equivalent:
const [pros, cons] = await Promise.all([proChain.invoke(input), conChain.invoke(input)])

// RunnableParallel:
const result = await RunnableParallel.from({ pros: proChain, cons: conChain }).invoke(input)
// result.pros, result.cons
```

---

**Q: When does `RunnableParallel` matter in agentic systems?**  
A: When you need multiple independent LLM calls on the same input:
- Multi-agent: supervisor sends input to 3 specialized agents simultaneously
- RAG: search vector DB + SQL DB in parallel, merge results
- Evaluation: run same input through multiple prompt variants to compare
- Research agents: fetch multiple web pages concurrently
With N parallel calls, total latency ≈ slowest single call. Sequential = N × average call time.

---

**Q: Why might sequential sometimes beat parallel in a single benchmark run?**  
A: Network jitter. Each HTTP call to Azure OpenAI has variable latency. With only 2 calls, sequential can get lucky with two fast responses. The advantage of parallel shows consistently when averaged over multiple runs or when N > 2 calls.

---

**Q: What is the mental model for the full LCEL pipeline?**  
A:
```
.invoke({ vars })
    ↓
Template fills {vars} → Messages[]
    ↓
model.invoke(Messages[]) → HTTP call → AIMessage
    ↓
Parser extracts → string / object
    ↓
(optional) transform function → final shape
```
Each arrow is one `.pipe()` step. The chain object holds all steps — one `.invoke()` runs them all.
