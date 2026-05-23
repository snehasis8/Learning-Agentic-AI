/**
 * Exercise — Module 1.5: Tools
 *
 * CHALLENGE: Build a Personal Assistant with Tools
 *
 * Build a mini assistant that can answer questions requiring real data or computation.
 * You must implement the full tool call loop manually (no agent helpers yet).
 *
 * STEP 1 — Define three tools using tool() and Zod:
 *
 *   a) unitConverter
 *      Converts a value between units. Support at least:
 *        - km  ↔ miles  (1 km = 0.621371 miles)
 *        - kg  ↔ pounds (1 kg = 2.20462 pounds)
 *        - °C  ↔ °F     (°F = °C * 9/5 + 32)
 *      Schema: { value: number, from: string, to: string }
 *
 *   b) wordCounter
 *      Counts words, characters, and sentences in a text string.
 *      Schema: { text: string }
 *      Returns a JSON string: { words: number, characters: number, sentences: number }
 *
 *   c) daysUntil
 *      Given a future date string (YYYY-MM-DD), returns how many days from TODAY until that date.
 *      Schema: { targetDate: string }
 *      Use real Date arithmetic — not LLM guessing.
 *
 * STEP 2 — Bind all three tools to the model
 *
 * STEP 3 — Implement runWithTools(question: string)
 *   A reusable function that:
 *     1. Sends the question to the model
 *     2. If the model calls tools, executes them and sends results back
 *     3. Returns the final text answer
 *   This is the manual tool loop from Part 4 of the lesson.
 *
 * STEP 4 — Test with these questions:
 *   - "How many miles is 42 km?"
 *   - "How many days until 2027-01-01?"
 *   - "Count the words and sentences in: 'The quick brown fox. It jumps over the lazy dog. Amazing!'"
 *   - "Convert 100 degrees Celsius to Fahrenheit and also tell me how many days until 2026-12-25"
 *     (This one requires TWO tool calls — both should execute before the final answer)
 *
 * HINTS:
 *   - For daysUntil: use Date.parse() and Math.ceil((target - now) / (1000 * 60 * 60 * 24))
 *   - For the two-tool question: your runWithTools loop handles it automatically
 *     if you iterate over ALL tool_calls in the AIMessage, not just the first one
 *   - Tool results must be strings — use JSON.stringify() for objects
 *
 * Run: npx tsx 01-langchain-basics/exercises/02-tools.ts
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

// TODO: Step 1 — Define unitConverter tool

const unitConverterTool = tool(
  ({ value, from, to }) => {
    const key = `${from.toLowerCase()}_${to.toLowerCase()}`;
    const conversions: Record<string, number> = {
      km_miles:    0.621371,
      miles_km:    1.60934,
      kg_pounds:   2.20462,
      pounds_kg:   0.453592,
    };

    // Celsius ↔ Fahrenheit are formulas, not multipliers
    if (key === "c_f" || key === "celsius_fahrenheit") {
      return String((value * 9) / 5 + 32) + " °F";
    }
    if (key === "f_c" || key === "fahrenheit_celsius") {
      return String(((value - 32) * 5) / 9) + " °C";
    }

    const factor = conversions[key];
    if (!factor) return `Unsupported conversion: ${from} to ${to}`;
    return String(Math.round(value * factor * 10000) / 10000) + " " + to;
  },
  {
    name: "unit_converter",
    description: "Converts a value between units. Supports: km↔miles, kg↔pounds, Celsius↔Fahrenheit. Use when the user asks to convert a measurement.",
    schema: z.object({
      value: z.number().describe("The numeric value to convert"),
      from: z.string().describe("The source unit (e.g. km, kg, celsius)"),
      to: z.string().describe("The target unit (e.g. miles, pounds, fahrenheit)"),
    }),
  }
);


// TODO: Step 1 — Define wordCounter tool

const wordCounterTool = tool( ({sentence})=>{
    const numberOfWord =sentence.trim().split(" ").length;
    const numberOfSentences =sentence.trim().split(".").length
    return  JSON.stringify( {numberOfWord , numberOfSentences})

},{
    name:"word_counter",
    description:"Performs operations to count number of words and sentences  from the paragraph(userinput) . Use this whenever a number of wordcount is needed in a sentence",
    schema:z.object({
        sentence: z.string().describe("Sentence")
    })
})

// TODO: Step 1 — Define daysUntil tool

const daysUntilTool = tool(
  ({ targetDate }) => {
    const now = Date.now();
    const target = Date.parse(targetDate);
    if (isNaN(target)) return `Invalid date: ${targetDate}`;
    const days = Math.ceil((target - now) / (1000 * 60 * 60 * 24));
    if (days < 0) return `${targetDate} is ${Math.abs(days)} days in the past`;
    return String(days) + " days";
  },
  {
    name: "days_until",
    description: "Returns the number of days from today until a given future date (YYYY-MM-DD). Use when the user asks how many days until a specific date.",
    schema: z.object({
      targetDate: z.string().describe("Target date in YYYY-MM-DD format"),
    }),
  }
);


// TODO: Step 2 — Bind all tools to the model
 const modelWithTools = model.bindTools([wordCounterTool, unitConverterTool, daysUntilTool]);


// TODO: Step 3 — Implement runWithTools
 async function runWithTools(question: string): Promise<string | any> { 
    //   const answer = await modelWithTools.invoke([new HumanMessage(questions[2])]);
    const message = [];
    const aiMessage = await modelWithTools.invoke([new HumanMessage(question)]);
    console.log('first  response from the model')
    console.log(JSON.stringify(aiMessage.tool_calls, null, 2));
   
    //pushing the aiMessage to the message array
     message.push(aiMessage);
     //tool mapping now whatever tool it's calling we are getting the response and wrapt the answer and again pushing to the 
     const toolMap: Record<string, { invoke: (input: any) => Promise<any> }> = {
        word_counter:    wordCounterTool,
        unit_converter:  unitConverterTool,
        days_until:      daysUntilTool,
     }

    for (const toolCall of aiMessage.tool_calls ?? []) {
      const selectedTool = toolMap[toolCall.name];
      if (!selectedTool) continue;
 
      const toolResult = await selectedTool.invoke(toolCall);
      console.log(`\nExecuted '${toolCall.name}':`, (toolResult as any).content ?? toolResult);
      message.push(toolResult);
    }
  
  return  modelWithTools.invoke(message);

 
  }


// TODO: Step 4 — Test with all four questions
async function main() {
  const questions = [
    "How many miles is 42 km?",
    "How many days until 2027-01-01?",
    "Count the words and sentences in: 'The quick brown fox. It jumps over the lazy dog. Amazing!'",
    "Convert 100 degrees Celsius to Fahrenheit and also tell me how many days until 2026-12-25",
  ];
 
   const answer = await runWithTools(questions[3]);
    console.log("A:", (answer as any).content ?? answer);
  // for (const question of questions) {
  //   console.log(`\nQ: ${question}`);
  //   const answer = await runWithTools(question);
  //   console.log("A:", (answer as any).content ?? answer);
  // }

}

main().catch(console.error);
