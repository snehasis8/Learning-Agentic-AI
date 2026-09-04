/**
 * Exercise — Module M.1: Why MCP  (short — ~25 min)
 *
 * Goal: prove the two halves of a tool really are separable, by moving one.
 * Copy the server + askServer helper out of ../01-why-mcp.ts — the point here
 * is the protocol, not retyping Express.
 *
 * STEP 1 — Add a tool without touching the client
 *   Add a third tool to TOOLS + IMPLS: `reverseText({ text })`.
 *     - write the inputSchema by hand as JSON Schema (no zod — remember why)
 *   Then call tools/list and tools/call for it.
 *   ✅ PASS when: you never edited the discovery code to "know about" it.
 *      That is the entire thesis of the protocol.
 *
 * STEP 2 — Let the LLM find it
 *   Re-run PART 4's loop, but ask a question that needs your new tool
 *   ("reverse the word stressed"). Confirm the model picks it purely from the
 *   description you wrote.
 *   Then BREAK it: change the tool's `description` to "Does a thing." and ask
 *   again. In a comment, answer:
 *     - did the model still call it?
 *     - what does that tell you about where descriptions actually matter?
 *
 * STEP 3 — Two layers of failure
 *   Make `reverseText` throw on empty input. Call it with { text: "" }.
 *   In a comment, record:
 *     - the HTTP status code
 *     - the JSON body
 *     - why a broken tool must NOT be a 500
 *   Then call a method that doesn't exist at all and compare the two.
 *
 * BONUS — Count the cost
 *   Log the JSON you pass to bindTools() and count the characters. Now imagine
 *   a server with 50 tools. Answer in a comment:
 *     - roughly how many tokens ride along on EVERY llm call?
 *     - name two ways you'd cut that in production.
 *
 * BONUS 2 — Classify these
 *   TOOL, RESOURCE, or PROMPT? One line each on why:
 *     a) "read the current sprint's Jira board"
 *     b) "close ticket PROJ-412"
 *     c) "summarise this PR"  (a template a human picks from a menu)
 *     d) "the company leave policy document"
 *     e) "send the customer a refund"
 *   Which would you gate behind a 3.6 interrupt, and why?
 *
 * Run: npx tsx 05-mcp/exercises/01-why-mcp.ts
 */

import "dotenv/config";

// TODO: Step 1 — server with a third tool; discover and call it

// TODO: Step 2 — let the LLM find it, then sabotage the description

// TODO: Step 3 — a throwing tool vs an unknown method

// TODO: Bonus — count the description tokens; classify a–e

async function main() {
  // TODO: run your steps
}

main().catch(console.error);
