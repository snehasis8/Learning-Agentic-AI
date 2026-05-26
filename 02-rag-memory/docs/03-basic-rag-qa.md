# Module 2.3 Q&A — Basic RAG

---

## Q: What is RAG?

**Retrieval-Augmented Generation.** A pattern where the LLM's answer is grounded in retrieved documents rather than relying solely on its training data.

```
User question → Retrieve relevant chunks → Stuff into prompt → LLM generates answer
```

---

## Q: What are the 3 steps of RAG?

1. **Retrieve** — find the most relevant chunks from the vector store
2. **Augment** — insert those chunks into the prompt as context
3. **Generate** — the LLM produces an answer based on that context

---

## Q: What is a retriever?

LangChain's standard interface for document retrieval. Any vector store can become a retriever:

```ts
const retriever = vectorStore.asRetriever(3); // returns top 3 docs
const docs = await retriever.invoke("my question");
```

It's the same as `similaritySearch(query, k)` but implements the Runnable interface, so it plugs into LCEL chains.

---

## Q: What does the RAG prompt look like?

```
Answer the question based ONLY on the following context.
If the context doesn't contain the answer, say "I don't know."

Context:
{context}

Question: {question}

Answer:
```

Key elements:
- **Context** = the retrieved chunks joined together
- **"ONLY on the following context"** = prevents hallucination
- **"I don't know"** = graceful fallback for out-of-scope questions

---

## Q: What is `RunnableSequence.from()`?

A way to build an LCEL chain from an array of steps:

```ts
const chain = RunnableSequence.from([
  { context: retrieverFn, question: passThroughFn },  // Step 1: prepare inputs
  ragPrompt,           // Step 2: format prompt
  model,              // Step 3: call LLM
  new StringOutputParser(),  // Step 4: extract string
]);
```

Each step's output becomes the next step's input.

---

## Q: What does `formatDocs` do?

Joins multiple Document objects into a single context string:

```ts
function formatDocs(docs: Document[]): string {
  return docs.map(doc => doc.pageContent).join("\n\n");
}
```

The retriever returns `Document[]`, but the prompt needs a `string`. This bridges the gap.

---

## Q: How do you add source citations?

After retrieval, extract metadata from the returned documents:

```ts
const docs = await retriever.invoke(question);
const sources = docs.map(doc => ({
  source: doc.metadata.source,
  lines: doc.metadata.loc?.lines,
}));
```

Display alongside the answer: *"Source: space-exploration.txt, lines 9–11"*

---

## Q: Why does RAG say "I don't know" for unrelated questions?

Because the prompt says **"Answer ONLY based on the context."** If the retrieved chunks don't contain the answer (e.g., "What color is a giraffe?" when your doc is about space), the LLM follows the instruction and says it doesn't know.

This is the key advantage of RAG over plain LLM: **reduced hallucination** because answers are grounded in actual documents.

---

## Q: What's the full pipeline from file to answer?

```
PREPARATION (once):
  File → Load → Split → Embed → Store in vector DB

QUERY (per question):
  Question → Embed → Search vector DB → Get top-k chunks
  → Format into prompt → LLM → Answer
```

---

## Q: Manual RAG vs Chain RAG?

| Approach | Pros | Cons |
|---|---|---|
| Manual (Part 1) | Clear, easy to debug | Verbose, not reusable |
| LCEL Chain (Part 3) | Composable, reusable, one `.invoke()` | Slightly more abstract |

In production, use chains. For learning/debugging, manual is easier to understand.
