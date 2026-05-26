/**
 * Exercise — Module 2.1: Document Loaders & Text Splitting
 *
 * CHALLENGE: Load, Split, and Inspect a Document
 *
 * You have been given a text file at: 02-rag-memory/docs/space-exploration.txt
 *
 * STEP 1 — Load the document
 *   Use TextLoader to load the file.
 *   Print: how many documents were loaded, the metadata, and the total character count.
 *
 * STEP 2 — Split into chunks
 *   Use RecursiveCharacterTextSplitter with chunkSize=600 and chunkOverlap=80.
 *   Print: how many chunks were produced.
 *
 * STEP 3 — Inspect the chunks
 *   Print the content and character count of the first 3 chunks.
 *   Print the metadata of the first 3 chunks.
 *
 * STEP 4 — Find a specific topic
 *   Without using embeddings, manually scan the chunks and find which chunk(s)
 *   mention "Apollo 11". Print the chunk index and its content.
 *   Hint: chunks.findIndex(chunk => chunk.pageContent.includes("Apollo 11"))
 *
 * STEP 5 — Experiment with chunk sizes
 *   Run the splitter with three different chunkSize values: 200, 600, 1200.
 *   For each, print the number of chunks produced.
 *   Answer in a comment: what trade-off do you notice?
 *
 * BONUS — Add custom metadata
 *   After loading, manually add extra metadata fields to the document before splitting:
 *     { topic: "space", difficulty: "intermediate", year: 2024 }
 *   Verify that these fields appear in the chunk metadata after splitting.
 *   Hint: docs[0].metadata = { ...docs[0].metadata, topic: "space", ... }
 *
 * Run: npx tsx 02-rag-memory/exercises/01-document-loaders.ts
 */

import { readFile } from "fs/promises";
import { Document } from "@langchain/core/documents";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";

// Helper: loads a text file as a LangChain Document
async function loadTextFile(filePath: string): Promise<Document[]> {
  const text = await readFile(filePath, "utf-8");
  return [new Document({ pageContent: text, metadata: { source: filePath } })];
}

// TODO: Step 1 — Load the document


// TODO: Step 2 — Split into chunks


// TODO: Step 3 — Inspect first 3 chunks


// TODO: Step 4 — Find chunks mentioning "Apollo 11"


// TODO: Step 5 — Experiment with chunk sizes
// Answer in a comment below:
// Smaller chunkSize → more chunks → ???
// Larger chunkSize  → fewer chunks → ???


// TODO: BONUS — Add custom metadata before splitting


async function main() {
  // Call your functions here
}

main().catch(console.error);
