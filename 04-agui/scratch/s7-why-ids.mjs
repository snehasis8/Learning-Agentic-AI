// STEP 7 — why every event carries an id.
// An agent often does two things at once. Watch what arrives.

const events = [
  { type: "text_start",   id: "m1" },
  { type: "text_start",   id: "m2" },
  { type: "text_content", id: "m1", delta: "Order " },
  { type: "text_content", id: "m2", delta: "Meanwhile, " },
  { type: "text_content", id: "m1", delta: "A123 " },
  { type: "text_content", id: "m2", delta: "checking " },
  { type: "text_content", id: "m1", delta: "shipped." },
  { type: "text_content", id: "m2", delta: "stock..." },
];

console.log("--- what actually arrives on the wire (interleaved!) ---\n");
for (const e of events) console.log("  ", JSON.stringify(e));

console.log("\n--- WITHOUT ids: just glue the deltas together ---\n");
const glued = events.filter(e => e.delta).map(e => e.delta).join("");
console.log(`   "${glued}"`);
console.log("   ^ garbage. Two messages shredded into each other.");

console.log("\n--- WITH ids: each delta knows which bubble it belongs to ---\n");
const bubbles = {};
for (const e of events) {
  if (e.type === "text_start") bubbles[e.id] = "";
  if (e.type === "text_content") bubbles[e.id] += e.delta;
}
for (const [id, text] of Object.entries(bubbles)) console.log(`   ${id}: "${text}"`);
