/**
 * Exercise — Module 2.2: Embeddings & Vector Stores
 *
 * CHALLENGE: Build a Semantic Search Engine
 *
 * Using the space-exploration.txt document from Module 2.1,
 * build a system that answers questions by finding the most relevant chunks.
 *
 * STEP 1 — Load and split the document
 *   Use chunkSize=500, chunkOverlap=50 (same as the teaching file).
 *   Print: number of chunks produced.
 *
 * STEP 2 — Create a vector store
 *   Use MemoryVectorStore.fromDocuments() to embed and store all chunks.
 *   Print: confirmation that the store was created.
 *
 * STEP 3 — Similarity search
 *   Search for the following 4 queries and print the top 2 results for each:
 *     a) "Who was the first human in space?"
 *     b) "What is the International Space Station?"
 *     c) "Tell me about private space companies"
 *     d) "What are the benefits of space exploration?"
 *
 * STEP 4 — Search with scores
 *   For this query: "How to make a pizza?"
 *   Print the top 3 results WITH their similarity scores.
 *   In a comment: explain WHY the scores are low (hint: it's irrelevant to space).
 *
 * STEP 5 — Threshold filtering
 *   Write a function that only returns results with score above a threshold (e.g. 0.75).
 *   Test it with:
 *     - "Mars rovers and exploration" (should return results)
 *     - "Best Italian restaurants nearby" (should return empty or very few)
 *
 * BONUS — Compare embeddings manually
 *   Embed these 3 sentences:
 *     a) "Space exploration history"
 *     b) "The history of exploring outer space"
 *     c) "Italian cooking techniques"
 *   Compute cosine similarity between (a,b) and (a,c).
 *   Print both scores and explain the difference in a comment.
 *
 * Run: npx tsx 02-rag-memory/exercises/02-embeddings-vector-stores.ts
 */

import "dotenv/config";
import { readFile } from "fs/promises";
import { Document } from "@langchain/core/documents";
import { AzureOpenAIEmbeddings } from "@langchain/openai";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { MemoryVectorStore } from "@langchain/classic/vectorstores/memory";


const embeddings = new AzureOpenAIEmbeddings({
  azureOpenAIApiKey: process.env.AZURE_OPENAI_API_KEY,
  azureOpenAIApiDeploymentName: process.env.AZURE_OPENAI_EMBEDDING_DEPLOYMENT,
  azureOpenAIApiVersion: process.env.AZURE_OPENAI_EMBEDDING_API_VERSION,
  azureOpenAIApiInstanceName: "dhfoundary",
  azureOpenAIBasePath: `${process.env.AZURE_OPENAI_ENDPOINT}openai/deployments`,

});

async function loadTextFile(filePath: string): Promise<Document[]> {
  const text = await readFile(filePath, "utf-8");
  return [new Document({ pageContent: text, metadata: { source: filePath } })];
}

// TODO: Step 1 — Load and split

const simpleRag = async ()=>{
 const loadedDocs =  await loadTextFile('02-rag-memory/docs/space-exploration.txt') ;

  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 500,
    chunkOverlap: 50,
  })

const chunks = await splitter.splitDocuments(loadedDocs);
// TODO: Step 2 — Create vector store
const vectorStore = await MemoryVectorStore.fromDocuments(chunks , embeddings);

// TODO: Step 3 — Similarity search (4 queries, top 2 each)

const result = await vectorStore.similaritySearchWithScore("what is python and javaScript ?" , 2)



const queries = ["Space exploration history" ,"The history of exploring outer space" , "Italian cooking techniques"  ]

const answers = [] 
    for ( const query of queries){
    const result = await vectorStore.similaritySearch(query , 1);
    console.log(result)
     answers.push(result)
    }
    console.log(answers);


// this is the better approeach 
// const answers = await Promise.all(
//   queries.map(query =>
//     vectorStore.similaritySearchWithScore(query, 1)
//   )
// );

// console.log(answers);



 










// TODO: Step 4 — Search with scores (irrelevant query)
// Comment: Why are the scores low?

 const irrelevantQueryExample = await  vectorStore.similaritySearchWithScore('How Manchester United is performing ? ' , 1);

 console.log('***************** Irrelevant Query logging **********************')
 console.log(irrelevantQueryExample[0][1])
 let score = irrelevantQueryExample[0][1]

 if(score <0.5){
    console.log('Not related to the context');
 }




// TODO: BONUS — Compare embeddings manually
// function cosineSimilarity(a: number[], b: number[]): number { ... }
}


// TODO: Step 5 — Threshold filtering function
 async function searchWithThreshold(vectorStore, query, threshold = 0.5, k=1) { 

    const result = await  vectorStore.similaritySearchWithScore(query , k);

  const matchtedResult =  result.filter( (el)=>{
      console.log(el);
        if(el[1] > threshold){
            return el
        }
    } )

   return matchtedResult;
  }

async function main() {
  // Call your functions here
 // simpleRag();

  // quickly preparing the vectoreStore 
  //first loading the docs
  const loadedDocs =  await loadTextFile('02-rag-memory/docs/space-exploration.txt') ;
  // to chunk prepare the chunk we need the splitter , we are here using recursiveCharacterTextSplitter
  // it contains two things 1. chunkSize , overlap 
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize : 500 , 
    chunkOverlap : 50
  })
  //got the chunks
   const chunks =  await splitter.splitDocuments(loadedDocs) ;
   // saving to the vecotreStore 
   const vectoreStore = await MemoryVectorStore.fromDocuments(chunks , embeddings);

  const output = await searchWithThreshold(vectoreStore , 'what is javaScript ? ', 0.5 , 1);
  console.log("output");
  console.log(output);

   // now the retrival 
    
//    const result = await vectoreStore.similaritySearchWithScore('what is javaScript ?' , 1);
//    console.log(result)


}

main().catch(console.error);
