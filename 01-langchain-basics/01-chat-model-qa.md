# Module 1.1 — Chat Models: Q&A Reference

---

**Q: What is a chat completion API at its core?**  
A: A single HTTP POST request. You send a JSON body with `{ messages, temperature, max_tokens }` and get back a JSON response with the model's reply inside `choices[0].message.content`. Every LLM library (LangChain, Vercel AI SDK, etc.) is ultimately making this same HTTP call.

---

**Q: What are the three message roles and what is each used for?**  
A:
- `system` — Developer instructions. Sets the model's behavior, personality, rules, and constraints. Invisible to the end user. This is your control layer and a security boundary to separate your instructions from user input.
- `user` — The end user's input. Questions, commands, anything the user sends.
- `assistant` — The model's responses. Also used when you want to inject conversation history or few-shot examples into the prompt.

---

**Q: In Azure OpenAI, why is the deployment name in the URL instead of the request body?**  
A: Azure organizes models as named deployments within a resource. One Azure resource can host multiple deployments (e.g., `gpt-4.1`, `gpt-4o`, `text-embedding-3-large`). The URL routes to a specific deployment. This differs from OpenAI directly, where you pass `model: "gpt-4"` in the request body.

---

**Q: What does `temperature` control and what are the practical values to use?**  
A: Temperature controls randomness of token selection. The model internally produces a probability distribution over all possible next tokens.
- `0` — Always picks the highest probability token. Deterministic — same input always gives same output. Use for: data extraction, classification, structured output.
- `0.5–0.7` — Balanced. Good for general chat and explanations.
- `1.0` — More varied and creative responses.
- `1.5+` — High randomness. Useful for brainstorming, name generation.
- `2` — Often incoherent. The model starts sampling from low-probability tokens.

---

**Q: What are tokens and why do they matter?**  
A: A token is roughly 0.75 words in English (or ~4 characters). They matter for two reasons:
1. **Cost** — You are billed per token (both input/prompt tokens + output/completion tokens).
2. **Context window** — Each model has a maximum token limit for input + output combined (GPT-4.1 supports ~128K input tokens). Exceeding it causes the call to fail. This is why managing conversation history length matters in real apps.

---

**Q: Why is the response structure `choices[0].message.content` instead of just `message.content`?**  
A: The API supports a parameter `n` (number of completions). If you set `n: 3`, the model generates 3 different responses in one call, returned as `choices[0]`, `choices[1]`, `choices[2]`. Default is `n=1`, so you always use `choices[0]` in practice.

---

**Q: When does `new AzureChatOpenAI({...})` make an HTTP call?**  
A: Never. The constructor just stores configuration. The HTTP call fires when you call `.invoke()`. This means you should create the model instance once at startup and call `.invoke()` many times — never create `new AzureChatOpenAI()` inside a loop.

---

**Q: What does LangChain's `.invoke()` give you over raw fetch?**  
A: Instead of navigating raw JSON (`data.choices[0].message.content`), you get a typed `AIMessage` object and access the content via `response.content`. More importantly, this interface is **identical across all providers** — swap `AzureChatOpenAI` for `ChatAnthropic` or `ChatGoogleGenerativeAI` and your `.invoke()` call stays the same.

---

**Q: What is the difference between passing messages as tuples vs class instances?**  
A:
```ts
// Tuples — shorthand, convenient
model.invoke([["system", "..."], ["user", "..."]])

// Class instances — explicit, carry metadata
model.invoke([new SystemMessage("..."), new HumanMessage("...")])
```
LangChain converts tuples to class instances internally. Use class instances when:
1. You need to attach metadata (e.g., `tool_calls`, `id`)
2. You're building conversation history (the model returns `AIMessage` objects — keep types consistent)
3. You're working with LCEL chains that expect typed message objects

---

**Q: What HTTP status code do you get if the `api-key` header is missing?**  
A: `401 Unauthorized` — you didn't authenticate at all. (403 would mean authenticated but lacking permission — a different scenario.)

---

**Q: What is `const` vs `let` inside a `for...of` loop?**  
A: Use `const`. Each loop iteration creates a brand new scope with fresh bindings — `const model` in iteration 1 is a completely different binding from `const model` in iteration 2. They never get reassigned; they go out of scope at the end of each iteration. Only use `let` if you need to reassign the variable within the same iteration.
