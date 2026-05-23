/**
 * Module 1.5 — Tools (First Principles)
 *
 * PART 1: The problem — what LLMs can't do on their own
 * PART 2: Defining a tool with tool() and Zod
 * PART 3: Binding tools to the model — how the LLM "decides" to call one
 * PART 4: Reading and executing a tool call manually
 * PART 5: Multiple tools — the model picks the right one
 *
 * Run: npx tsx 01-langchain-basics/05-tools.ts
 */

import "dotenv/config";
import { AzureChatOpenAI } from "@langchain/openai";
import { tool } from "@langchain/core/tools";
import { HumanMessage, ToolMessage } from "@langchain/core/messages";
import { z } from "zod";

const model = new AzureChatOpenAI({
  azureOpenAIApiDeploymentName: process.env.AZURE_OPENAI_CHAT_DEPLOYMENT,
  azureOpenAIApiVersion: process.env.AZURE_OPENAI_API_VERSION,
  temperature: 0,
  maxTokens: 500,
});

// ============================================================
// PART 1: The Problem — What LLMs Can't Do
// ============================================================

async function theProblem() {
  console.log("=== PART 1: The Problem ===\n");

  // LLMs have two fundamental limitations:
  //   1. Knowledge cutoff — they don't know current data (prices, weather, time)
  //   2. No real computation — they "predict" math answers, they don't calculate

  const response1 = await model.invoke([
    ["user", "What is today's date?"],
  ]);
  console.log("Q: What is today's date?");
  console.log("A:", response1.content);
  console.log("^ The model guesses or says it doesn't know — it has no clock.\n");

  const response2 = await model.invoke([
    ["user", "What is 1_000_003 * 9_999_991?"],
  ]);
  console.log("Q: What is 1_000_003 * 9_999_991?");
  console.log("A:", response2.content);
  console.log("Correct answer:", (1_000_003 * 9_999_991).toString());
  console.log("^ The model may give a wrong answer — it's predicting tokens, not computing.\n");

  console.log("Solution: Give the model TOOLS — real functions it can request to call.");
}

// ============================================================
// PART 2: Defining a Tool with tool() and Zod
// ============================================================

// A "tool" is just a normal function with:
//   - A name       → how the LLM refers to it
//   - A description → what the LLM reads to decide when to use it (CRITICAL)
//   - A Zod schema  → the parameters it accepts (the LLM fills these in)

const calculatorTool = tool(
  // The actual implementation — this runs on YOUR machine, not the LLM
  ({ operation, a, b }) => {
    switch (operation) {
      case "add":      return String(a + b);
      case "subtract": return String(a - b);
      case "multiply": return String(a * b);
      case "divide":
        if (b === 0) return "Error: division by zero";
        return String(a / b);
      default:
        return "Error: unknown operation";
    }
  },
  {
    name: "calculator",
    // The description is what the LLM reads. Write it clearly — the model uses
    // this to decide WHETHER to call this tool and WHEN.
    description: "Performs arithmetic: add, subtract, multiply, or divide two numbers. Use this whenever a precise calculation is needed.",
    schema: z.object({
      operation: z.enum(["add", "subtract", "multiply", "divide"]).describe("The operation to perform"),
      a: z.number().describe("First number"),
      b: z.number().describe("Second number"),
    }),
  }
);

const getCurrentDateTool = tool(
  () => {
    // This really executes on your machine — real current date
    return new Date().toISOString().split("T")[0]; // "2026-05-13"
  },
  {
    name: "get_current_date",
    description: "Returns today's date in YYYY-MM-DD format. Use when the user asks about the current date or needs to calculate time differences.",
    schema: z.object({}), // No parameters needed
  }
);

async function definingTools() {
  console.log("\n\n=== PART 2: Defining Tools ===\n");

  // You can call tools directly — they're just functions
  const calcResult = await calculatorTool.invoke({ operation: "multiply", a: 1_000_003, b: 9_999_991 });
  console.log("Calculator (direct call):", calcResult);

  const dateResult = await getCurrentDateTool.invoke({});
  console.log("Date (direct call):", dateResult);

  console.log("\nTools are just functions. The interesting part is how the LLM learns to call them.");
}

// ============================================================
// PART 3: Binding Tools to the Model
// ============================================================

// .bindTools() attaches tool schemas to every request.
// The LLM sees the tool names, descriptions, and parameter schemas.
// When it decides a tool is needed, it returns an AIMessage with
// a `tool_calls` array instead of (or in addition to) text content.

async function bindingTools() {
  console.log("\n\n=== PART 3: Binding Tools to the Model ===\n");

  const modelWithTools = model.bindTools([calculatorTool, getCurrentDateTool]);

  // Ask something that clearly requires a tool
  const response = await modelWithTools.invoke([
    new HumanMessage("What is 1_000_003 multiplied by 9_999_991?"),
  ]);

  console.log("AIMessage content:", response.content || "(empty — model went straight to tool call)");
  console.log("\nAIMessage tool_calls:");
  console.log(JSON.stringify(response.tool_calls, null, 2));

  // Key insight: the LLM did NOT answer the question itself.
  // It returned a tool_calls array saying:
  //   "I want to call 'calculator' with these arguments"
  // The RESULT is not here yet — you have to execute the tool yourself.
}

// ============================================================
// PART 4: Executing Tool Calls and Completing the Loop
// ============================================================

// The full tool call flow:
//   1. Human message → model → AIMessage with tool_calls
//   2. You execute each requested tool
//   3. Wrap result in a ToolMessage and add to message history
//   4. Send updated history back to model → final AIMessage with text answer

async function toolCallLoop() {
  console.log("\n\n=== PART 4: The Tool Call Loop ===\n");

  const modelWithTools = model.bindTools([calculatorTool, getCurrentDateTool]);

  const messages: (HumanMessage | typeof ToolMessage.prototype | (typeof model extends { invoke: (...args: any[]) => Promise<infer R> } ? R : never))[] = [
    new HumanMessage("What is 1_000_003 multiplied by 9_999_991? And what is today's date?"),
  ];

  // Step 1: First call — model responds with tool_calls
  const aiMessage = await modelWithTools.invoke(messages);
  messages.push(aiMessage);

  console.log("Step 1 — Model's tool_calls:");
  console.log(JSON.stringify(aiMessage.tool_calls, null, 2));


  // Step 2: Execute each requested tool call
  const toolMap: Record<string, { invoke: (input: any) => Promise<any> }> = {
    calculator: calculatorTool,
    get_current_date: getCurrentDateTool,
  };

  for (const toolCall of aiMessage.tool_calls ?? []) {
    const selectedTool = toolMap[toolCall.name];
    if (!selectedTool) continue;

    // When invoked with a full toolCall object (has id, name, args),
    // LangChain returns a ToolMessage directly — not a plain string.
    // So we push it straight into the history.
    const toolResult = await selectedTool.invoke(toolCall);

    console.log(`\nExecuted '${toolCall.name}':`, (toolResult as any).content ?? toolResult);
    console.log('just printing only the tool result--------------------------->', toolResult )

    messages.push(toolResult);
   
  }
    console.log(`printing messages just to see that how it's looking before the final call`  );
    console.log(messages)
  // Step 3: Send the full message history back — model now sees the tool results
  const finalResponse = await modelWithTools.invoke(messages);

  console.log("\nStep 3 — Final answer from model:");
  console.log(finalResponse.content);
}

// ============================================================
// PART 5: Multiple Tools — the Model Picks the Right One
// ============================================================

// The model reads ALL tool descriptions and picks whichever is appropriate.
// Good descriptions are critical — vague descriptions cause wrong tool selection.

const getWeatherTool = tool(
  ({ city }) => {
    // Mock implementation — in real life this would call a weather API
    const mockData: Record<string, string> = {
      london: "Cloudy, 14°C",
      tokyo:  "Sunny, 22°C",
      sydney: "Partly cloudy, 18°C",
    };
    return mockData[city.toLowerCase()] ?? `No data available for ${city}`;
  },
  {
    name: "get_weather",
    description: "Gets the current weather for a given city. Use when the user asks about weather or temperature in a specific location.",
    schema: z.object({
      city: z.string().describe("The city name to get weather for"),
    }),
  }
);

async function multipleTools() {
  console.log("\n\n=== PART 5: Multiple Tools — Model Picks the Right One ===\n");

  const modelWithTools = model.bindTools([calculatorTool, getCurrentDateTool, getWeatherTool]);

  // Single question that needs a specific tool
  const questions = [
    "What's the weather like in Tokyo right now?",
    "What is 144 divided by 12?",
    "What is today's date?",
  ];

  for (const question of questions) {
    const response = await modelWithTools.invoke([new HumanMessage(question)]);
    const calledTool = response.tool_calls?.[0]?.name ?? "none (answered directly)";
    console.log(`Q: "${question}"`);
    console.log(`→ Tool selected: ${calledTool}\n`);
  }
}

// ============================================================
// Main
// ============================================================

async function main() {
  // await theProblem();
  // await definingTools();
  // await bindingTools();
  // await toolCallLoop();
  await multipleTools();
}

main().catch(console.error);
