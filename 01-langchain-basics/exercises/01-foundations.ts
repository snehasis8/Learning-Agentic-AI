/**
 * Exercise — Modules 1.1 to 1.4 Combined
 *
 * CHALLENGE: News Article Analyzer
 *
 * Build a pipeline that takes a raw news article and produces an analysis report.
 * You must connect all three steps as a single LCEL chain.
 *
 * STEP 1 — Classify the article (Module 1.3: structured output + Zod)
 *   Extract a structured object with:
 *     - topic       : string  (what the article is about)
 *     - sentiment   : enum    ("positive" | "negative" | "neutral")
 *     - keyPeople   : string[] (names of people mentioned)
 *     - keyOrgs     : string[] (names of organizations mentioned)
 *
 * STEP 2 — Generate a summary (Module 1.2: ChatPromptTemplate)
 *   Write a prompt template that:
 *     - Takes the structured classification as input
 *     - Produces a 2-sentence summary
 *     - Acknowledges the sentiment (e.g. if negative, acknowledge concern)
 *
 * STEP 3 — Wire it as a chain (Module 1.4: LCEL .pipe / RunnableSequence)
 *   Connect Step 1 → Step 2 as a single chain
 *   The output of Step 1 (structured object) must feed into Step 2's template
 *
 * HINTS:
 *   - Use temperature: 0 for the classification step (deterministic extraction)
 *   - You will need two separate model instances OR override temperature per chain
 *   - To pass a structured object into a prompt template, use a mapping function:
 *       classifyChain.pipe((result) => ({ topic: result.topic, ... })).pipe(summaryChain)
 *   - Run: npx tsx 01-langchain-basics/05-exercise.ts
 *
 * Use the sample article below to test your pipeline.
 */

import "dotenv/config";
import { AzureChatOpenAI } from "@langchain/openai";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser , JsonOutputParser } from "@langchain/core/output_parsers";
import { RunnableSequence, RunnablePassthrough, RunnableParallel } from "@langchain/core/runnables";
import { z } from "zod";
// TODO: add your imports here


const model = new AzureChatOpenAI({
  azureOpenAIApiDeploymentName: process.env.AZURE_OPENAI_CHAT_DEPLOYMENT,
  azureOpenAIApiVersion: process.env.AZURE_OPENAI_API_VERSION,
  temperature: 0.1,
  maxTokens: 500,
});

const generationModel = new AzureChatOpenAI({
  azureOpenAIApiDeploymentName: process.env.AZURE_OPENAI_CHAT_DEPLOYMENT,
  azureOpenAIApiVersion: process.env.AZURE_OPENAI_API_VERSION,
  temperature: 0.1,
  maxTokens: 500,
})



// Sample article to test with
const sampleArticle = `
Microsoft announced today that it is acquiring Activision Blizzard for $68.7 billion,
the largest deal in gaming history. CEO Satya Nadella called it a "defining moment"
for the company's gaming ambitions. Activision CEO Bobby Kotick will remain in his role
through the transition. Regulators in the EU and UK have raised concerns about the deal's
impact on competition in the cloud gaming market. Sony has also objected, fearing exclusive
access to titles like Call of Duty. The acquisition is expected to close by mid-2024.
`;

// TODO: Step 1 — Define your Zod schema and classification chain

const articleSchema = z.object({
  topic:z.string().describe("Topic Name"),
  sentiment:z.enum(["Positive","Negative", "Neutral"]).describe("The value can only be positive , negative and neutral"),
  keyPeople:z.array(z.string()).describe("Name of the key people"),
  keyOrganization:z.array(z.string()).describe("Name of the companies")
})


const structureModel = model.withStructuredOutput(articleSchema);

const outputParser =  new StringOutputParser() ;

const articleStructureChain = ChatPromptTemplate.fromMessages([
  ["system","You are an expert article analyst and Sentiment Analyst"],
  ["user"," Please analyze this article and summarized this on this {article}"]
]).pipe(structureModel).pipe((response)=>{
  console.log( typeof response);
  return response
});


// TODO: Step 2 — Define your summary prompt template and chain

const summaryChain = ChatPromptTemplate.fromMessages([
  ["system","Please summarzed this in two sentence , also take the sentiment and acknowledge that from this {object}"]
]).pipe(model).pipe(outputParser)


// TODO: Step 3 — Connect Step 1 + Step 2 into a single pipeline

// now trying to convert both of the chain into a single runnable sequence where one output is depending on the previoue output

const combinedChain = RunnableSequence.from([
  ChatPromptTemplate.fromMessages([
  ["system","You are an expert article analyst and Sentiment Analyst"],
  ["user"," Please analyze this article and summarized this on this {article}"]
]),
structureModel,
(response)=>{
  console.log(response);
  return {...response};
},
 ChatPromptTemplate.fromMessages([
  ["system", "Please summarize in two sentences. Topic: {topic}, Sentiment: {sentiment}, Key People: {keyPeople}, Orgs: {keyOrganization}. Acknowledge the sentiment."]
]),
model,
outputParser
])

async function main() {
  console.log("=== News Article Analyzer ===\n");
  console.log("Article:", sampleArticle.trim());
  console.log("\n--- Running pipeline... ---\n");
   
 
  const result = await articleStructureChain.invoke({article:sampleArticle});
  console.log(result);

  const finalOutput = await summaryChain.invoke({object : result});
  
  console.log(finalOutput);

  console.log('trying comibined chain ----------------------->')

  const combinedAnswer = await combinedChain.invoke({article:sampleArticle})
   console.log(  " Final Response :" , combinedAnswer);
  
  // TODO: invoke your pipeline with sampleArticle and print the result
}

main().catch(console.error);
