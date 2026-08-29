// STEP 6 — why one message is THREE events, not one.
// No server needed. Just watch what a UI can do in each case.

console.log("--- ATTEMPT A: send the message as ONE event ---\n");

// The agent has to finish thinking before it can send this.
await new Promise(r => setTimeout(r, 2000));
console.log('  (2 seconds of nothing...)');
console.log('  data: {"type":"text","content":"Order A123 was shipped."}');
console.log("\n  UI could show: nothing, then everything. Same as step 2.\n");

console.log("--- ATTEMPT B: split it into start / content / end ---\n");

console.log('  data: {"type":"text_start","id":"m1"}');
console.log('     -> UI creates an empty grey bubble NOW');

for (const word of ["Order ", "A123 ", "was ", "shipped."]) {
  await new Promise(r => setTimeout(r, 300));
  console.log(`  data: {"type":"text_content","id":"m1","delta":"${word}"}`);
  console.log(`     -> UI appends "${word}" to that bubble`);
}

console.log('  data: {"type":"text_end","id":"m1"}');
console.log('     -> UI stops the blinking cursor, enables the reply box');
