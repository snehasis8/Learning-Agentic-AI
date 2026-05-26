/**
 * Module 2.1 — Document Loaders & Text Splitting
 *
 * WHAT YOU'LL LEARN:
 *   - How to load a text file into LangChain as Document objects
 *   - What a Document is (pageContent + metadata)
 *   - How to split documents into chunks with RecursiveCharacterTextSplitter
 *   - What chunkSize and chunkOverlap do
 *   - How metadata flows from loader through to every chunk
 *
 * WHY THIS MATTERS:
 *   This is Step 1 of RAG. Before you can search a document, you need to:
 *     1. Load it                        ← this module (Part 1-2)
 *     2. Split it into searchable chunks ← this module (Part 3-5)
 *     3. Embed the chunks               ← Module 2.2
 *     4. Store in a vector DB           ← Module 2.2
 *     5. Retrieve + Generate            ← Module 2.3
 *
 * Run: npx tsx 02-rag-memory/01-document-loaders.ts
 */

import "dotenv/config";
import { readFile } from "fs/promises";
import { Document } from "@langchain/core/documents";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";

// Helper: mimics what TextLoader does internally
async function loadTextFile(filePath: string): Promise<Document[]> {
  const text = await readFile(filePath, "utf-8");
  return [new Document({ pageContent: text, metadata: { source: filePath } })];
}

// =============================================================================
// PART 1 — What is a Document?
// =============================================================================
// Before loading anything, let's understand what we're loading INTO.
// A LangChain Document has exactly two fields:
//   - pageContent: string  → the actual text
//   - metadata: object     → info ABOUT the text (source, page, etc.)
//
// This simple structure is the universal currency of the RAG pipeline.
// Every loader produces Documents. Every splitter consumes and produces Documents.
// Every retriever returns Documents.

async function whatIsADocument() {
  console.log("=== PART 1: What is a Document? ===\n");

  // We can create a Document manually to understand the structure
  // (In real usage, loaders create these for you)
  const doc = new Document({
    pageContent: "The Apollo 11 mission landed on the Moon on July 20, 1969.",
    metadata: {
      source: "space-history.txt",
      page: 1,
      author: "NASA Archives",
    },
  });

  console.log("pageContent:", doc.pageContent);
  console.log("metadata:", doc.metadata);
  console.log("\nKey insight: metadata travels with the text everywhere in the pipeline.");
  console.log("When retrieved, you know exactly WHERE the answer came from.\n");
}

// =============================================================================
// PART 2 — Loading a File with TextLoader
// =============================================================================
// TextLoader reads a plain text file from disk and returns an array of Documents.
// For a single file it returns ONE Document (the whole file as pageContent).
// The metadata.source is automatically set to the file path.

async function loadingWithTextLoader() {
  console.log("=== PART 2: Loading a Text File ===\n");

  const docs = await loadTextFile("02-rag-memory/docs/space-exploration.txt");

  console.log(`Number of documents loaded: ${docs.length}`);
  console.log(`Metadata:`, docs[0].metadata);
  console.log(`\nFirst 200 characters of content:\n"${docs[0].pageContent.slice(0, 200)}..."`);
  console.log(`\nTotal characters: ${docs[0].pageContent.length}`);
  console.log("\nKey insight: One file = one Document. The whole file is one big chunk.");
  console.log("This is too large to embed or fit in a prompt efficiently.");
  console.log("In production, TextLoader/@langchain/community loaders do this same thing.\n");
}

// =============================================================================
// PART 3 — Splitting with RecursiveCharacterTextSplitter
// =============================================================================
// RecursiveCharacterTextSplitter breaks a Document into smaller chunks.
//
// Key parameters:
//   chunkSize    — target max characters per chunk
//   chunkOverlap — how many characters to repeat between adjacent chunks
//                  (prevents important content from being cut at boundaries)
//
// It tries to split at natural boundaries first:
//   "\n\n" (paragraph) → "\n" (line) → " " (word) → "" (character)
// This preserves semantic meaning as much as possible.

async function splittingDocuments() {
  console.log("=== PART 3: Splitting Documents ===\n");

  const docs = await loadTextFile("02-rag-memory/docs/space-exploration.txt");

  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 500,
    chunkOverlap: 50,
  });

  const chunks = await splitter.splitDocuments(docs);

  console.log(`Original document: 1 document, ${docs[0].pageContent.length} characters`);
  console.log(`After splitting: ${chunks.length} chunks`);
  console.log(`\nFirst chunk (${chunks[0].pageContent.length} chars):`);
  console.log(`"${chunks[0].pageContent}"`);
  console.log(`\nSecond chunk (${chunks[1].pageContent.length} chars):`);
  console.log(`"${chunks[1].pageContent}"`);
  console.log("\nKey insight: Each chunk is small enough to embed AND fit in a prompt.");
  console.log("Now we can search at the chunk level, not the document level.\n");
}

// =============================================================================
// PART 4 — Metadata Flows Through Splitting
// =============================================================================
// When you split a Document, EVERY chunk inherits the original metadata.
// The splitter also adds a 'loc' field showing the character offset.
//
// This means after retrieval you can always trace a chunk back to:
//   - which file it came from (metadata.source)
//   - where in the file it appeared (metadata.loc)

async function metadataInChunks() {
  console.log("=== PART 4: Metadata in Chunks ===\n");

  const docs = await loadTextFile("02-rag-memory/docs/space-exploration.txt");

  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 500,
    chunkOverlap: 50,
  });

  const chunks = await splitter.splitDocuments(docs);

  console.log("Metadata of first 3 chunks:\n");
  for (let i = 0; i < 3; i++) {
    console.log(`Chunk ${i + 1}:`, chunks[i].metadata);
  }

  console.log("\nKey insight: Every chunk knows its source.");
  console.log("In a RAG response, you can cite: 'Source: space-exploration.txt, lines 1-15'\n");
}

// =============================================================================
// PART 5 — Effect of chunkSize and chunkOverlap
// =============================================================================
// Different chunkSize values produce dramatically different results.
// Smaller chunks = more precise retrieval, less context per chunk.
// Larger chunks = more context, but less precise and more tokens to process.
//
// Overlap ensures boundary content isn't lost between adjacent chunks.
// Typical values: chunkSize 500-1500, chunkOverlap 10-20% of chunkSize.

async function chunkSizeExperiment() {
  console.log("=== PART 5: Effect of chunkSize and chunkOverlap ===\n");

  const docs = await loadTextFile("02-rag-memory/docs/space-exploration.txt");

  const configs = [
    { chunkSize: 200, chunkOverlap: 0 },
    { chunkSize: 500, chunkOverlap: 50 },
    { chunkSize: 1000, chunkOverlap: 100 },
  ];

  for (const config of configs) {
    const splitter = new RecursiveCharacterTextSplitter(config);
    const chunks = await splitter.splitDocuments(docs);
    console.log(
      `chunkSize=${config.chunkSize}, overlap=${config.chunkOverlap} → ${chunks.length} chunks`
    );
  }

  // Show the overlap effect
  console.log("\n--- Overlap in action ---");
  const splitterWithOverlap = new RecursiveCharacterTextSplitter({
    chunkSize: 200,
    chunkOverlap: 50,
  });
  const chunksWithOverlap = await splitterWithOverlap.splitDocuments(docs);

  console.log("\nEnd of chunk 1:");
  console.log(`"...${chunksWithOverlap[0].pageContent.slice(-60)}"`);
  console.log("\nStart of chunk 2:");
  console.log(`"${chunksWithOverlap[1].pageContent.slice(0, 60)}..."`);
  console.log("\nKey insight: The overlap means chunk 2 starts where chunk 1 almost ended.");
  console.log("Any sentence cut at the boundary appears in BOTH chunks — nothing is lost.\n");
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  await whatIsADocument();
  await loadingWithTextLoader();
  await splittingDocuments();
  await metadataInChunks();
  await chunkSizeExperiment();
}

main().catch(console.error);
