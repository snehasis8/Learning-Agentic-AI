# Module 2.4 Q&A — Advanced RAG

---

## Q: What is the main weakness of basic RAG?

**Vocabulary mismatch.** Vector search compares the embedding of your question to the embeddings of document chunks. If your question uses different words than the document, the similarity score is low even if the meaning is the same.

```
Question: "What were the accomplishments of the Apollo missions?"
Document: "Neil Armstrong set foot on the lunar surface..."

→ Different vocabulary → lower similarity → wrong chunks retrieved → bad answer
```

---

## Q: What is multi-query retrieval?

Instead of searching once with the user's original question, use an LLM to generate 3–4 alternative phrasings, then search with all of them and merge the results.

```
Original: "What were the Apollo achievements?"

LLM generates:
  1. "Apollo program accomplishments and milestones"
  2. "What did NASA achieve with the lunar missions?"
  3. "Moon landing program results"

→ Run 4 searches → merge → deduplicate → feed to LLM
```

**Why it works:** Different phrasings hit different chunks. Merging gives better coverage.

---

## Q: How do you deduplicate results from multiple searches?

Track which chunks have already been seen using a `Set` on `pageContent`:

```ts
const seen = new Set<string>();
const uniqueDocs = allDocs.filter(doc => {
  if (seen.has(doc.pageContent)) return false;
  seen.add(doc.pageContent);
  return true;
});
```

The same chunk may be returned by multiple queries — deduplication ensures the LLM sees it only once.

---

## Q: What is score-based filtering?

Using `similaritySearchWithScore()` to get confidence scores, then **dropping chunks below a threshold** before calling the LLM.

```ts
const THRESHOLD = 0.75;
const results = await vectorStore.similaritySearchWithScore(question, 5);
const confident = results.filter(([_, score]) => score >= THRESHOLD);

if (confident.length === 0) {
  return "I don't have information about that.";  // skip LLM call entirely
}
```

**Two guards:**
- **Soft guard** — prompt instruction ("Answer ONLY from context")
- **Hard guard** — score threshold (deterministic, saves API calls)

---

## Q: What is the tradeoff of multi-query retrieval?

| | Basic RAG | Multi-Query RAG |
|---|---|---|
| Embedding API calls | 1 per question | 4–5 per question |
| Retrieval coverage | Narrow | Wide |
| Answer quality | Lower for paraphrased questions | Higher |
| Cost/latency | Lower | Higher |

Use multi-query when **answer quality matters more than speed/cost** (e.g., internal knowledge base, enterprise Q&A).

---

## Q: What is hybrid search?

Combining two types of search to get the best of both:

| | Semantic (Vector) | Keyword (BM25) |
|---|---|---|
| Finds | Conceptually similar chunks | Exact word/phrase matches |
| Good for | "What happened during the moon landing?" | "Apollo 11", "1969", specific names |
| Bad at | Exact terms | Paraphrasing |

Hybrid search runs both and merges scores using **RRF (Reciprocal Rank Fusion)**. Requires a vector store that supports it (Pinecone, Azure AI Search, Chroma, etc.).

---

## Q: What is the full advanced RAG pipeline?

```
question
  ↓
LLM generates 3 alternative phrasings
  ↓
Run 4 searches (original + 3 alternatives) → k results each
  ↓
Merge all results → deduplicate by content
  ↓
Score filter: drop chunks below threshold
  ↓ (if nothing passes threshold → return "I don't know")
Format context string
  ↓
LLM generates answer
  ↓
Answer
```

---

## Q: Why use the LLM to generate alternative queries instead of writing them manually?

The LLM automatically adapts to any input question. You write the prompt once, and it works for any question. Manual alternatives would require you to anticipate every possible phrasing — not scalable.

---

## Q: Basic RAG vs Advanced RAG — when to use which?

| Scenario | Use |
|---|---|
| Prototyping / learning | Basic RAG |
| Small document, simple questions | Basic RAG |
| Large document, varied vocabulary | Multi-query RAG |
| Production Q&A over a knowledge base | Advanced RAG + score filtering |
| Need exact term matching (codes, IDs) | Hybrid search |
