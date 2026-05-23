# Module 1.2 — Prompt Templates: Q&A Reference

---

**Q: Why is string interpolation (`${variable}`) not enough for prompts in real apps?**  
A: Three problems:
1. **No validation** — if a variable is `undefined`, the model silently receives `"undefined"` in the prompt, producing wrong results with no error
2. **DRY violation** — prompt structure gets copy-pasted across files; change the prompt = update every copy
3. **Not composable** — raw strings can't be plugged into LCEL chains; `ChatPromptTemplate` can

---

**Q: What does `ChatPromptTemplate.fromMessages()` actually do?**  
A: It creates a reusable template function. The `{placeholders}` in the strings are variable slots. The template knows what variables it expects (`.inputVariables`), validates they're provided at invoke time, and produces a typed `Messages[]` array when called. Think of it as a function: shape defined once, called with different data each time.

---

**Q: What are `.inputVariables` on a template?**  
A: An array of variable names the template expects to be filled. E.g., a template with `{language}` and `{text}` placeholders has `inputVariables: ['language', 'text']`. This is the template's "contract" — it tells you exactly what data it needs.

---

**Q: What is `.formatMessages()` and when would you use it?**  
A: It fills the template variables and returns the formatted `Messages[]` array — without calling the model. It's a debugging/inspection tool: use it when you want to verify what your template produces before it gets sent to the LLM. In production you don't call it directly — `chain.invoke()` does it internally.

---

**Q: What does `template.pipe(model)` do? What happens when you call `.invoke()` on the chain?**  
A: `.pipe(model)` connects two steps: template → model. When you call `chain.invoke({ language, text })`:
1. Template fills variables → produces `Messages[]`
2. Messages are passed to `model.invoke()` → HTTP call fires → `AIMessage` returned
`.pipe()` is the foundation of LCEL — output of one step becomes input of the next.

---

**Q: What is few-shot prompting and why does it work?**  
A: Instead of explaining the desired output format to the model, you show it 2-3 example input→output pairs. The model sees what looks like its own conversation history and mimics the pattern. It works because LLMs are trained to continue patterns — showing examples is more reliable than describing the format in words.

---

**Q: In few-shot prompting, why use `AIMessage` for example outputs instead of `HumanMessage` or `SystemMessage`?**  
A: `AIMessage` maps to `role: "assistant"` in the HTTP body. The model sees these as its own past responses. You're essentially faking a past conversation — "here's how you already answered this type of question." If you used `HumanMessage` instead, you'd get two consecutive user messages with no assistant reply between them, which is an unusual structure the model would likely misinterpret.

---

**Q: What is `.partial()` and what problem does it solve?**  
A: `.partial()` creates a child template from a parent template with some variables pre-filled. The child template only requires the remaining unfilled variables at invoke time. Use case: when some variables are fixed at app startup (e.g., agent role, language) but others vary per request (e.g., user question). Instead of passing fixed variables on every `.invoke()` call across your app, bake them in once with `.partial()`.

---

**Q: Real-world example of partial templates?**  
A: A customer support app with multiple agent personas:
```ts
const billingChain = template.partial({ role: "billing agent", style: "formal" }).pipe(model)
const techChain    = template.partial({ role: "tech agent", style: "concise" }).pipe(model)

// Anywhere in app — only pass what changes:
billingChain.invoke({ question: userQuestion })
```
Role and style are configured once; only the user's question is dynamic.

---

**Q: What is the mental model for how template → chain → invoke all fit together?**  
A:
```
Template (shape/structure)
    + .pipe(model)         → Chain (template + model connected)
    + .invoke({ vars })    → Step 1: formatMessages fills variables
                           → Step 2: model.invoke() fires HTTP call
                           → Returns AIMessage
```
Template = define once. Chain = connect steps. Invoke = execute with data.
