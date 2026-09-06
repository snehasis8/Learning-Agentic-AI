/**
 * Shared Postgres wiring for the durable-state block (02-rag-memory/05–07).
 *
 * One PostgresSaver, one raw pg.Pool for reading the tables yourself, and a
 * tiny helper for the --reset flows each file supports. Nothing here is a
 * lesson on its own — 05's Part 1 comment is still where "why one saver, one
 * pool" is explained. This just exists so 06 and 07 don't redeclare it.
 */
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import pg from "pg";

export const PG_URL =
  process.env.POSTGRES_URL ?? "postgresql://postgres:postgres@localhost:5432/langgraph";

export const checkpointer = PostgresSaver.fromConnString(PG_URL);

// A second connection, purely so you can read the tables yourself. The saver
// keeps its own private pool; nothing here reaches into it.
export const pool = new pg.Pool({ connectionString: PG_URL });

export async function deleteThreads(...threadIds: string[]) {
  for (const id of threadIds) await checkpointer.deleteThread(id);
}

export async function closeAll() {
  // Both pools must be closed or the process will not exit.
  await checkpointer.end();
  await pool.end();
}
