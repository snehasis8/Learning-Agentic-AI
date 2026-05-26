# Module 2.1 Q&A — Document Loaders & Text Splitting

---

## Q: What is a LangChain `Document`?

A `Document` is a simple object with two fields:
- `pageContent: string` — the actual text content
- `metadata: object` — information about the text (source file, page number, author, etc.)

It is the universal data structure of the RAG pipeline. Every loader produces Documents, every splitter consumes and produces Documents, and every retriever returns Documents.

---

## Q: What does `TextLoader` do?

In older LangChain versions, `TextLoader` was a built-in class. In LangChain v1.x, file loading is done manually with Node.js `fs/promises` + the `Document` class:

```ts
import { readFile } from "fs/promises";
import { Document } from "@langchain/core/documents";

const text = await readFile("path/to/file.txt", "utf-8");
const docs = [new Document({ pageContent: text, metadata: { source: "path/to/file.txt" } })];
```

This is exactly what `TextLoader` did internally — reading the file and wrapping it in a `Document`. File-specific loaders (PDF, CSV, DOCX) are available in `@langchain/community`.

---

## Q: Why can't we just embed the whole document as one chunk?

Three reasons:
1. **Token limit** — embedding models have a max input size (typically 512–8192 tokens). A large document exceeds this.
2. **Retrieval precision** — a single vector for the whole document averages all its meaning into one point. It can't identify *which part* is relevant to a query.
3. **Context noise** — passing an entire document to the LLM floods it with irrelevant text, degrading answer quality.

---

## Q: What is `RecursiveCharacterTextSplitter`?

A text splitter that breaks Documents into smaller chunks while trying to preserve natural text boundaries.

It tries separators in this order: `["\n\n", "\n", " ", ""]`
- First tries paragraph breaks (`\n\n`) — least damage to meaning
- Falls back to line breaks (`\n`), then word boundaries (` `)
- Last resort: cuts mid-character (`""`)

It's "recursive" because it keeps trying smaller separators until the chunk fits within `chunkSize`.

---

## Q: What are `chunkSize` and `chunkOverlap`?

| Parameter | What it controls |
|---|---|
| `chunkSize` | Maximum characters per chunk (target size) |
| `chunkOverlap` | How many characters are repeated between adjacent chunks |

**chunkOverlap** solves the boundary problem: if a sentence spans the end of chunk 1 and the start of chunk 2, overlap ensures the full sentence appears in at least one chunk.

Typical values: `chunkSize: 500–1500`, `chunkOverlap: 50–150` (10–20% of chunkSize).

---

## Q: Does metadata survive splitting?

Yes. When you call `splitter.splitDocuments(docs)`, every chunk inherits the **full metadata** of its parent Document. The splitter also adds a `loc` field with character offset information.

```ts
// Original doc metadata: { source: "space-exploration.txt" }
// Chunk metadata:        { source: "space-exploration.txt", loc: { lines: { from: 1, to: 15 } } }
```

This allows every retrieved chunk to be traced back to its source file and location.

---

## Q: What is the difference between `splitText` and `splitDocuments`?

| Method | Input | Output |
|---|---|---|
| `splitter.splitText(text)` | A raw string | `string[]` |
| `splitter.splitDocuments(docs)` | `Document[]` | `Document[]` (with metadata preserved) |

Always use `splitDocuments` in a RAG pipeline so metadata is not lost.

---

## Q: What import paths are used in this module?

```ts
import { readFile } from "fs/promises";                          // Node.js built-in
import { Document } from "@langchain/core/documents";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
```

`@langchain/textsplitters` must be installed separately:
```
npm install @langchain/textsplitters
```

---

## Q: What comes after document loading in the RAG pipeline?

```
Load → Split → Embed → Store → Retrieve → Generate
 2.1     2.1     2.2    2.2      2.3        2.3
```

Module 2.1 covers Load + Split. Module 2.2 covers Embed + Store. Module 2.3 assembles the full pipeline.
