/**
 * Module 1.2 — Prompt Templates & Variables (First Principles)
 *
 * PART 1: The manual way (string interpolation) — see the pain
 * PART 2: ChatPromptTemplate — the LangChain solution
 * PART 3: Few-shot prompting — teaching by example
 *
 * Run: npx tsx 01-langchain-basics/02-prompt-templates.ts
 */

import "dotenv/config";
import { AzureChatOpenAI } from "@langchain/openai";
import {
  ChatPromptTemplate,
  SystemMessagePromptTemplate,
  HumanMessagePromptTemplate,
} from "@langchain/core/prompts";
import { HumanMessage, AIMessage, SystemMessage } from "@langchain/core/messages";

const model = new AzureChatOpenAI({
  azureOpenAIApiDeploymentName: process.env.AZURE_OPENAI_CHAT_DEPLOYMENT,
  azureOpenAIApiVersion: process.env.AZURE_OPENAI_API_VERSION,
  temperature: 0.3,
  maxTokens: 300,
});

// ============================================================
// PART 1: The Manual Way — Why templates are needed
// ============================================================

async function manualWay() {
  console.log("=== PART 1: Manual String Interpolation ===\n");

  // Imagine a translation app — you need to swap language and text every time
  const language = "Hindi";
  const text = "Good morning, how are you?";

  // This works, but it's fragile:
  // - No validation (what if language is undefined?)
  // - Can't reuse this structure easily
  // - Can't compose it into chains
  const response = await model.invoke([
    ["system", `You are a translator. Translate the user's text to ${language}. Only respond with the translation, nothing else.`],
    ["user", text],
  ]);

  console.log(`"${text}" → ${language}: ${response.content}\n`);

  // Now imagine doing this for 5 languages — lots of copy-paste
  for (const lang of ["Spanish", "Japanese", "French"]) {
    const r = await model.invoke([
      ["system", `You are a translator. Translate the user's text to ${lang}. Only respond with the translation, nothing else.`],
      ["user", text],
    ]);
    console.log(`"${text}" → ${lang}: ${r.content}`);
  }
}

// ============================================================
// PART 2: ChatPromptTemplate — The Clean Way
// ============================================================

async function templateWay() {
  console.log("\n\n=== PART 2: ChatPromptTemplate ===\n");

  // Define the template ONCE — {variables} are placeholders
  const translationTemplate = ChatPromptTemplate.fromMessages([
    [
      "system",
      "You are a translator. Translate the user's text to {language}. Only respond with the translation, nothing else.",
    ],
    ["user", "{text}"],
  ]);

  // Now you can see what variables it expects:
  console.log("Template input variables:", translationTemplate.inputVariables);
  // → ['language', 'text']

  // .invoke() fills in the variables — this is what makes it reusable
  // But the template itself doesn't call the model — it just produces messages
  const messages = await translationTemplate.formatMessages({
    language: "Hindi",
    text: "Good morning, how are you?",
  });

  console.log("\nFormatted messages (this is what gets sent to the model):");
  for (const msg of messages) {
    console.log(`  [${msg._getType()}]: ${msg.content}`);
  }

  // Now pipe template → model (preview of chains — Module 1.4)
  // template.pipe(model) = "format the template, then send to model"
  const chain = translationTemplate.pipe(model);

  console.log("\n--- Translations using template ---");
  for (const lang of ["Hindi", "Spanish", "Japanese", "French"]) {
    const response = await chain.invoke({
      language: lang,
      text: "Good morning, how are you?",
    });
    console.log(`  ${lang}: ${response.content}`);
  }
}

// ============================================================
// PART 3: Few-Shot Prompting — Teaching by Example
// ============================================================
// Key insight: LLMs learn patterns from examples in the prompt itself.
// You show it 2-3 examples of input→output, then give it the real input.
// The model mimics the pattern.

async function fewShotPrompting() {
  console.log("\n\n=== PART 3: Few-Shot Prompting ===\n");

  // Task: Extract sentiment and key topics from a review
  // Instead of explaining the format, we SHOW the model what we want

  const fewShotTemplate = ChatPromptTemplate.fromMessages([
    [
      "system",
      "You analyze product reviews. Extract the sentiment and key topics. Follow the exact format shown in the examples.",
    ],
    // Example 1 — we play both sides (user input + what model should output)
    new HumanMessage("Review: The laptop is super fast but the battery dies in 2 hours."),
    new AIMessage("Sentiment: Mixed\nTopics: performance (positive), battery life (negative)"),
    // Example 2
    new HumanMessage("Review: Absolutely love this phone! Camera is incredible and it's so light."),
    new AIMessage("Sentiment: Positive\nTopics: camera quality (positive), weight (positive)"),
    // Example 3
    new HumanMessage("Review: Terrible customer service. Product arrived broken and no refund."),
    new AIMessage("Sentiment: Negative\nTopics: customer service (negative), product quality (negative), refund policy (negative)"),
    // Now the REAL input — the model will mimic the pattern above
    ["user", "Review: {review}"],
  ]);

  const chain = fewShotTemplate.pipe(model);

  console.log("--- Few-shot sentiment analysis ---\n");

  const reviews = [
    "The headphones sound amazing but they're uncomfortable after an hour.",
    "Best purchase ever! Fast delivery, great packaging, product works perfectly.",
    "It looks nice but keeps crashing. Very disappointed for the price.",
  ];

  for (const review of reviews) {
    const response = await chain.invoke({ review });
    console.log(`Review: "${review}"`);
    console.log(`${response.content}\n`);
  }
}

// ============================================================
// PART 4: Partial Templates — Pre-fill some variables
// ============================================================

async function partialTemplates() {
  console.log("\n=== PART 4: Partial Templates ===\n");

  // Sometimes you know some variables upfront (e.g., the system language)
  // but others come later (e.g., the user's question)

  const template = ChatPromptTemplate.fromMessages([
    ["system", "You are a {role} who speaks {style}. Keep responses under 2 sentences."],
    ["user", "{question}"],
  ]);

  // Partial: lock in role and style, only need question later
  const pirateTemplate = await template.partial({
    role: "pirate captain",
    style: "in dramatic pirate language",
  });

  const poetTemplate = await template.partial({
    role: "romantic poet",
    style: "in beautiful verse",
  });

  console.log("Pirate template needs:", pirateTemplate.inputVariables);
  // → ['question'] — role and style are already filled

  const pirateChain = pirateTemplate.pipe(model);
  const poetChain = poetTemplate.pipe(model);

  const question = "What is the meaning of life?";

  const pirateAnswer = await pirateChain.invoke({ question });
  console.log(`\nPirate: ${pirateAnswer.content}`);

  const poetAnswer = await poetChain.invoke({ question });
  console.log(`\nPoet: ${poetAnswer.content}`);
}

// ============================================================
// Run everything
// ============================================================

async function main() {
  // await manualWay();
  // await templateWay();
  // await fewShotPrompting();
  await partialTemplates();
}

main().catch(console.error);
