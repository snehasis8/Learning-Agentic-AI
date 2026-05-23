/**
 * Module 1.3 — Structured Output (First Principles)
 *
 * PART 1: The problem — asking nicely doesn't work reliably
 * PART 2: .withStructuredOutput() with Zod — guaranteed typed objects
 * PART 3: Nested schemas — complex structured extraction
 * PART 4: Enum fields & optional fields — real-world schemas
 *
 * Run: npx tsx 01-langchain-basics/03-structured-output.ts
 */

import "dotenv/config";
import { AzureChatOpenAI } from "@langchain/openai";
import { z } from "zod";

const model = new AzureChatOpenAI({
  azureOpenAIApiDeploymentName: process.env.AZURE_OPENAI_CHAT_DEPLOYMENT,
  azureOpenAIApiVersion: process.env.AZURE_OPENAI_API_VERSION,
  temperature: 0, // Always 0 for extraction — we want deterministic, accurate results
  maxTokens: 500,
});

// ============================================================
// PART 1: The Problem — Asking Nicely
// ============================================================

async function askingNicely() {
  console.log("=== PART 1: Asking Nicely (unreliable) ===\n");

  const text = "The Dell XPS 15 laptop costs $1,299 and is available in the electronics section.";

  // Attempt 1: Just ask for JSON in the prompt
  const response = await model.invoke([
    ["system", "Extract product information and respond ONLY with valid JSON. No other text."],
    ["user", `Extract from: "${text}"`],
  ]);

  console.log("Raw response (string):", response.content);
  console.log("Type:", typeof response.content);

  // Now try to use it — this is where it gets fragile
  try {
    const parsed = JSON.parse(response.content as string);
    console.log("Parsed successfully:", parsed);
  } catch (e) {
    console.log("Parse failed! Model added extra text around the JSON.");
  }

  console.log("\nProblem: You're at the mercy of the model's formatting.");
  console.log("Even if it works now, it may fail on edge cases.\n");
}

// ============================================================
// PART 2: .withStructuredOutput() — The Right Way
// ============================================================

async function structuredOutput() {
  console.log("\n=== PART 2: .withStructuredOutput() ===\n");

  // Step 1: Define the SHAPE of what you want using Zod
  // .describe() gives the model hints about what each field means
  const ProductSchema = z.object({
    name: z.string().describe("The product name"),
    price: z.number().describe("The price as a number, without currency symbols"),
    category: z.string().describe("The product category"),
    brand: z.string().describe("The brand or manufacturer"),
  });

  // Step 2: Create a structured model — this is a NEW model instance
  // that will ALWAYS return an object matching ProductSchema
  const structuredModel = model.withStructuredOutput(ProductSchema);

  // Step 3: Invoke — notice you get a typed object back, NOT a string
  const text = "The Dell XPS 15 laptop costs $1,299 and is available in the electronics section.";

  const result = await structuredModel.invoke([
    ["system", "Extract product information from the user's text."],
    ["user", text],
  ]);

  // result is fully typed — TypeScript knows it has .name, .price, .category, .brand
  console.log("Structured result:", result);
  console.log("\nAccessing fields directly (fully typed):");
  console.log("  Name:     ", result.name);
  console.log("  Price:    ", result.price);
  console.log("  Category: ", result.category);
  console.log("  Brand:    ", result.brand);
  console.log("\nType of price field:", typeof result.price); // number, not string!

  // No JSON.parse(), no try/catch, no fragile string parsing
  // You get a real TypeScript object with the correct types
}

// ============================================================
// PART 3: Nested Schemas — Complex Extraction
// ============================================================

async function nestedSchemas() {
  console.log("\n\n=== PART 3: Nested Schemas ===\n");

  // Schemas can be nested — objects inside objects, arrays, etc.
  const JobPostingSchema = z.object({
    title: z.string().describe("The job title"),
    company: z.string().describe("The company name"),
    location: z.object({
      city: z.string().describe("The city"),
      country: z.string().describe("The country"),
      remote: z.boolean().describe("Whether remote work is allowed"),
    }),
    salary: z.object({
      min: z.number().describe("Minimum salary"),
      max: z.number().describe("Maximum salary"),
      currency: z.string().describe("Currency code, e.g. USD"),
    }),
    // z.array() for lists
    requirements: z.array(z.string()).describe("List of key requirements"),
  });

  const structuredModel = model.withStructuredOutput(JobPostingSchema);

  const jobText = `
    Senior TypeScript Engineer at TechCorp in Berlin, Germany.
    Hybrid work - 3 days in office, 2 remote.
    Salary: €80,000 - €110,000.
    Requirements: 5+ years TypeScript, Node.js experience, 
    knowledge of distributed systems, team leadership experience.
  `;

  console.log("Extracting from job posting...\n");
  const result = await structuredModel.invoke([
    ["system", "Extract structured information from the job posting."],
    ["user", jobText],
  ]);

  console.log("Extracted job posting:");
  console.log(JSON.stringify(result, null, 2));

  // Access nested fields
  console.log("\nDirect access:");
  console.log("  City:", result.location.city);
  console.log("  Remote:", result.location.remote);
  console.log("  Salary range:", `${result.salary.min} - ${result.salary.max} ${result.salary.currency}`);
  console.log("  Requirements:", result.requirements.join(", "));
}

// ============================================================
// PART 4: Enums & Optional Fields
// ============================================================

async function enumsAndOptionals() {
  console.log("\n\n=== PART 4: Enums & Optional Fields ===\n");

  const SupportTicketSchema = z.object({
    // z.enum() restricts to specific allowed values
    priority: z.enum(["low", "medium", "high", "critical"])
      .describe("Priority level based on urgency and impact"),

    category: z.enum(["billing", "technical", "account", "general"])
      .describe("The type of support issue"),

    summary: z.string().describe("One sentence summary of the issue"),

    // z.optional() — field may or may not be present
    affectedFeature: z.string().optional()
      .describe("The specific feature affected, if applicable"),

    // z.number().int() — must be a whole number
    estimatedMinutesToResolve: z.number().int()
      .describe("Estimated time to resolve in minutes"),
  });

  const structuredModel = model.withStructuredOutput(SupportTicketSchema);

  const tickets = [
    "I can't log in to my account, I keep getting a password error. This is urgent as I have a meeting in 30 minutes.",
    "My invoice from last month shows the wrong amount. I was charged $200 but should have been charged $150.",
    "The dashboard charts are not loading, just showing a blank white screen.",
  ];

  console.log("--- Classifying support tickets ---\n");

  for (const ticket of tickets) {
    const result = await structuredModel.invoke([
      ["system", "Analyze this support ticket and extract structured information."],
      ["user", ticket],
    ]);

    console.log(`Ticket: "${ticket.substring(0, 60)}..."`);
    console.log(`  Priority: ${result.priority}`);
    console.log(`  Category: ${result.category}`);
    console.log(`  Summary:  ${result.summary}`);
    console.log(`  Feature:  ${result.affectedFeature ?? "N/A"}`);
    console.log(`  Est. time: ${result.estimatedMinutesToResolve} mins\n`);
  }
}

// ============================================================
// Run everything
// ============================================================

async function main() {
  // await askingNicely();
  // await structuredOutput();
  await nestedSchemas();
  await enumsAndOptionals();
}

main().catch(console.error);
