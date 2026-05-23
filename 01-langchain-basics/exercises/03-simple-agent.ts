/**
 * Exercise — Module 1.6: Simple Agent
 *
 * CHALLENGE: Build a Travel Planning Agent
 *
 * Build an agent that helps plan a trip by answering multi-step questions.
 * The agent must reason across multiple tool calls to produce a final answer.
 *
 * STEP 1 — Define three tools:
 *
 *   a) getFlightPrice
 *      Returns a mock flight price between two cities.
 *      Schema: { from: string, to: string }
 *      Mock data (you decide the prices — make them realistic):
 *        London → Tokyo, London → New York, New York → Tokyo, etc.
 *      Return format: "$1,250" (as a string)
 *
 *   b) getCityInfo
 *      Returns brief info about a city: country, timezone, best season to visit.
 *      Schema: { city: string }
 *      Mock data for at least: Tokyo, New York, London, Sydney
 *      Return: JSON string with { country, timezone, bestSeason }
 *
 *   c) convertCurrency
 *      Converts an amount between currencies.
 *      Schema: { amount: number, from: string, to: string }
 *      Support at least: USD, GBP, EUR, JPY
 *      Use fixed mock rates (e.g. 1 USD = 0.79 GBP = 0.92 EUR = 149.50 JPY)
 *      Return: formatted string like "£987.50"
 *
 * STEP 2 — Create the agent using createReactAgent
 *   Give it a system prompt: "You are a helpful travel planning assistant.
 *   Always use tools to get real data. Never guess prices or currency rates."
 *
 * STEP 3 — Test with these questions (each requires multiple tool calls):
 *
 *   Question 1 (2 tool calls):
 *     "What is the flight price from London to Tokyo, and what's the best season to visit Tokyo?"
 *
 *   Question 2 (2 tool calls — sequential: price first, then convert):
 *     "How much does a London to New York flight cost in GBP?"
 *
 *   Question 3 (3+ tool calls — full trip planning):
 *     "I'm flying from New York to Tokyo. What will the flight cost in JPY,
 *      and what should I know about Tokyo before I go?"
 *
 * STEP 4 — For Question 2, also print the full reasoning chain
 *   (show each tool call and result, not just the final answer)
 *   Hint: iterate over result.messages and print each step
 *
 * HINTS:
 *   - Import createReactAgent from "@langchain/langgraph/prebuilt"
 *   - result.messages[result.messages.length - 1].content is the final answer
 *   - To print the reasoning chain, check if a message has .tool_calls or .tool_call_id
 *   - Question 2 is sequential: the agent must get the USD price FIRST, then convert it
 *
 * Run: npx tsx 01-langchain-basics/exercises/03-simple-agent.ts
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

// TODO: Step 1 — Define getFlightPrice tool


// TODO: Step 1 — Define getCityInfo tool


// TODO: Step 1 — Define convertCurrency tool


// TODO: Step 2 — Create the agent with createReactAgent and a system prompt
// const agent = createReactAgent({ ... });


// TODO: Step 3 & 4 — Test with all three questions
async function main() {
  const questions = [
    "What is the flight price from London to Tokyo, and what's the best season to visit Tokyo?",
    "How much does a London to New York flight cost in GBP?",
    "I'm flying from New York to Tokyo. What will the flight cost in JPY, and what should I know about Tokyo before I go?",
  ];

  for (const question of questions) {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`Q: ${question}`);
    console.log("=".repeat(60));

    // TODO: invoke the agent and print the final answer

    // TODO: for Question 2, also print the full reasoning chain
  }
}

main().catch(console.error);
