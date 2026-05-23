/**
 * Module 1.6 — Simple Agent (First Principles)
 *
 * PART 1: What is an agent? The ReAct loop explained
 * PART 2: Build the ReAct loop manually (no framework)
 * PART 3: The same agent with LangGraph's createReactAgent
 * PART 4: Multi-step reasoning — questions that need multiple tool calls in sequence
 * PART 5: Giving the agent a system prompt and personality
 *
 * Run: npx tsx 01-langchain-basics/06-simple-agent.ts
 */

import "dotenv/config";
import { AzureChatOpenAI } from "@langchain/openai";
import { tool } from "@langchain/core/tools";
import { HumanMessage } from "@langchain/core/messages";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { z } from "zod";

const model = new AzureChatOpenAI({
  azureOpenAIApiDeploymentName: process.env.AZURE_OPENAI_CHAT_DEPLOYMENT,
  azureOpenAIApiVersion: process.env.AZURE_OPENAI_API_VERSION,
  temperature: 0,
  maxTokens: 1000,
});

// ============================================================
// Tools (reused across all parts)
// ============================================================

const calculatorTool = tool(
  ({ operation, a, b }) => {
    switch (operation) {
      case "add":      return String(a + b);
      case "subtract": return String(a - b);
      case "multiply": return String(a * b);
      case "divide":
        if (b === 0) return "Error: division by zero";
        return String(a / b);
      default: return "Unknown operation";
    }
  },
  {
    name: "calculator",
    description: "Performs arithmetic: add, subtract, multiply, or divide two numbers. Use for any precise calculation.",
    schema: z.object({
      operation: z.enum(["add", "subtract", "multiply", "divide"]),
      a: z.number().describe("First number"),
      b: z.number().describe("Second number"),
    }),
  }
);

const getCurrentDateTool = tool(
  () => new Date().toISOString().split("T")[0],
  {
    name: "get_current_date",
    description: "Returns today's date in YYYY-MM-DD format.",
    schema: z.object({}),
  }
);

const getStockPriceTool = tool(
  ({ ticker }) => {
    // Mock data — real version would call a financial API
    const prices: Record<string, number> = {
      MSFT: 420.50, AAPL: 189.30, GOOGL: 175.80, AMZN: 198.20,
    };
    const price = prices[ticker.toUpperCase()];
    return price ? `$${price}` : `No data for ${ticker}`;
  },
  {
    name: "get_stock_price",
    description: "Gets the current stock price for a given ticker symbol (e.g. MSFT, AAPL). Use when asked about stock prices.",
    schema: z.object({
      ticker: z.string().describe("Stock ticker symbol, e.g. MSFT"),
    }),
  }
);

const tools = [calculatorTool, getCurrentDateTool, getStockPriceTool];

// ============================================================
// PART 1: What Is an Agent?
// ============================================================

async function whatIsAnAgent() {
  console.log("=== PART 1: What Is an Agent? ===\n");

  // In Module 1.5, you built a SINGLE tool call loop:
  //   Human → model → tool call → tool result → final answer
  //
  // But what if the question requires MULTIPLE rounds of reasoning?
  //
  // Example: "If I buy 10 shares of MSFT and 5 shares of AAPL, what's my total cost?"
  //
  // Step 1: Get MSFT price  (tool call 1)
  // Step 2: Get AAPL price  (tool call 2)
  // Step 3: Calculate total (tool call 3 — uses results from 1 & 2)
  // Step 4: Answer
  //
  // An AGENT is a loop that keeps calling tools until it has enough
  // information to give a final answer. It reasons → acts → observes,
  // repeating until done.
  //
  // This pattern is called ReAct (Reasoning + Acting):
  //   Reason:  "I need the MSFT price first"
  //   Act:     call get_stock_price("MSFT")
  //   Observe: "$420.50"
  //   Reason:  "Now I need AAPL price"
  //   Act:     call get_stock_price("AAPL")
  //   Observe: "$189.30"
  //   Reason:  "Now I can calculate: (10 * 420.50) + (5 * 189.30)"
  //   Act:     call calculator(add, 4205, 946.50)
  //   Observe: "5151.5"
  //   Reason:  "I have enough to answer"
  //   Answer:  "Your total cost is $5,151.50"

  console.log("Key difference from Module 1.5:");
  console.log("  Module 1.5: ONE round of tool calls, then answer");
  console.log("  Agent:      MULTIPLE rounds — keeps going until done\n");
  console.log("The loop: Reason → Act → Observe → Reason → Act → Observe → ... → Answer");
}

// ============================================================
// PART 2: Manual ReAct Loop
// ============================================================

async function manualReActLoop() {
  console.log("\n\n=== PART 2: Manual ReAct Loop ===\n");

  const modelWithTools = model.bindTools(tools);
  const toolMap: Record<string, { invoke: (input: any) => Promise<any> }> = {
    calculator:       calculatorTool,
    get_current_date: getCurrentDateTool,
    get_stock_price:  getStockPriceTool,
  };

  const messages: any[] = [
    new HumanMessage("If I buy 10 shares of MSFT and 5 shares of AAPL, what is my total cost?"),
  ];

  console.log("Question:", (messages[0] as HumanMessage).content);
  console.log("\n--- Agent loop starting ---\n");

  let step = 0;
  const MAX_STEPS = 10; // safety limit — prevents infinite loops

  // THE AGENT LOOP
  while (step < MAX_STEPS) {
    step++;
    console.log(`Step ${step}:`);

    const response = await modelWithTools.invoke(messages);
    messages.push(response);

    // No tool calls = model has its final answer → stop
    if (!response.tool_calls || response.tool_calls.length === 0) {
      console.log("→ Model gave final answer (no more tool calls)\n");
      break;
    }

    // Execute all requested tool calls this round
    for (const toolCall of response.tool_calls) {
      const selectedTool = toolMap[toolCall.name];
      if (!selectedTool) continue;

      const toolResult = await selectedTool.invoke(toolCall);
      const content = (toolResult as any).content ?? toolResult;
      console.log(`  → Called '${toolCall.name}' with ${JSON.stringify(toolCall.args)} → ${content}`);
      messages.push(toolResult);
    }
  }

  console.log("\nFinal answer:");
  console.log(messages[messages.length - 1].content);
  console.log(`\nTotal steps taken: ${step}`);
}

// ============================================================
// PART 3: The Same Agent with createReactAgent
// ============================================================

// createReactAgent does exactly what you wrote in Part 2 — but:
//   - Handles the while loop internally
//   - Has a built-in MAX_STEPS limit
//   - Manages message history automatically
//   - Is battle-tested and handles edge cases

async function withCreateReactAgent() {
  console.log("\n\n=== PART 3: createReactAgent ===\n");

  // This single call replaces the entire manual loop from Part 2
  const agent = createReactAgent({
    llm: model,
    tools,
  });

  const result = await agent.invoke({
    messages: [new HumanMessage("If I buy 10 shares of MSFT and 5 shares of AAPL, what is my total cost?")],
  });

  // result.messages contains the full conversation history
  const finalMessage = result.messages[result.messages.length - 1];
  console.log("Final answer:", finalMessage.content);
  console.log(`\nTotal messages in history: ${result.messages.length}`);
  console.log("(each message = one step: human, ai, tool, ai, tool, ai, ...)");
}

// ============================================================
// PART 4: Multi-Step Reasoning
// ============================================================

// An agent shines when the ANSWER to step N depends on the RESULT of step N-1.
// This is called sequential reasoning — you can't parallelize it.

async function multiStepReasoning() {
  console.log("\n\n=== PART 4: Multi-Step Sequential Reasoning ===\n");

  const agent = createReactAgent({ llm: model, tools });

  // This question requires sequential steps — each depends on the previous:
  //   1. Get today's date
  //   2. Get MSFT price
  //   3. Multiply price by 100 (using the result from step 2)
  const question = "What is today's date, and if I invest $10,000 in MSFT today, how many whole shares can I buy?";
  console.log("Question:", question, "\n");

  const result = await agent.invoke({
    messages: [new HumanMessage(question)],
  });

  // Print intermediate steps to see the reasoning chain
  console.log("--- Full reasoning chain ---");
  for (const msg of result.messages) {
    const role = (msg as any)._getType?.() ?? msg.constructor.name;
    if (role === "human") continue; // skip the input

    if ((msg as any).tool_calls?.length) {
      for (const tc of (msg as any).tool_calls) {
        console.log(`[AI] → calling '${tc.name}' with ${JSON.stringify(tc.args)}`);
      }
    } else if ((msg as any).tool_call_id) {
      console.log(`[Tool result] ${msg.content}`);
    } else {
      console.log(`[Final answer] ${msg.content}`);
    }
  }
}

// ============================================================
// PART 5: System Prompt — Giving the Agent Personality
// ============================================================

async function agentWithSystemPrompt() {
  console.log("\n\n=== PART 5: Agent with System Prompt ===\n");

  const agent = createReactAgent({
    llm: model,
    tools,
    // stateModifier adds a system message before every invocation
    stateModifier: "You are a concise financial assistant. Always use tools for calculations and prices — never guess. Keep answers to 2 sentences maximum.",
  });

  const questions = [
    "What's the price of GOOGL?",
    "How much would 50 shares of AMZN cost?",
  ];

  for (const question of questions) {
    console.log(`Q: ${question}`);
    const result = await agent.invoke({
      messages: [new HumanMessage(question)],
    });
    const answer = result.messages[result.messages.length - 1].content;
    console.log(`A: ${answer}\n`);
  }
}

// ============================================================
// Main
// ============================================================

async function main() {
  // await whatIsAnAgent();
  //  await manualReActLoop();
  // await withCreateReactAgent();
  // await multiStepReasoning();
   await agentWithSystemPrompt();
}

main().catch(console.error);
