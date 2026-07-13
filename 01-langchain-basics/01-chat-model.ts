/**
 * Module 1.1 — Chat Models (First Principles)
 *
 * PART 1: Raw HTTP call to Azure OpenAI (no libraries)
 * This shows exactly what happens under the hood.
 *
 * PART 2: Same thing using LangChain's AzureChatOpenAI
 * Now you see what the abstraction gives you.
 *
 * Run: npx tsx 01-langchain-basics/01-chat-model.ts
 */

import "dotenv/config";

// ============================================================
// PART 1: The Raw Way — Direct HTTP to Azure OpenAI
// ============================================================
// This is what EVERY LLM library does under the hood.
// Understanding this means you'll never be confused by any abstraction.

async function rawChatCompletion() {
  console.log("=== PART 1: Raw HTTP Call ===\n");

  const endpoint = process.env.AZURE_OPENAI_ENDPOINT!;
  const apiKey = process.env.AZURE_OPENAI_API_KEY!;
  const deployment = process.env.AZURE_OPENAI_CHAT_DEPLOYMENT!;
  const apiVersion = process.env.AZURE_OPENAI_API_VERSION!;

  // This is the EXACT HTTP request that every library makes
  const url = `${endpoint}/openai/deployments/${deployment}/chat/completions?api-version=${apiVersion}`;

  const body = {
    messages: [
      {
        role: "system",
        content: "You are a helpful assistant that explains things concisely.",
      },
      {
        role: "user",
        content: "What is a Large Language Model? Explain in 2 sentences.",
      },
    ],
    temperature: 0.7, // Moderate creativity
    max_tokens: 200, // Limit response length
  };

  console.log("Request URL:", url);
  console.log("Request body:", JSON.stringify(body, null, 2));
  console.log("\nSending request...\n");

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": apiKey, // Azure uses api-key header (not Bearer token)
    },
    body: JSON.stringify(body),
  });

  const data = await response.json();

  // The response structure — this is what you get back
  console.log("Response status:", response.status);
  console.log("\nFull response structure:");
  console.log(JSON.stringify(data, null, 2));

  console.log("\n--- Extracted answer ---");
  console.log(data.choices[0].message.content);

  console.log("\n--- Token usage ---");
  console.log(`  Prompt tokens:     ${data.usage.prompt_tokens}`);
  console.log(`  Completion tokens: ${data.usage.completion_tokens}`);
  console.log(`  Total tokens:      ${data.usage.total_tokens}`);
}

// ============================================================
// PART 2: The LangChain Way — AzureChatOpenAI
// ============================================================
// Same HTTP call, but wrapped in a class that gives you:
// - Composability (.pipe, chains)
// - Streaming support
// - Tool calling
// - Retries & error handling
// - Consistent interface across providers (swap OpenAI for Anthropic in 1 line)

async function langchainChatCompletion() {
  console.log("\n\n=== PART 2: LangChain AzureChatOpenAI ===\n");

  // This import gives you the Azure-specific wrapper
  const { AzureChatOpenAI } = await import("@langchain/openai");

  // Create the model instance — this doesn't make any HTTP call yet
  const model = new AzureChatOpenAI({
    azureOpenAIApiDeploymentName: process.env.AZURE_OPENAI_CHAT_DEPLOYMENT,
    azureOpenAIApiVersion: process.env.AZURE_OPENAI_API_VERSION,
    temperature: 0.7,
    maxTokens: 200,
  });

  // .invoke() is the universal method — it takes messages and returns an AIMessage
  const response = await model.invoke([
    ["system", "You are a helpful assistant that explains things concisely."],
    ["user", "What is a Large Language Model? Explain in 2 sentences."],
  ]);

  // response is an AIMessage object (not raw JSON)
  console.log("Response type:", response.constructor.name);
  console.log("\nContent:", response.content);
  console.log("\nUsage metadata:", response.usage_metadata);

  // You can also use HumanMessage/SystemMessage classes for more explicit code
  const { HumanMessage, SystemMessage } = await import("@langchain/core/messages");

  const response2 = await model.invoke([
    new SystemMessage("You are a pirate. Respond in pirate speak."),
    new HumanMessage("What is JavaScript?"),
  ]);

  console.log("\n--- Pirate response ---");
  console.log(response2.content);
}

// ============================================================
// PART 3: Understanding Temperature (experiment!)
// ============================================================

async function temperatureExperiment() {
  console.log("\n\n=== PART 3: Temperature Experiment ===\n");
  console.log("Same prompt, different temperatures. Watch how output changes.\n");

  const { AzureChatOpenAI } = await import("@langchain/openai");

  const prompt = "Give me a one-sentence creative name for a coffee shop.";

  for (const temp of [0, 0.5, 1.0, 1.5 , 2]) {
    const model = new AzureChatOpenAI({
      azureOpenAIApiDeploymentName: process.env.AZURE_OPENAI_CHAT_DEPLOYMENT,
      azureOpenAIApiVersion: process.env.AZURE_OPENAI_API_VERSION,
      temperature: temp,
      maxTokens: 50,
    });

    const response = await model.invoke([["user", prompt]]);
    console.log(`  temp=${temp}: ${response.content}`);
  }
}

// ============================================================
// Run everything
// ============================================================

async function main() {
  await rawChatCompletion();
  // await langchainChatCompletion();
//  await temperatureExperiment();
}

main().catch(console.error);
