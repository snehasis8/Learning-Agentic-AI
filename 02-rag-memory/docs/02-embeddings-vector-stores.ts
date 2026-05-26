/**
 * Module 2.2 — Embeddings & Vector Stores
 *
 * WHAT YOU'LL LEARN:
 *   - What embeddings are and how to generate them
 *   - How AzureOpenAIEmbeddings turns text into vectors
 *   - What a vector store does (store + search)
 *   - How to use MemoryVectorStore for in-memory similarity search
 *   - How to combine document splitting with embedding + retrieval
 *
 * PREREQUISITES:
 *   - Module 2.1 (Document Loaders & Text Splitting)
 *   - .env with AZURE_OPENAI_EMBEDDING_DEPLOYMENT set
 *
 * Run: npx tsx 02-rag-memory/02-embeddings-vector-stores.ts
 */

import "dotenv/config";
import { readFile } from "fs/promises";
import { Document } from "@langchain/core/documents";
import { AzureOpenAIEmbeddings } from "@langchain/openai";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { MemoryVectorStore } from "@langchain/classic/vectorstores/memory";

// Embedding model — turns text into vectors
const embeddings = new AzureOpenAIEmbeddings({
  azureOpenAIApiKey: process.env.AZURE_OPENAI_API_KEY,
  azureOpenAIApiDeploymentName: process.env.AZURE_OPENAI_EMBEDDING_DEPLOYMENT,
  azureOpenAIApiVersion: process.env.AZURE_OPENAI_EMBEDDING_API_VERSION,
  azureOpenAIApiInstanceName: "dhfoundary",
  azureOpenAIBasePath: `${process.env.AZURE_OPENAI_ENDPOINT}openai/deployments`,
});

// Helper from Module 2.1
async function loadTextFile(filePath: string): Promise<Document[]> {
  const text = await readFile(filePath, "utf-8");
  return [new Document({ pageContent: text, metadata: { source: filePath } })];
}

// =============================================================================
// PART 1 — What is an Embedding?
// =============================================================================
// An embedding is a list of numbers (vector) that captures the MEANING of text.
// Similar text → similar vectors → close together in vector space.
//
// The embedding model (text-embedding-3-large) converts text into a
// high-dimensional vector (3072 numbers for text-embedding-3-large).

async function whatIsAnEmbedding() {
  console.log("=== PART 1: What is an Embedding? ===\n");

  // Embed a single piece of text
  const vector = await embeddings.embedQuery("What is the Apollo 11 mission?");

  console.log(vector);
  console.log(`Vector dimensions: ${vector.length}`);
  console.log(`First 10 values: [${vector.slice(0, 10).map(v => v.toFixed(4)).join(", ")}]`);
  console.log(`\nThis array of ${vector.length} numbers IS the meaning of that sentence.`);
  console.log("Similar sentences will produce similar arrays.\n");
}

// =============================================================================
// PART 2 — Comparing Embeddings (Cosine Similarity)
// =============================================================================
// Two vectors that are "close" in space represent similar meaning.
// Let's prove it by comparing related vs unrelated sentences.

async function comparingEmbeddings() {
  console.log("=== PART 2: Comparing Embeddings ===\n");

  const sentences = [
    "The Apollo 11 mission landed on the Moon in 1969",  // reference
    "Neil Armstrong was the first person to walk on the lunar surface",  // similar
    "How to bake chocolate chip cookies at home",  // unrelated
  ];

  const vectors = await Promise.all(sentences.map(s => embeddings.embedQuery(s)));

  // Cosine similarity function
  function cosineSimilarity(a: number[], b: number[]): number {
    let dot = 0, magA = 0, magB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      magA += a[i] * a[i];
      magB += b[i] * b[i];
    }
    return dot / (Math.sqrt(magA) * Math.sqrt(magB));
  }

  const sim1 = cosineSimilarity(vectors[0], vectors[1]);
  const sim2 = cosineSimilarity(vectors[0], vectors[2]);

  console.log(`"${sentences[0]}"\n`);
  console.log(`vs "${sentences[1]}"`);
  console.log(`   → Similarity: ${sim1.toFixed(4)} (HIGH — same topic)\n`);
  console.log(`vs "${sentences[2]}"`);
  console.log(`   → Similarity: ${sim2.toFixed(4)} (LOW — completely different)\n`);
  console.log("Key insight: The embedding model understands MEANING, not just keywords.");
  console.log("'Moon landing' and 'lunar surface' are close even though they share few words.\n");
}

// =============================================================================
// PART 3 — MemoryVectorStore Basics
// =============================================================================
// A vector store holds documents + their vectors and lets you search by similarity.
// MemoryVectorStore stores everything in RAM — no external DB needed.
//
// Two steps: 1) Add documents (auto-embeds them) 2) Search with a query

async function memoryVectorStoreBasics() {
  console.log("=== PART 3: MemoryVectorStore Basics ===\n");

  // Create a vector store from a few documents manually
  const docs = [
    new Document({ pageContent: "The Moon is Earth's only natural satellite.", metadata: { topic: "moon" } }),
    new Document({ pageContent: "Mars is called the Red Planet due to iron oxide on its surface.", metadata: { topic: "mars" } }),
    new Document({ pageContent: "JavaScript is a programming language for the web.", metadata: { topic: "programming" } }),
    new Document({ pageContent: "The ISS orbits Earth at about 400 km altitude.", metadata: { topic: "space station" } }),
  ];

  // fromDocuments: embeds all docs and stores them in memory
  const vectorStore = await MemoryVectorStore.fromDocuments(docs, embeddings);


  console.log(vectorStore);

  // Search for the most similar document to a query
  const results = await vectorStore.similaritySearch("Tell me about Mars exploration", 2);
   console.log("raw results -----------------");
   console.log(results);
  console.log(`Query: "Tell me about Mars exploration"`);
  console.log(`Top 2 results:\n`);
  for (const result of results) {
    console.log(`  [${result.metadata.topic}] "${result.pageContent}"`);
  }
  console.log("\nKey insight: It found Mars AND ISS (both space-related).");
  console.log("JavaScript was ranked last because it has nothing to do with space.\n");
}

// =============================================================================
// PART 4 — Full Pipeline: Load → Split → Embed → Search
// =============================================================================
// Now let's put it all together with our space exploration document.
// This is the PREPARATION step of RAG — done once per document.

async function fullPipeline() {
  console.log("=== PART 4: Full Pipeline (Load → Split → Embed → Search) ===\n");

  // Step 1: Load
  const docs = await loadTextFile("02-rag-memory/docs/space-exploration.txt");
  console.log(`Loaded: ${docs.length} document, ${docs[0].pageContent.length} chars`);

  // Step 2: Split
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 500,
    chunkOverlap: 50,
  });
  const chunks = await splitter.splitDocuments(docs);
  console.log(`Split into: ${chunks.length} chunks`);

  // Step 3: Embed & Store (MemoryVectorStore does both at once)
  const vectorStore = await MemoryVectorStore.fromDocuments(chunks, embeddings);
  console.log(`Stored: ${chunks.length} vectors in memory\n`);

  // Step 4: Search
  const query = "When did humans first land on the Moon?";
  const results = await vectorStore.similaritySearch(query, 3);

  console.log(`Query: "${query}"`);
  console.log(`\nTop 3 relevant chunks:\n`);
  for (let i = 0; i < results.length; i++) {
    console.log(`--- Result ${i + 1} ---`);
    console.log(results[i].pageContent);
    console.log(`Metadata:`, results[i].metadata);
    console.log();
  }

  console.log("Key insight: We found the Apollo 11 chunk WITHOUT keyword matching.");
  console.log("The query says 'land on the Moon', the text says 'walk on the lunar surface'.");
  console.log("Embeddings understand they mean the same thing.\n");
}

// =============================================================================
// PART 5 — Similarity Search with Scores
// =============================================================================
// You can also get the similarity SCORE alongside each result.
// This helps you set a threshold: "only use chunks with score > 0.7"

async function searchWithScores() {
  console.log("=== PART 5: Similarity Search with Scores ===\n");

  const docs = await loadTextFile("02-rag-memory/docs/space-exploration.txt");
  const splitter = new RecursiveCharacterTextSplitter({ chunkSize: 500, chunkOverlap: 50 });
  const chunks = await splitter.splitDocuments(docs);
  const vectorStore = await MemoryVectorStore.fromDocuments(chunks, embeddings);

  const queries = [
    "What is the James Webb Space Telescope?",
    "How do you make pasta from scratch?",  // irrelevant — should get low scores
  ];

  for (const query of queries) {
    console.log(`Query: "${query}"`);
    const results = await vectorStore.similaritySearchWithScore(query, 3);

    console.log(results);
    console.log( '***************raw result printed**************** ')
    for (const [doc, score] of results) {
      console.log(`  Score: ${score.toFixed(4)} | "${doc.pageContent.slice(0, 80)}..."`);
    }
    console.log();
  }

  console.log("Key insight: Relevant queries get HIGH scores. Irrelevant queries get LOW scores.");
  console.log("In production, you'd filter: if score < threshold, tell the user 'I don't know'.\n");
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
//   await whatIsAnEmbedding();
//    await comparingEmbeddings();
//    await memoryVectorStoreBasics();
  await fullPipeline();
  await searchWithScores();
}

main().catch(console.error);
