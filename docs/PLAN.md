# Development plan: UiPath → Power Automate, first slice

Covers issue #1 (bot import) and issue #2 (activity mapping). The pipeline:

```
UiPath .xaml → ontology process tree → (a) migration readiness report
                                     → (b) Power Automate Desktop (PAD) skeleton flow
```

Tick boxes as work lands. Paths are relative to the repo root (`backend/…`, `frontend/…`).

## Progress

| Milestone | Status |
|---|---|
| M0: Setup | In progress |
| M1: UiPath import (#1) | Not started |
| M2: Mapping + readiness report (#2) | Not started |
| M3: PAD skeleton exporter | Not started |
| M4: API + UI integration | Not started |
| Verification | Not started |

## Context

OntoRPA (originally `onto-rpa-frontend` and `conceptual-bot-backend`, now `frontend/` and `backend/`) models conceptual RPA bots. Each step is an operation from an OWL ontology (`frontend/src/resources/rpa-operations.json`, 50 operations). Bots are stored as a vendor-neutral **process tree** and translated to Robot Framework or taskt by mapping tables (`backend/src/botLinkers/*`). It is a thesis project: the goal is to grow it into a migration and portfolio-maintenance tool, starting with **UiPath → Power Automate**. The test data is a few real samples: REFramework-based bots using Office, browser, SAP and other desktop apps.

Migration is broken into 12 atomic issues: import, activity mapping, control flow, expressions, selectors, error handling, config and secrets, orchestration, custom code, effort estimation, inventory, and equivalence. This plan solves **#1 + #2**, with the ontology as the shared intermediate layer. At the moment, the only way to get a bot into the tool is to draw it by hand. This slice is the prerequisite for issues #10 (effort estimation) and #11 (inventory).

Research angle: the coverage report measures how well the ontology works as an intermediate layer for migration. The unmapped activities it finds become the evidence for extending the ontology. Loops, generic desktop UI operations and SAP are already known gaps.

## Design decisions

- **Pipeline in the back end, as pure functions**, exposed both as a CLI (batch runs over samples for the thesis evaluation) and as REST (for the UI).
- **The importer emits the existing process tree format** (`IProcessTree` in `backend/src/interfaces/BotModelInterface.ts:8-20`). Node ids use bpmn-js-style prefixes (`Activity_`, `Gateway_`, `Loop_`), so the existing linkers keep working: they detect gateways by the substring `"Gateway"` in the key (`RobotFrameworkLinker.ts:140`, `TasktLinker.ts:104`).
- **`nodeInfo` gains an optional `source`** field: `{vendor:"UiPath", activityType, displayName, file, expression?}`, plus `mappingStatus: mapped | unmapped | structural | manual`. An unmapped node gets `concept: ""` and keeps its source info.
- **Context-dependent mapping:** UiPath's generic UI activities (`Click`, `TypeInto`, `GetText`, `NClick`…) resolve to an ontology operation depending on the enclosing scope (`OpenBrowser` / `UseBrowser` / `NApplicationCard` with a URL → Browser*; an exe such as `saplogon.exe` → SAP; otherwise generic desktop). This is the same idea as the ontology's context containers.
- **REFramework is recognised as a platform pattern** rather than imported line by line. If `Main.xaml` is a StateMachine with the standard states or a `Framework/` folder exists, the bot body is taken from `Process.xaml`, with invoked workflows inlined. The report lists the framework parts as "maps to PA pattern (Work Queues + cloud-flow trigger)" and lists the Config.xlsx, asset and queue items as manual config work (issues #7 and #8 are out of scope).
- **Out of scope, recorded but not translated:** Try/Catch bodies (the Try part is inlined and the Catch parts are reported), Invoke Code, VB/C# expressions (kept as text in `source.expression` and emitted as TODOs), and selectors (counted only).
- **The back end gets its own copy of `rpa-operations.json`** plus a minimal index loader. This follows the existing duplication pattern (the back end already hard-codes the containers in `backend/src/utils/ontologyParser.ts`). The front end's `frontend/src/utils/ontologyParser.ts` is the reference for the IRI and property handling.

## M0: Setup

- [x] Create the combined repo with `git subtree add` (`backend/` from `conceptual-bot-backend`, `frontend/` from `onto-rpa-frontend`, full history kept)
- [x] Root `.gitignore` (`node_modules/`, `dist/`, `build/`, `.env`, `.DS_Store`, `samples/`)
- [x] Root `README.md` (purpose, layout, how to run, credits to Maximilian Völker / bptlab, MIT licenses kept in each subfolder)
- [x] Private GitHub repo `eeroklen-lang/ontorpa-migration` created and pushed
- [x] `npm install` in `backend/` and `frontend/`
- [x] Plan saved in the repo (`docs/PLAN.md`)
- [x] Commit the updated `package-lock.json` files
- [ ] Create the feature branch `uipath-migration`
- [ ] Confirm `npm run dev` in `backend/` works on Node 25; if `ts-node-dev@1.1.8` fails, switch the script to `tsx watch`
- [ ] Add `vitest` to `backend/` and a `test` script
- [ ] Hand-write synthetic fixtures under `backend/test/fixtures/uipath/`:
  - [ ] classic sequence
  - [ ] modern Excel + Outlook bot
  - [ ] REFramework skeleton
  - [ ] bot with an SAP activity

## M1: UiPath import (issue #1)

New folder `backend/src/importers/uipath/`.

- [ ] `xamlReader.ts`: parse XAML with **xmlbuilder2** (already a dependency)
  - Walk activity elements and descend through property elements (names containing `.`, e.g. `If.Then`, `ForEach.Body/ActivityAction`)
  - Skip non-activity elements (`Variable`, `x:Members`, `ViewState`, `TextExpression.*`, `sads:*`)
  - Output a neutral `XamlActivity {type (namespace URI + local name), displayName, attrs, children, slots}`
- [ ] `UiPathImporter.ts`: `importProject(files: Record<path, content>) → {name, description, processTree, source}`
  - [ ] Read `project.json` (name, `main`, dependencies; package names reveal apps, e.g. `UiPath.SAP.BAPI.Activities`)
  - [ ] Sequence → `{Flow:[…]}`
  - [ ] If → `Gateway_*` with Then/Else branches (concept `BinaryDecision`, label = the condition text)
  - [ ] Switch → `CaseDecision`
  - [ ] Parallel → `ParallelSplit`
  - [ ] While / DoWhile / ForEach / ForEachRow → `Loop_*` with the body as its only child
  - [ ] InvokeWorkflowFile → inline the target file as a nested subtree, with a cycle guard
  - [ ] Flowchart → best effort: follow the FlowStep chain, turn FlowDecision into `BinaryDecision`, flag cycles as `manual`
  - [ ] TryCatch → inline the Try part, record the Catch parts
  - [ ] REFramework detection (see design decisions)
- [ ] `uipathActivityMapping.ts`: table from activity type to an ontology individual, `structural`, `ignore` (LogMessage, Comment), `manual(reason)` (InvokeCode, custom packages), or a context resolver function

## M2: Mapping + readiness report (issue #2)

- [ ] `backend/src/resources/rpa-operations.json`: back-end copy of the ontology
- [ ] `backend/src/utils/ontologyIndex.ts`: load it into `id → {concept, automates, bpmoConcept}`
- [ ] `backend/src/analysis/migrationReport.ts`: `buildMigrationReport(processTree, source, target="pad")` returns, per bot:
  - totals for mapped / ontology-only (no PAD mapping) / unmapped / manual
  - **automatic-migration coverage %**
  - unmapped activity types with counts
  - applications touched (ontology `automates` plus dependencies from `project.json`)
  - manual items: catches, Invoke Code, REFramework config/queues, selector count
- [ ] `backend/src/cli/importUiPath.ts` (script `import:uipath <dir…>`): run import + report over each sample; write per-bot JSON and a **portfolio summary table** (Markdown/CSV), which is the thesis evaluation table
- [ ] **Checkpoint:** run on the samples, then decide together which ontology extensions the unmapped list justifies. Likely candidates:
  - a `control-flow-loop` class (`ForEachLoop`, `ConditionalLoop`)
  - generic desktop UI operations (click-button, fill-text-box and press-key already exist as classes without individuals)
  - SAP operations
  - an assign/set-variable transient-data operation
- [ ] Add the agreed extensions to both copies of `rpa-operations.json`

## M3: PAD skeleton exporter

- [ ] `backend/src/botLinkers/powerAutomateDesktopLinker/padMapping.ts`: ontology id → PAD Robin action template, e.g. `ExcelReadCellValue → Excel.ReadFromExcel.ReadCell Instance: %ExcelInstance% StartColumn: TODO …`. Container setup/cleanup steps map to `Excel.LaunchExcel…` / `WebAutomation.LaunchEdge…`
- [ ] `PowerAutomateDesktopLinker.ts`: implements `BotLinkerStrategyInterface`
  - Walk the tree like `RobotFrameworkLinker.ts`
  - Emit `IF <condition text> THEN/ELSE/END`, `LOOP FOREACH…/END`, and `# TODO (UiPath <activityType>): …` for unmapped or manual nodes
  - **Never throw** on unmapped nodes, unlike the existing linkers (`RobotFrameworkLinker.ts:193-222`)
- [ ] Register it as `"pad"` in `backend/src/botLinkers/BotLinkerContext.ts:16-25`

## M4: API + UI integration

Back end:
- [ ] `backend/src/models/BotModel.ts`: add an optional `source` field; make `model` optional until BPMN generation exists
- [ ] Route + controller: `POST /api/botModels/import/uipath` (body `{files}`)
- [ ] Route + controller: `GET /api/botModels/:id/migrationReport?target=pad`
- [ ] Fix the double-send in delete (`BotModelController.ts:67-70`)

Front end:
- [ ] `frontend/src/views/BotImport.vue` (route `/import`): `<input webkitdirectory>` reads the `.xaml` files and `project.json`, then posts them
- [ ] `frontend/src/views/BotMigrationReport.vue` (route `/migration/:modelId`)
- [ ] `frontend/src/api/botModelApi.ts`: add `importUiPath` and `getMigrationReport`
- [ ] `frontend/src/components/BotOverview/BotOverviewCard.vue` and `frontend/src/utils/utils.ts`: "Power Automate Desktop" export (`.txt`) and a report link
- [ ] Tolerate unknown or empty concepts so imported bots don't crash metrics and abstraction:
  - [ ] `frontend/src/utils/ontologyParser.ts:258-277` (`getOperationBranch`)
  - [ ] `frontend/src/utils/abstractionContextAnalysis.ts:23-26`
  - [ ] `frontend/src/utils/BpmnModdleParser.ts:197`
- [ ] Stretch: `backend/src/importers/bpmnGenerator.ts`, process tree → BPMN XML with simple auto-layout and `rpa:operation` attributes, so imported bots open in the modeler, metrics and abstraction views (reuses the existing metrics for issue #10 later)

## Verification

- [ ] `npm test` in `backend/` passes, with unit tests for:
  - [ ] `xamlReader` (property-element traversal)
  - [ ] `UiPathImporter` (each construct produces the expected tree; REFramework detected; Invoke inlined; cycle guard)
  - [ ] `migrationReport` (counts and coverage on the fixtures)
  - [ ] PAD linker (snapshot output; no throw on unmapped)
  - [ ] every ontology id in `uipathActivityMapping` and `padMapping` exists in `rpa-operations.json`
- [ ] `npm run import:uipath samples/*`: each real sample imports without errors, and the portfolio table looks plausible against a manual read of one bot
- [ ] End to end: start Mongo (`docker run -d -p 27017:27017 mongo`), run back end and front end with `npm run dev`, import a sample at `/import`, open its report, download the PAD export
- [ ] On a Windows machine, paste the exported skeleton into the Power Automate Desktop designer and confirm it parses. Mapped actions appear, only TODO parameters are flagged. Fix any action names in `padMapping.ts` that PAD rejects
