/**
 * Module 1.4 — Chains & LCEL (LangChain Expression Language)
 *
 * PART 1: The manual way — sequential awaits, no chain
 * PART 2: Basic chain with .pipe() — template → model → parser
 * PART 3: Multi-step chain — chaining 3+ steps
 * PART 4: RunnableSequence — explicit chain construction
 * PART 5: RunnablePassthrough & RunnableParallel — advanced routing
 *
 * Run: npx tsx 01-langchain-basics/04-chains.ts
 */

import "dotenv/config";
import { AzureChatOpenAI } from "@langchain/openai";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { RunnableSequence, RunnablePassthrough, RunnableParallel } from "@langchain/core/runnables";
import { z } from "zod";

const model = new AzureChatOpenAI({
  azureOpenAIApiDeploymentName: process.env.AZURE_OPENAI_CHAT_DEPLOYMENT,
  azureOpenAIApiVersion: process.env.AZURE_OPENAI_API_VERSION,
  temperature: 0.7,
  maxTokens: 500,
});

// ============================================================
// PART 1: The Manual Way — No Chain
// ============================================================

async function manualWay() {
  console.log("=== PART 1: Manual (no chain) ===\n");

  const template = ChatPromptTemplate.fromMessages([
    ["system", "You are a blog writer. Write concisely."],
    ["user", "Write a 3-bullet outline for a blog post about: {topic}"],
  ]);

  const topic = "why TypeScript is better than JavaScript";

  // Step 1: format
  const messages = await template.formatMessages({ topic });
  // Step 2: call model
  const aiMessage = await model.invoke(messages);
  // Step 3: extract string content
  const text = aiMessage.content as string;

  console.log("Result:", text);
  console.log("\nProblem: 3 separate await calls, tightly coupled, not reusable as a unit");
}

// ============================================================
// PART 2: Basic Chain — template → model → parser
// ============================================================

async function basicChain() {
  console.log("\n\n=== PART 2: Basic Chain ===\n");

  // StringOutputParser extracts .content from AIMessage → gives you a plain string
  // This is the simplest output parser — just unwraps the AIMessage
  const outputParser = new StringOutputParser();

  // The chain: template formats → model generates → parser extracts string
  const chain = ChatPromptTemplate.fromMessages([
    ["system", "You are a blog writer. Write concisely."],
    ["user", "Write a 3-bullet outline for a blog post about: {topic}"],
  ])
    .pipe(model)
    .pipe(outputParser); // Now result is string, not AIMessage

  // The chain is a single Runnable — one .invoke() does everything
  const result = await chain.invoke({ topic: "why TypeScript is better than JavaScript" });

  console.log("Type:", typeof result); // string — not AIMessage
  console.log("Result:", result);

  // Reuse the same chain with different input — no code change needed
  const result2 = await chain.invoke({ topic: "the future of AI agents" });
  console.log("\nSame chain, different topic:");
  console.log(result2);
}

// ============================================================
// PART 3: Multi-Step Chain — 3 steps in sequence
// ============================================================
// Real world: generate outline → then expand into full intro paragraph

async function multiStepChain() {
  console.log("\n\n=== PART 3: Multi-Step Chain ===\n");

  const outputParser = new StringOutputParser();

  // Step 1: Generate an outline
  const outlineChain = ChatPromptTemplate.fromMessages([
    ["system", "You are a blog writer."],
    ["user", "Write a 3-point outline for a blog post about: {topic}. Be brief."],
  ])
    .pipe(model)
    .pipe(outputParser);

  // Step 2: Take that outline and write an intro paragraph
  // Notice: {outline} will be filled with the OUTPUT of step 1
  const introChain = ChatPromptTemplate.fromMessages([
    ["system", "You are a blog writer."],
    ["user", "Based on this outline:\n{outline}\n\nWrite a compelling 2-sentence intro paragraph."],
  ])
    .pipe(model)
    .pipe(outputParser);

  // Connect them: output of outlineChain becomes input {outline} for introChain
  // But we need to map the string output to the {outline} variable name
  const fullChain = outlineChain.pipe(
    // This mapping function transforms step 1's output into step 2's input shape
    (outline: string) => ({ outline })
  ).pipe(introChain);

  const topic = "how LangChain simplifies building AI apps";

  console.log("Topic:", topic);
  console.log("\nRunning 2-step chain (outline → intro)...\n");

  const intro = await fullChain.invoke({ topic });
  console.log("Final intro:", intro);
}

// ============================================================
// PART 4: RunnableSequence — explicit, readable chain construction
// ============================================================

async function runnableSequence() {
  console.log("\n\n=== PART 4: RunnableSequence ===\n");

  // RunnableSequence.from([...]) is the explicit way to build chains
  // Equivalent to step1.pipe(step2).pipe(step3) but more readable for long chains
  const outputParser = new StringOutputParser();

  const chain = RunnableSequence.from([
    // Step 1: prompt template
    ChatPromptTemplate.fromMessages([
      ["system", "You are a tech content writer."],
      ["user", "Write exactly 3 short bullet points about: {topic}"],
    ]),
    // Step 2: model
    model,
    // Step 3: extract string
    outputParser,
    // Step 4: you can add plain functions too — transform the string
    (text: string) => text.toUpperCase(),
  ]);

  const result = await chain.invoke({ topic: "LangGraph state machines" });
  console.log("Result (uppercased):", result);
}

// ============================================================
// PART 5: RunnableParallel — run multiple chains at the same time
// ============================================================
// Key insight: run independent chains concurrently, not sequentially
// This halves latency when you need multiple LLM calls on the same input

async function runnableParallel() {
  console.log("\n\n=== PART 5: RunnableParallel ===\n");

  const outputParser = new StringOutputParser();

  // Two independent chains on the same topic
  const proChain = ChatPromptTemplate.fromMessages([
    ["user", "List 2 pros of {topic} in one sentence each."],
  ])
    .pipe(model)
    .pipe(outputParser);

  const conChain = ChatPromptTemplate.fromMessages([
    ["user", "List 2 cons of {topic} in one sentence each."],
  ])
    .pipe(model)
    .pipe(outputParser);

  // RunnableParallel runs both chains CONCURRENTLY with the same input
  // Both HTTP calls happen at the same time — halves the wait time
  const parallelChain = RunnableParallel.from({
    pros: proChain,
    cons: conChain,
  });

  console.log("Running pros and cons chains IN PARALLEL...\n");
  const startTime = Date.now();

  const result = await parallelChain.invoke({ topic: "TypeScript" });

  console.log(`Completed in ${Date.now() - startTime}ms\n`);
  console.log("PROS:");
  console.log(result.pros);
  console.log("\nCONS:");
  console.log(result.cons);

  // Compare: sequential would take ~2x longer
  console.log("\n--- Sequential comparison ---");
  const seqStart = Date.now();
  const pros = await proChain.invoke({ topic: "TypeScript" });
  const cons = await conChain.invoke({ topic: "TypeScript" });
  console.log(`Sequential completed in ${Date.now() - seqStart}ms`);
  console.log("(Notice parallel is faster)");
}

// ============================================================
// Run everything
// ============================================================

async function main() {
  // await manualWay();
  // await basicChain();
//   await multiStepChain();
  await runnableSequence();
  await runnableParallel();
}

main().catch(console.error);
