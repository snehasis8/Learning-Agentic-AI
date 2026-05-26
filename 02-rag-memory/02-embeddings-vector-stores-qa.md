# Module 2.2 Q&A — Embeddings & Vector Stores

---

## Q: What is an embedding?

A list of numbers (vector) that represents the **meaning** of a piece of text. The embedding model (e.g., `text-embedding-3-large`) converts any text into a fixed-size array of floats (3072 dimensions for text-embedding-3-large).

Similar meaning → similar numbers → close in vector space.

---

## Q: What is cosine similarity?

A measure of how similar two vectors are, based on the angle between them:
- Score ≈ 1.0 → nearly identical meaning
- Score ≈ 0.0 → unrelated
- Score ≈ -1.0 → opposite meaning

Formula: `dot(A, B) / (|A| × |B|)`

Used by vector stores to rank search results by relevance.

---

## Q: What is a vector store?

A database that stores documents alongside their vector embeddings and supports **similarity search** — given a query vector, find the stored vectors closest to it.

Key operations:
- `fromDocuments(docs, embeddings)` — embed and store documents
- `similaritySearch(query, k)` — find top-k most similar documents
- `similaritySearchWithScore(query, k)` — same but includes similarity scores

---

## Q: What is `MemoryVectorStore`?

An in-memory vector store from `@langchain/classic/vectorstores/memory`. It stores all vectors in RAM — no external database needed.

Pros: zero setup, great for learning and prototyping.
Cons: not persistent (lost on restart), doesn't scale to millions of documents.

```ts
import { MemoryVectorStore } from "@langchain/classic/vectorstores/memory";

const vectorStore = await MemoryVectorStore.fromDocuments(chunks, embeddings);
const results = await vectorStore.similaritySearch("my query", 3);
```

---

## Q: What is `AzureOpenAIEmbeddings`?

The LangChain wrapper for Azure OpenAI's embedding API. Configured via environment variables:

```ts
import { AzureOpenAIEmbeddings } from "@langchain/openai";

const embeddings = new AzureOpenAIEmbeddings({
  azureOpenAIApiDeploymentName: process.env.AZURE_OPENAI_EMBEDDING_DEPLOYMENT,
  azureOpenAIApiVersion: process.env.AZURE_OPENAI_EMBEDDING_API_VERSION,
});
```

Key methods:
- `embedQuery(text)` — embed a single string → `number[]`
- `embedDocuments(texts)` — embed multiple strings → `number[][]`

---

## Q: What is the full preparation pipeline?

```
Load file → Split into chunks → Embed each chunk → Store in vector store
```

```ts
const docs = await loadTextFile("file.txt");
const chunks = await splitter.splitDocuments(docs);
const vectorStore = await MemoryVectorStore.fromDocuments(chunks, embeddings);
```

This is done **once** per document. After this, you can search many times.

---

## Q: What is the query pipeline?

```
User question → Embed question → Find closest chunks → Return results
```

```ts
const results = await vectorStore.similaritySearch("my question", 3);
// results = Document[] with the 3 most relevant chunks
```

---

## Q: What does `similaritySearchWithScore` give you?

Returns `[Document, number][]` — each result paired with its similarity score. Useful for:
- Setting a relevance threshold ("only use chunks with score > 0.7")
- Telling the user "I don't know" when no chunks are relevant enough

---

## Q: How does this connect to RAG?

Module 2.2 completes the **retrieval** half of RAG:
```
Load → Split → Embed → Store → RETRIEVE (search)
                                    ↓
Module 2.3 adds:              Augment prompt → Generate answer (LLM)
```

The vector store IS the retrieval engine. Module 2.3 connects it to the LLM.

---

## Q: Production vector stores vs MemoryVectorStore?

| Feature | MemoryVectorStore | Chroma / Pinecone / pgvector |
|---|---|---|
| Persistent | No (lost on restart) | Yes |
| Scalable | Small datasets only | Millions of vectors |
| Setup | Zero | Requires DB process or cloud account |
| Use case | Learning, prototyping | Production apps |

For this course we use `MemoryVectorStore`. The API is identical — switching to a real DB later is just changing the import and connection config.
