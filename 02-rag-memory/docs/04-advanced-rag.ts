/**
 * Module 2.4 — Advanced RAG
 *
 * WHAT YOU'LL LEARN:
 *   - Why basic RAG fails (vocabulary mismatch problem)
 *   - Multi-query retrieval: generate multiple search queries from one question
 *   - Deduplication: merge results from multiple searches without repeats
 *   - Contextual compression: trim retrieved chunks to only the relevant part
 *   - Putting it all together into a production-grade RAG pipeline
 *
 * PREREQUISITES:
 *   - Module 2.3 (Basic RAG)
 *
 * Run: npx tsx 02-rag-memory/04-advanced-rag.ts
 */

import "dotenv/config";
import { readFile } from "fs/promises";
import { Document } from "@langchain/core/documents";
import { AzureChatOpenAI, AzureOpenAIEmbeddings } from "@langchain/openai";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { MemoryVectorStore } from "@langchain/classic/vectorstores/memory";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { RunnableSequence } from "@langchain/core/runnables";

const model = new AzureChatOpenAI({
  azureOpenAIApiDeploymentName: process.env.AZURE_OPENAI_CHAT_DEPLOYMENT,
  azureOpenAIApiVersion: process.env.AZURE_OPENAI_API_VERSION,
  temperature: 0,
  maxTokens: 500,
});

const embeddings = new AzureOpenAIEmbeddings({
  azureOpenAIApiKey: process.env.AZURE_OPENAI_API_KEY,
  azureOpenAIApiDeploymentName: process.env.AZURE_OPENAI_EMBEDDING_DEPLOYMENT,
  azureOpenAIApiVersion: process.env.AZURE_OPENAI_EMBEDDING_API_VERSION,
  azureOpenAIApiInstanceName: "dhfoundary",
  azureOpenAIBasePath: `${process.env.AZURE_OPENAI_ENDPOINT}openai/deployments`,
});

async function loadTextFile(filePath: string): Promise<Document[]> {
  const text = await readFile(filePath, "utf-8");
  return [new Document({ pageContent: text, metadata: { source: filePath } })];
}

async function prepareVectorStore() {
  const docs = await loadTextFile("02-rag-memory/docs/space-exploration.txt");
  const splitter = new RecursiveCharacterTextSplitter({ chunkSize: 500, chunkOverlap: 50 });
  const chunks = await splitter.splitDocuments(docs);
  return MemoryVectorStore.fromDocuments(chunks, embeddings);
}

// =============================================================================
// PART 1 — The Problem: Vocabulary Mismatch
// =============================================================================
// Basic RAG searches once with the user's exact question.
// But what if the document uses different words than the question?
// This part demonstrates the problem — and shows a naive fix.

async function vocabularyMismatch() {
  console.log("=== PART 1: The Vocabulary Mismatch Problem ===\n");

  const vectorStore = await prepareVectorStore();

  // These two questions mean the same thing but use different vocabulary
  const questions = [
    "What were the accomplishments of the Apollo missions?",   // formal
    "What did NASA do when they went to the moon?",            // informal
    "lunar landing program achievements",                       // keyword style
  ];

  console.log("Same concept, 3 different phrasings — how many chunks overlap?\n");

  const results: Document[][] = [];
  for (const q of questions) {
    const docs = await vectorStore.similaritySearch(q, 3);
    results.push(docs);
    console.log(`Query: "${q}"`);
    console.log(`  → chunks: ${docs.map(d => `"${d.pageContent.slice(0, 60)}..."`).join(", ")}\n`);
  }

  // Count how many unique chunks we got across all 3 searches
  const allContent = results.flat().map(d => d.pageContent);
  const unique = new Set(allContent);
  console.log(`Total chunks across 3 searches: ${allContent.length}`);
  console.log(`Unique chunks: ${unique.size}`);
  console.log("\nKey insight: Different phrasings retrieve different chunks.");
  console.log("Basic RAG only uses ONE phrasing — it misses what the others find.\n");
}

// =============================================================================
// PART 2 — Multi-Query: Generate Alternative Questions
// =============================================================================
// Use the LLM itself to generate multiple phrasings of the question.
// Then search with all of them. This is "multi-query retrieval".

async function generateQueries() {
  console.log("=== PART 2: Generating Alternative Queries with LLM ===\n");

  const multiQueryPrompt = ChatPromptTemplate.fromTemplate(`
You are an AI assistant helping to improve document retrieval.
Given a user question, generate 3 different versions of it.
Each version should use different vocabulary but ask about the same thing.
Return ONLY the 3 questions, one per line, no numbering, no extra text.

Original question: {question}`);

  const queryGeneratorChain = multiQueryPrompt
    .pipe(model)
    .pipe(new StringOutputParser());

  const question = "What were the major achievements of the Apollo program?";

  console.log(`Original: "${question}"\n`);
  console.log("Generating alternative phrasings...\n");

  const result = await queryGeneratorChain.invoke({ question });
  const alternatives = result.trim().split("\n").filter(q => q.trim());

  console.log("Generated alternatives:");
  alternatives.forEach((q, i) => console.log(`  ${i + 1}. ${q}`));

  console.log("\nKey insight: The LLM rephrases the question using different vocabulary.");
  console.log("We now have 4 queries (original + 3 alternatives) to search with.\n");

  return [question, ...alternatives];
}

// =============================================================================
// PART 3 — Multi-Query Retrieval + Deduplication
// =============================================================================
// Run all generated queries against the vector store.
// Merge results and deduplicate by content (same chunk may appear in multiple searches).

async function multiQueryRetrieval() {
  console.log("=== PART 3: Multi-Query Retrieval + Deduplication ===\n");

  const vectorStore = await prepareVectorStore();

  // Step 1: Generate alternative queries
  const multiQueryPrompt = ChatPromptTemplate.fromTemplate(`
You are an AI assistant helping to improve document retrieval.
Generate 3 alternative phrasings of the following question.
Return ONLY the 3 questions, one per line, no numbering, no extra text.

Original question: {question}`);

  const queryGeneratorChain = multiQueryPrompt
    .pipe(model)
    .pipe(new StringOutputParser());

  const originalQuestion = "What were the major achievements of the Apollo program?";

  const result = await queryGeneratorChain.invoke({ question: originalQuestion });
  const alternativeQueries = result.trim().split("\n").filter(q => q.trim());
  const allQueries = [originalQuestion, ...alternativeQueries];

  console.log(`Running ${allQueries.length} queries:\n`);
  allQueries.forEach((q, i) => console.log(`  ${i + 1}. ${q}`));
  console.log();

  // Step 2: Search with ALL queries
  const allDocs: Document[] = [];
  for (const query of allQueries) {
    const docs = await vectorStore.similaritySearch(query, 3);
    allDocs.push(...docs);
  }

  console.log(`Raw results: ${allDocs.length} chunks (with duplicates)`);

  // Step 3: Deduplicate by pageContent
  const seen = new Set<string>();
  const uniqueDocs = allDocs.filter(doc => {
    if (seen.has(doc.pageContent)) return false;
    seen.add(doc.pageContent);
    return true;
  });

  console.log(`After deduplication: ${uniqueDocs.length} unique chunks\n`);
  uniqueDocs.forEach((doc, i) => {
    console.log(`  ${i + 1}. "${doc.pageContent.slice(0, 80)}..."`);
  });

  console.log("\nKey insight: Multi-query casts a wider net.");
  console.log("More unique chunks = better coverage = better answers.\n");

  return uniqueDocs;
}

// =============================================================================
// PART 4 — Score-Based Filtering (Confidence Threshold)
// =============================================================================
// Before feeding chunks to the LLM, filter out low-confidence results.
// This is the "hard guard" we discussed — don't call the LLM if nothing is relevant.

async function scoreBasedFiltering() {
  console.log("=== PART 4: Score-Based Filtering ===\n");

  const vectorStore = await prepareVectorStore();

  const questions = [
    "What was the Apollo 11 mission?",       // in document
    "What is the capital of Mars?",           // not in document
  ];

  const THRESHOLD = 0.75;

  for (const question of questions) {
    console.log(`Q: "${question}"`);

    const results = await vectorStore.similaritySearchWithScore(question, 5);

    console.log(`  Top scores: ${results.map(([_, s]) => s.toFixed(3)).join(", ")}`);

    const confident = results.filter(([_, score]) => score >= THRESHOLD);

    if (confident.length === 0) {
      console.log(`  → All scores below ${THRESHOLD}. Skipping LLM call.`);
      console.log(`  → Response: "I don't have information about that."\n`);
    } else {
      console.log(`  → ${confident.length} chunk(s) above threshold. Proceeding to LLM.\n`);
    }
  }

  console.log("Key insight: Score filtering saves API calls and prevents hallucination.");
  console.log("It's a hard gate — if retrieval confidence is low, don't ask the LLM.\n");
}

// =============================================================================
// PART 5 — Complete Advanced RAG Pipeline
// =============================================================================
// Everything together:
//   question → generate alternatives → multi-search → deduplicate
//   → score filter → format context → LLM → answer

async function advancedRagPipeline() {
  console.log("=== PART 5: Complete Advanced RAG Pipeline ===\n");

  const vectorStore = await prepareVectorStore();
  const THRESHOLD = 0.70;
  const K = 3;

  // Query generation chain
  const queryGenPrompt = ChatPromptTemplate.fromTemplate(`
Generate 3 alternative phrasings of the following question using different vocabulary.
Return ONLY the 3 questions, one per line, no numbering, no extra text.

Question: {question}`);

  const queryGenChain = queryGenPrompt.pipe(model).pipe(new StringOutputParser());

  // Answer generation chain
  const answerPrompt = ChatPromptTemplate.fromTemplate(`
You are a helpful assistant that answers questions about space exploration.
Use ONLY the provided context. Be concise (2-3 sentences).
If the context doesn't contain the answer, say "I don't have information about that."

Context:
{context}

Question: {question}

Answer:`);

  const answerChain = answerPrompt.pipe(model).pipe(new StringOutputParser());

  // The full advanced RAG function
  async function advancedAsk(question: string): Promise<string> {
    // Step 1: Generate alternative queries
    const altResult = await queryGenChain.invoke({ question });
    const allQueries = [question, ...altResult.trim().split("\n").filter(q => q.trim())];

    // Step 2: Multi-query search
    const allDocs: Document[] = [];
    for (const q of allQueries) {
      const docs = await vectorStore.similaritySearch(q, K);
      allDocs.push(...docs);
    }

    // Step 3: Deduplicate
    const seen = new Set<string>();
    const uniqueDocs = allDocs.filter(doc => {
      if (seen.has(doc.pageContent)) return false;
      seen.add(doc.pageContent);
      return true;
    });

    // Step 4: Score filter using original question
    const scored = await vectorStore.similaritySearchWithScore(question, uniqueDocs.length + 5);
    const confidentContent = new Set(
      scored.filter(([_, s]) => s >= THRESHOLD).map(([d]) => d.pageContent)
    );
    const filteredDocs = uniqueDocs.filter(d => confidentContent.has(d.pageContent));

    if (filteredDocs.length === 0) {
      return "I don't have information about that in my documents.";
    }

    // Step 5: Generate answer
    const context = filteredDocs.map(d => d.pageContent).join("\n\n");
    return answerChain.invoke({ context, question });
  }

  // Test questions
  const questions = [
    "What did Neil Armstrong do on the Moon?",
    "Tell me about robotic missions to Mars",
    "What is the future of human spaceflight?",
    "What is the GDP of France?",   // out of scope
  ];

  console.log("--- Advanced RAG Q&A ---\n");
  for (const q of questions) {
    const answer = await advancedAsk(q);
    console.log(`Q: ${q}`);
    console.log(`A: ${answer}\n`);
  }

  console.log("Key insight: Multi-query + deduplication + score filtering = production-grade RAG.");
  console.log("Each layer fixes a specific weakness of basic RAG.\n");
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  await vocabularyMismatch();
  // await generateQueries();
  // await multiQueryRetrieval();
  // await scoreBasedFiltering();
  // await advancedRagPipeline();
}

main().catch(console.error);
