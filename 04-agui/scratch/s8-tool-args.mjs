// STEP 8 — tool arguments arrive as BROKEN JSON, on purpose.
// The model writes them one token at a time, same as it writes text.

const pieces = ['{"order', 'Id":"A1', '23","amount', 'Cents":500}'];

console.log("--- what arrives, piece by piece ---\n");
let buffer = "";
for (const p of pieces) {
  buffer += p;
  console.log(`  data: {"type":"tool_args","id":"t1","delta":${JSON.stringify(p)}}`);
  try {
    JSON.parse(buffer);
    console.log(`     buffer so far: ${buffer}   <- parses OK`);
  } catch {
    console.log(`     buffer so far: ${buffer}   <- NOT valid JSON yet`);
  }
}

console.log("\n--- only after tool_end is the buffer complete ---\n");
console.log('  data: {"type":"tool_end","id":"t1"}');
console.log("     parsed:", JSON.parse(buffer));

console.log("\n--- so why stream args at all? ---");
console.log("  because a UI can show the tool NAME immediately (from tool_start)");
console.log("  and light up '🔧 refundOrder...' while the arguments are still typing.");
