/**
 * Shared model setup for all modules.
 *
 * WHY THIS EXISTS (worth understanding, not just using):
 * Our Azure AI Foundry resource speaks the **v1 API** — the newer surface where
 * the URL looks like  <endpoint>/openai/v1/chat/completions  and there is NO
 * `api-version` query parameter.
 *
 * The older `AzureChatOpenAI` class builds the *classic* URL instead:
 *   <endpoint>/openai/deployments/<name>/chat/completions?api-version=...
 * ...which this resource does not serve. So we use the standard `ChatOpenAI`
 * client and just point its baseURL at the v1 path. Same LangChain interface,
 * correct wire format.
 *
 * On Azure, `model` is the **deployment name**, not the public model name.
 */
import 'dotenv/config';
import { ChatOpenAI, OpenAIEmbeddings } from '@langchain/openai';

const endpoint = process.env.AZURE_OPENAI_ENDPOINT?.replace(/\/$/, '');
const apiKey = process.env.AZURE_OPENAI_API_KEY;

if (!endpoint) throw new Error('AZURE_OPENAI_ENDPOINT is not set in .env');
if (!apiKey) throw new Error('AZURE_OPENAI_API_KEY is not set in .env');

/** Base URL for the Azure Foundry v1 API surface. */
const baseURL = `${endpoint}/openai/v1`;

/** Chat model. Pass overrides e.g. makeChatModel({ temperature: 0 }). */
export function makeChatModel(overrides: Record<string, unknown> = {}) {
  return new ChatOpenAI({
    model: process.env.AZURE_OPENAI_CHAT_DEPLOYMENT,
    apiKey,
    configuration: { baseURL },
    ...overrides,
  });
}

/** Embeddings model. */
export function makeEmbeddings(overrides: Record<string, unknown> = {}) {
  return new OpenAIEmbeddings({
    model: process.env.AZURE_OPENAI_EMBEDDING_DEPLOYMENT,
    apiKey,
    configuration: { baseURL },
    ...overrides,
  });
}

/** Ready-to-use singletons for quick scripts. */
export const llm = makeChatModel();
export const embeddings = makeEmbeddings();
