// STEP 9 — sending STATE to the UI: whole thing, or just what changed.

const state = {
  customer: { name: "Acme Corp", plan: "free", seats: 3 },
  ticket:   { id: "A123", status: "open" },
};

console.log("--- WAY 1: snapshot - send the whole object ---\n");
console.log('  data: {"type":"state_snapshot","snapshot":' + JSON.stringify(state) + "}");
console.log("\n  Simple. But if the plan changes 20 times, you resend everything 20 times.");

console.log("\n--- WAY 2: delta - send only what changed ---\n");
const patch = [{ op: "replace", path: "/customer/plan", value: "enterprise" }];
console.log('  data: {"type":"state_delta","delta":' + JSON.stringify(patch) + "}");
console.log("\n  That format is a web standard called JSON Patch (RFC 6902).");
console.log("  Three ops cover almost everything: replace, add, remove.");

console.log("\n--- applying the patch by hand, so it is not magic ---\n");
function applyPatch(obj, ops) {
  const copy = structuredClone(obj);
  for (const { op, path, value } of ops) {
    const keys = path.split("/").slice(1);          // "/customer/plan" -> ["customer","plan"]
    const last = keys.pop();
    let target = copy;
    for (const k of keys) target = target[k];
    if (op === "replace" || op === "add") target[last] = value;
    if (op === "remove") delete target[last];
  }
  return copy;
}
console.log("  before:", JSON.stringify(state.customer));
console.log("  after :", JSON.stringify(applyPatch(state, patch).customer));

console.log("\n  Use snapshot on connect (the UI needs a starting point),");
console.log("  then deltas for every change after that.");
