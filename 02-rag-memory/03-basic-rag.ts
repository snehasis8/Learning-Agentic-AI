/**
 * Module 2.3 — Basic RAG (Retrieve → Augment → Generate)
 *
 * WHAT YOU'LL LEARN:
 *   - How to connect retrieval (vector search) to generation (LLM)
 *   - What a RAG chain looks like in LangChain
 *   - How to format retrieved chunks into a prompt
 *   - How to use a retriever (the LangChain interface for search)
 *   - How to build a complete question-answering system over a document
 *
 * PREREQUISITES:
 *   - Module 2.1 (Document Loaders & Text Splitting)
 *   - Module 2.2 (Embeddings & Vector Stores)
 *
 * Run: npx tsx 02-rag-memory/03-basic-rag.ts
 */

import 'dotenv/config';
import { readFile } from 'fs/promises';
import { Document } from '@langchain/core/documents';
import { AzureChatOpenAI, AzureOpenAIEmbeddings } from '@langchain/openai';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { MemoryVectorStore } from '@langchain/classic/vectorstores/memory';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { RunnableSequence, RunnablePassthrough } from '@langchain/core/runnables';

// LLM for generating answers
const model = new AzureChatOpenAI({
  azureOpenAIApiDeploymentName: process.env.AZURE_OPENAI_CHAT_DEPLOYMENT,
  azureOpenAIApiVersion: process.env.AZURE_OPENAI_API_VERSION,
  temperature: 0,
  maxTokens: 500,
});

// Embedding model for vector search
const embeddings = new AzureOpenAIEmbeddings({
  azureOpenAIApiKey: process.env.AZURE_OPENAI_API_KEY,
  azureOpenAIApiDeploymentName: process.env.AZURE_OPENAI_EMBEDDING_DEPLOYMENT,
  azureOpenAIApiVersion: process.env.AZURE_OPENAI_EMBEDDING_API_VERSION,
  azureOpenAIApiInstanceName: 'dhfoundary',
  azureOpenAIBasePath: `${process.env.AZURE_OPENAI_ENDPOINT}openai/deployments`,
});

// Helper
async function loadTextFile(filePath: string): Promise<Document[]> {
  const text = await readFile(filePath, 'utf-8');
  return [new Document({ pageContent: text, metadata: { source: filePath } })];
}

// Shared setup: Load → Split → Embed → Store (done once)
async function prepareVectorStore() {
  const docs = await loadTextFile('02-rag-memory/docs/space-exploration.txt');
  const splitter = new RecursiveCharacterTextSplitter({ chunkSize: 500, chunkOverlap: 50 });
  const chunks = await splitter.splitDocuments(docs);
  return MemoryVectorStore.fromDocuments(chunks, embeddings);
}

// =============================================================================
// PART 1 — Manual RAG (No Chain)
// =============================================================================
// The simplest RAG: retrieve chunks, manually build a prompt, call the LLM.
// This shows exactly what happens under the hood.

async function manualRag() {
  console.log('=== PART 1: Manual RAG ===\n');

  const vectorStore = await prepareVectorStore();

  const question = 'When did humans first walk on the Moon and who did it?';

  // Step 1: Retrieve relevant chunks
  const retrievedDocs = await vectorStore.similaritySearch(question, 3);

  // Step 2: Format chunks into a context string
  const context = retrievedDocs.map((doc) => doc.pageContent).join('\n\n');

  // Step 3: Build the prompt manually
  const prompt = `Answer the question based ONLY on the following context. If the context doesn't contain the answer, say "I don't know."

Context:
${context}

Question: ${question}

Answer:`;

  // Step 4: Call the LLM
  const response = await model.invoke(prompt);

  console.log(`Question: ${question}\n`);
  console.log(`Retrieved ${retrievedDocs.length} chunks as context.`);
  console.log(`\nAnswer: ${response.content}\n`);
  console.log("Key insight: RAG = Search + Prompt + LLM. That's it.");
  console.log('The LLM never saw the full document — only the 3 relevant chunks.\n');
}

// =============================================================================
// PART 2 — Using a Retriever
// =============================================================================
// A retriever is LangChain's standard interface for "give me relevant docs".
// Any vector store can be converted to a retriever with .asRetriever(k).
// This lets you plug it into chains.

async function usingARetriever() {
  console.log('=== PART 2: Using a Retriever ===\n');

  const vectorStore = await prepareVectorStore();

  // Convert vector store to a retriever (returns top 3 docs)
  const retriever = vectorStore.asRetriever(3);

  // A retriever has one method: invoke(query) → Document[]
  const question = 'What is the International Space Station?';
  const docs = await retriever.invoke(question);

  console.log(`Question: "${question}"`);
  console.log(`Retriever returned ${docs.length} documents:\n`);
  for (let i = 0; i < docs.length; i++) {
    console.log(`  ${i + 1}. "${docs[i].pageContent.slice(0, 100)}..."`);
  }
  console.log('\nKey insight: retriever.invoke(query) = vectorStore.similaritySearch(query, k)');
  console.log('But retrievers are composable — they plug directly into LCEL chains.\n');
}

// =============================================================================
// PART 3 — RAG Chain with LCEL
// =============================================================================
// Now let's build RAG as a proper chain using LCEL (LangChain Expression Language).
// This is the production pattern:
//   question → retriever → format context → prompt → LLM → output

async function ragChain() {
  console.log('=== PART 3: RAG Chain with LCEL ===\n');

  const vectorStore = await prepareVectorStore();
  const retriever = vectorStore.asRetriever(3);

  // The RAG prompt template
  const ragPrompt = ChatPromptTemplate.fromTemplate(`
        Answer the question based ONLY on the following context.
        If the context doesn't contain the answer, say "I don't know."

        Context:
        {context}

        Question: {question}

        Answer:`);

  // Helper: format retrieved docs into a single string
  function formatDocs(docs: Document[]): string {
    return docs.map((doc) => doc.pageContent).join('\n\n');
  }

  // Build the chain using RunnableSequence
  const chain = RunnableSequence.from([
    {
      // Run retriever and format docs → becomes {context}
      context: async (input: { question: string }) => {
        const docs = await retriever.invoke(input.question);
        return formatDocs(docs);
      },
      // Pass question through unchanged → becomes {question}
      question: (input: { question: string }) => input.question,
    },
    ragPrompt,
    model,
    new StringOutputParser(),
  ]);

  // Test with multiple questions
  const questions = [
    'What was the Space Shuttle program?',
    'Who founded SpaceX and when?',
    'What color is a giraffe?', // not in our document
    'what language we use for web development?',
  ];

  for (const question of questions) {
    const answer = await chain.invoke({ question });
    console.log(`Q: ${question}`);
    console.log(`A: ${answer}\n`);
  }

  console.log('Key insight: The chain handles retrieval + prompting + generation in one call.');
  console.log("'What color is a giraffe?' returns 'I don't know' because it's not in the doc.\n");
}

// =============================================================================
// PART 4 — RAG with Source Citations
// =============================================================================
// In production you want to show WHERE the answer came from.
// We'll return the answer AND the source metadata.

async function ragWithSources() {
  console.log('=== PART 4: RAG with Source Citations ===\n');

  const vectorStore = await prepareVectorStore();
  const retriever = vectorStore.asRetriever(3);

  const ragPrompt = ChatPromptTemplate.fromTemplate(`
Answer the question based ONLY on the following context.
If the context doesn't contain the answer, say "I don't know."

Context:
{context}

Question: {question}

Answer:`);

  function formatDocs(docs: Document[]): string {
    return docs.map((doc) => doc.pageContent).join('\n\n');
  }

  // Custom function that returns both answer and sources
  async function askWithSources(question: string) {
    // Step 1: Retrieve
    const docs = await retriever.invoke(question);

    console.log(docs);

    // Step 2: Generate answer
    const context = formatDocs(docs);
    const chain = ragPrompt.pipe(model).pipe(new StringOutputParser());
    const answer = await chain.invoke({ context, question });

    // Step 3: Extract source info from metadata
    const sources = docs.map((doc) => ({
      source: doc.metadata.source,
      lines: doc.metadata.loc?.lines,
    }));

    return { answer, sources };
  }

  const question = 'Tell me about the Artemis program.';
  const result = await askWithSources(question);

  console.log(`Q: ${question}`);
  console.log(`A: ${result.answer}\n`);
  console.log('Sources:');
  for (const src of result.sources) {
    console.log(`  - ${src.source} (lines ${src.lines?.from}–${src.lines?.to})`);
  }
  console.log('\nKey insight: Metadata lets you cite sources. Users can verify the answer.\n');
}

// =============================================================================
// PART 5 — Complete RAG Q&A System
// =============================================================================
// Putting it all together: a reusable function that takes any question
// and returns an answer grounded in the document.

async function completeRagSystem() {
  console.log('=== PART 5: Complete RAG Q&A System ===\n');

  const vectorStore = await prepareVectorStore();
  const retriever = vectorStore.asRetriever(3);

  const ragPrompt = ChatPromptTemplate.fromTemplate(`
You are a helpful assistant that answers questions about space exploration.
Use ONLY the provided context to answer. Be concise (2-3 sentences max).
If the context doesn't contain the answer, say "I don't have information about that."

Context:
{context}

Question: {question}

Answer:`);

  function formatDocs(docs: Document[]): string {
    return docs.map((doc) => doc.pageContent).join('\n\n');
  }

  const chain = RunnableSequence.from([
    {
      context: async (input: { question: string }) => {
        const docs = await retriever.invoke(input.question);
        return formatDocs(docs);
      },
      question: (input: { question: string }) => input.question,
    },
    ragPrompt,
    model,
    new StringOutputParser(),
  ]);

  // Interactive-style Q&A
  const questions = [
    'How many astronauts walked on the Moon in total?',
    'What did the Perseverance rover do on Mars?',
    'What are the practical benefits of space exploration?',
    'What is the capital of France?', // out of scope
  ];

  console.log('--- Space Exploration Q&A ---\n');
  for (const q of questions) {
    const answer = await chain.invoke({ question: q });
    console.log(`Q: ${q}`);
    console.log(`A: ${answer}\n`);
  }

  console.log('Key insight: This IS a RAG application. Load once, query many times.');
  console.log('The system prompt constrains the LLM to only use retrieved context.\n');
}

const myFunction = async (path: string, questions: [string]) => {
  // --- ONE-TIME SETUP (done once at startup) ---
  // load the file

  const textFile = await readFile(path, 'utf8');
  // now I need to create the doucment this document is constructor which is coming from the langchain library

  const Doc = new Document({ pageContent: textFile, metadata: { source: path } });

  // create the splitter --> what is a spliter how you want to cut the rope ?   the chunkSize and the overlap
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 500,
    chunkOverlap: 50,
  });
  // chunk the file  here the actual breaking is going to take place

  // splitter.splitDocuments always expect array of documents for obvious reasons if here we use even two documents then it's knows
  const chunks = await splitter.splitDocuments([Doc]);

  // embed the chunks + load to vector store
  const vectorStore = await MemoryVectorStore.fromDocuments(chunks, embeddings);
  // --- PER QUESTION (done for each query) ---

  // take the user's question (here we only taking a singe questions we can take multipel questions as well in the form or an array )

  const userQuestion = questions[0];
  // retrieve relevant chunks from vector store

  // Now the actual searh part form the document the user quesry

  // there is couple ways that we could retrive the value from the vectoreStore and the second parameter is k = top result ie if it's k=2 then it will find the top 2 results

  const retrival = await vectorStore.similaritySearchWithScore(userQuestion, 1);

  const retrivalRunable = vectorStore.asRetriever(1);

  const retrival2 = await retrivalRunable.invoke(userQuestion); // this is we need when we are going to use it throught the langchain. I will come to this later . when we need to use the langchain then we are going to use this
  
  console.log('retrival--------->');
  console.log(retrival);

  console.log(retrival2);

  // stitch the chunks into a single context string
  const stichingChunk = retrival
    .map((el) => {
      return el[0].pageContent;
    })
    .join('\n\n');

  // console.log('stichingChunk' , stichingChunk)

  // feed context + question into the prompt
  const prompt = `Answer the question from the following context . if you don't know the answer from the given context . simply say I don't know. 
Context:${stichingChunk}
Question :${userQuestion}

`;

  // call the LLM
  const answer = await model.invoke(prompt);
  // get the resultt
  console.log(`// =============================================================================
         Final Answer :   ${answer.content}
// =============================================================================`);
};

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  // await manualRag();
  // await usingARetriever();
  // await ragChain();
  //  await ragWithSources();
  // await completeRagSystem();

  // trying out my own function

  myFunction('02-rag-memory/docs/space-exploration.txt', ['what is javaScript ? ']);
}

main().catch(console.error);
