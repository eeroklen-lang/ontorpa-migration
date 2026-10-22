// Copies the PAD Robin Action Knowledge Base entries for every action in the PAD catalog into
// backend/test/fixtures/pad-robin-actions.json, which the PAD linker tests check the generated
// Robin against. Run it after adding or changing a PAD template:
//
//   git clone --depth 1 https://github.com/JoeG592/pad-robin-action-kb <kb folder>
//   (cd backend && npm run --silent pad:catalog > ../samples/output/pad-catalog.txt)
//   node scripts/update-pad-robin-fixture.js <kb folder>/PAD_Robin_ActionKB.json samples/output/pad-catalog.txt
//
// The knowledge base is by JoeG592, licensed CC BY 4.0; the fixture keeps the attribution.
const fs = require("fs");
const path = require("path");

const [kbFile, catalogFile] = process.argv.slice(2);
if (!kbFile || !catalogFile) {
  console.error("Usage: node scripts/update-pad-robin-fixture.js <PAD_Robin_ActionKB.json> <pad-catalog.txt>");
  process.exit(1);
}
const kb = JSON.parse(fs.readFileSync(kbFile, "utf8"));
const byId = new Map(kb.actions.map((action) => [action.actionId, action]));

// The action id is the first word of an action line, or of the statement in IF (...) / WAIT (...)
const ids = new Set();
for (const line of fs.readFileSync(catalogFile, "utf8").split(/\r?\n/).map((l) => l.trim())) {
  const statement = /^(?:IF|WAIT) \((.*)\)(?: THEN)?$/.exec(line)?.[1] ?? line;
  const id = /^([A-Z][A-Za-z]+(?:\.[A-Za-z]+)+)\s/.exec(statement)?.[1];
  if (id) {
    ids.add(id);
  }
}

const missing = [...ids].filter((id) => !byId.has(id));
if (missing.length > 0) {
  console.error(`Not in the knowledge base: ${missing.join(", ")}`);
  process.exitCode = 1;
}
const actions = Object.fromEntries(
  [...ids]
    .filter((id) => byId.has(id))
    .sort()
    .map((id) => {
      const action = byId.get(id);
      return [
        id,
        {
          kind: action.kind,
          inputs: Object.fromEntries(action.input_params.map((p) => [p.name, p.enumValues || null])),
          outputs: action.output_params.map((p) => p.name),
          golden_example: action.golden_example,
        },
      ];
    })
);
const fixture = {
  source: "PAD Robin Action Knowledge Base, https://github.com/JoeG592/pad-robin-action-kb",
  license: kb.license,
  version: kb.version,
  pad_build: kb.pad_build,
  note: "Only the actions the PAD exporter generates. Regenerate with scripts/update-pad-robin-fixture.js.",
  actions,
};
const out = path.join(__dirname, "..", "backend", "test", "fixtures", "pad-robin-actions.json");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(fixture, null, 2) + "\n");
console.log(`Wrote ${Object.keys(actions).length} actions to ${path.relative(process.cwd(), out)}`);
