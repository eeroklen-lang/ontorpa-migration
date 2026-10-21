# Development plan: UiPath → Power Automate

Covers issue #1 (bot import) and issue #2 (activity mapping) in M1–M4, and the modeler as the place where a migration is finished in M5. The pipeline:

```
UiPath .xaml → ontology process tree → (a) migration readiness report
                      ↑   ↓          → (b) Power Automate Desktop (PAD) skeleton flow
          BPMN diagram, fixed in the modeler (M5)
```

Tick boxes as work lands. Paths are relative to the repo root (`backend/…`, `frontend/…`).

## Progress

| Milestone | Status |
|---|---|
| M0: Setup | In progress |
| M1: UiPath import (#1) | Done |
| M2: Mapping + readiness report (#2) | Done (target coverage follows with M3) |
| M3: PAD skeleton exporter | Done (Robin names not yet validated in PAD) |
| M4: API + UI integration | Done |
| M5: Diagrams and migration workbench | Done |
| M6: Growing the mapping rate | In progress (rounds 0 and 1a done; round 2 next) |
| Verification | In progress (real bots, UI click-through, PAD on Windows) |

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
- [x] Create the feature branch `uipath-migration`
- [x] Confirm `npm run dev` in `backend/` works on Node 25 (it does with `tsnd`, no switch to `tsx` needed)
- [x] Add `vitest` to `backend/` and a `test` script (`npm test`, `npm run test:watch`; config in `backend/vitest.config.mts`)
  - Vitest 4 needs `@types/node` ≥ 20, so the back end moved to `@types/node` 24 and TypeScript 5.9, with `skipLibCheck` for the old mongoose/xmlbuilder2 type declarations
  - Fixed what the stricter check surfaced: added the missing `backend/src/interfaces/BpmoConcepts.ts`, used the enum in `ontologyParser.ts`, and fixed the `BotLinkerContext` import casing (broke on case-sensitive file systems)
  - `npx tsc --noEmit` is clean; first tests cover `flattenContextContainersInProcessTree`
- [x] Generic sample bots: five official UiPath Studio templates in the git-ignored `samples/uipath-studio-templates/` (`REFramework` in 6 variants, `EnterExcelDataIntoWebsite`, `SaveOutlookAttachments`, `SplitExcelSheet`, `TransactionalProcess`). Their license is unspecified, so they are not committed. To fetch them again:
  ```bash
  git clone --filter=blob:none --no-checkout --depth 1 https://github.com/UiPath-Services/StudioTemplates samples/uipath-studio-templates
  MSYS_NO_PATHCONV=1 git -C samples/uipath-studio-templates sparse-checkout set --no-cone /REFramework/ /EnterExcelDataIntoWebsite/ /SaveOutlookAttachments/ /SplitExcelSheet/ /TransactionalProcess/
  git -C samples/uipath-studio-templates checkout
  ```
  `MSYS_NO_PATHCONV=1` is for Git Bash on Windows, which otherwise rewrites `/REFramework/` into a Windows path, so the checkout silently stays empty. Other shells ignore it.
- [ ] UiPath test bots under `backend/test/fixtures/uipath/` (Eero adds them; real client bots go in the git-ignored `samples/` instead):
  - [ ] classic sequence
  - [ ] modern Excel + Outlook bot
  - [ ] REFramework skeleton
  - [ ] bot with an SAP activity

## M1: UiPath import (issue #1)

New folder `backend/src/importers/uipath/`.

Findings from the templates that the importer must handle:
- `project.json` can be missing (e.g. `EnterExcelDataIntoWebsite` ships only `Main.xaml`); it carries `expressionLanguage` (VisualBasic/CSharp) and `targetFramework` (Legacy/Windows/Portable)
- VB writes expressions as attributes (`Condition="[x]"`), C# as property elements (`If.Condition/InArgument/CSharpValue`)
- Invoked file paths use backslashes (`Framework\Process.xaml`)
- Flowchart and StateMachine reuse nodes through `x:Name` + `x:Reference` (also as `{x:Reference __ReferenceID0}` in attributes such as `InitialState`)
- Modern UI scopes: `NApplicationCard` is a browser when its `TargetApp` slot has a `Url`; selectors sit in `.Target` slots (`TargetAnchorable`), not in activities
- Scope bodies are wrapped in `ActivityAction`, whose `Argument*` slots hold `DelegateInArgument`s, not activities
- Newer REFramework reads `Data\Config.json`, older ones `Data\Config.xlsx`; the template's `Process.xaml` is just a LogMessage and a placeholder Comment

- [x] `xamlReader.ts`: parse XAML with **xmlbuilder2** (already a dependency)
  - `readXaml(content) → XamlNode {namespace, name, displayName, annotation, attributes, text, children, slots}`; property elements (`If.Then`, `NClick.Target`) become `slots` of their owner, in document order
  - Drops designer namespaces (`sap`, `sap2010`, `mc`, view state), `x:Members`, `*.Variables`, `TextExpression.*`, `VisualBasic.Settings`, and a leading byte-order mark
  - `getArgument(node, property)` reads VB attribute, literal and C# property-element expressions alike; `assemblyOf(node)` gives the package of `clr-namespace` activities
  - Tests: inline snippets plus a parse check over every template `.xaml` (skipped when `samples/` is absent)
- [x] `UiPathImporter.ts`: `importProject(files: Record<path, content>, {name?}) → {name, description, processTree, source}`
  - [x] Read `project.json` (name, description, `main`, `expressionLanguage`, `targetFramework`, dependencies); works without it. Paths are made relative to the project root, so a top-level folder (as a folder upload gives) is fine
  - [x] Sequence → flattened into its parent (equivalent to `{Flow:[…]}`, smaller tree); a branch with several steps becomes `{Flow:[…]}`, an empty one `{Flow:[]}`, as in the front end's BPMN parser
  - [x] If → `Gateway_*` with Then/Else branches (concept `BinaryDecision`). Label = DisplayName (falls back to the condition); the condition goes to `source.expression`
  - [x] Switch → `CaseDecision`
  - [x] Parallel → `ParallelSplit`
  - [x] While / DoWhile / ForEach / ForEachRow / ExcelForEachRow / OutlookForEachMail / … → `Loop_*` with the body as its only child (`unmapped` until the ontology has loops)
  - [x] InvokeWorkflowFile → inline the target file (paths relative to the project root); cycle guard, missing files and expression paths become `manual` nodes
  - [x] Flowchart → best effort: branches run to the first node all of them reach; a jump back on the current path becomes a `manual` "loop back" node, a jump into another branch a `manual` "jump" node
  - [x] TryCatch → inline Try and Finally, record the Catch parts in `source.catches`
  - [x] REFramework detection (state names, or `Framework/GetTransactionData.xaml` + `SetTransactionStatus.xaml`). Imported as InitAllApplications → `Loop_*` "Process each transaction" (Process.xaml, `structural`) → CloseAllApplications; other framework files and Config files are listed in `source.reframework`
  - [x] StateMachine (non-REFramework) → one `manual` node plus the states' Entry/Exit in discovery order
  - [x] RetryScope → body inlined, retry policy recorded in `source.notes`
- [x] `uipathActivityMapping.ts`: table from activity type to an ontology individual, `ignore` (logging, comments, Comment Out), `manual(reason)` (Invoke Code/Method, Throw, Orchestrator queues and assets), or a context resolver; unknown types are `unmapped`
  - UI and API contexts are tracked separately: UI activities resolve by the innermost UI scope (browser/desktop/SAP) even inside "Use Excel File"; mail activities by the innermost API scope (Outlook/Gmail)
  - Scopes: `NApplicationCard` (browser when its TargetApp has a URL or `<html>` selector, SAP for `saplogon.exe`, else desktop), `OpenBrowser`, `BrowserScope`, `OpenApplication`, `WindowScope`, Excel, Outlook, Gmail and Word scopes. Browser and Excel scopes become `WithBrowser` / `WithMicrosoftExcel` containers; the rest are `structural` nodes with their context
  - Selector count = UI activities with a `Target` slot or `Selector` attribute
- Also: back end TypeScript target raised from ES6 to ES2020 (Node 25 runs it natively; needed for `flatMap` etc.)
- Tests: 23 importer tests (each construct on inline projects, plus REFramework, Excel-to-website and Flowchart templates)

## M2: Mapping + readiness report (issue #2)

- [x] `backend/src/resources/rpa-operations.json`: back-end copy of the ontology
- [x] `backend/src/utils/ontologyIndex.ts`: load it into `id → {concept, automates, bpmoConcept}`; `isOntologyOperation(id)` for consistency checks
- [x] `backend/src/analysis/migrationReport.ts`: `buildMigrationReport(importResult, target?)` returns, per bot:
  - totals for mapped / ontology-only (no target mapping) / unmapped / manual (structural scopes are not counted as steps)
  - **coverage**: ontology coverage now; target (PAD) coverage once M3 provides the PAD mapping as a `MigrationTarget`
  - unmapped activity types with counts and context
  - applications touched, with evidence: ontology `automates` of mapped operations, scope contexts, and `project.json` dependencies
  - manual work: manual nodes with reasons, catches, notes (retry scopes), REFramework config and framework files, selector count
- [x] `backend/src/cli/importUiPath.ts` (script `npm run import:uipath -- [--summary] [--out <dir>] <folder>…`): finds every project (folder with `project.json` or `Main.xaml`) below the given folders, prints the report and the process tree, and ends with the **portfolio summary table**; `--out` writes per-bot JSON plus `portfolio.md` / `portfolio.csv`. Usage is in the root README
  - First run over the templates (11 bots): Excel-to-website 82 % ontology coverage, TransactionalProcess 50 %, SplitExcelSheet 8 %, SaveOutlookAttachments 0 %; the REFramework variants have no steps because the template's Process.xaml is a placeholder
- [x] **Checkpoint:** run on the samples, then decide together which ontology extensions the unmapped list justifies. Decided on the templates (2026-10-12): loops, assign, Excel range and sheet operations, mail attachments / browser navigation / delete file. SAP and generic desktop UI have no evidence yet (no template uses them); revisit with the real bots
- [x] Add the agreed extensions to both copies of `rpa-operations.json`: 9 classes and 15 individuals, documented with their evidence in [`docs/ontology-extensions.md`](ontology-extensions.md); the mapping table now uses them, and loops import as `ForEachLoop` / `ConditionalLoop`
  - Template coverage after the extension: 100 % except TransactionalProcess (75 %, a Flowchart loop-back). This is circular, as the extensions came from the same templates; the evaluation needs bots not used to design them

## M3: PAD skeleton exporter

- [x] `backend/src/botLinkers/powerAutomateDesktopLinker/padMapping.ts`: ontology id → PAD Robin action template, e.g. `ExcelReadCellValue → Excel.ReadFromExcel.ReadCell Instance: ExcelInstance StartColumn: $'''A''' …`. Containers map to launch/close (`WebAutomation.LaunchEdge…` / `CloseWebBrowser`, `Excel.LaunchExcel.LaunchAndOpenUnderExistingProcess` / `CloseAndSave`); an Outlook scope to `Outlook.Launch` / `Outlook.Close`
  - Only actions with a confident Robin name are mapped. No PAD action yet (counted as "ontology-only"): `ExcelExportPDF`, `ExcelFilterRange`, `ExcelFormatAsTable`, `OutlookDeleteEmail`, `OutlookSaveAttachments`, `StringHash`, Word, G Suite, triggers; `ParallelSplit` runs its branches one after another
  - Literal URLs, paths and values are filled in; VB/C# expressions become `$'''TODO'''` with the original in a TODO comment (the importer now records `expressionLanguage` / `targetLanguage`). Simple assignments (`x = 3`, `x = "a"`, `x = True`) become `SET`
  - UI elements are `appmask['TODO']['TODO']`: selectors have to be re-captured in PAD
- [x] `PowerAutomateDesktopLinker.ts`: implements `BotLinkerStrategyInterface`; `generatePadFlow(name, processTree)` for direct use
  - Walks the tree; emits `IF Condition<n> = True THEN/ELSE/END`, `SWITCH CaseValue<n>/CASE/END`, `LOOP FOREACH CurrentItem IN Collection<n>/END`, `LOOP WHILE (Condition<n>) = (True)/END`. Placeholder variables are declared at the top, so the flow has no undefined variables; each has a TODO with the UiPath expression
  - `# TODO "<label>" (UiPath <activityType>): …` for unmapped or manual nodes, and for scopes without a PAD equivalent (desktop apps, SAP)
  - **Never throws** on unmapped or unknown nodes, unlike the existing linkers (`RobotFrameworkLinker.ts:193-222`)
- [x] Register it as `"pad"` (and `"powerautomatedesktop"`) in `backend/src/botLinkers/BotLinkerContext.ts`, so `GET /api/botModels/:id?type=pad` returns the skeleton
- [x] CLI: the report includes **PAD coverage** (`padOperationIds()` as the `MigrationTarget`), the portfolio table has a PAD coverage column, `--pad` prints the skeleton, `--out` also writes `<bot>.pad.txt`
  - Templates: Excel-to-website 100 % ontology / 100 % PAD, Outlook attachments 100 % / 50 %, Split Excel sheet 100 % / 67 %, TransactionalProcess 75 % / 75 %

## M4: API + UI integration

Back end:
- [x] `backend/src/models/BotModel.ts`: optional `source` field (JSON string of the import's project info); `model` optional until BPMN generation exists
- [x] Route + controller: `POST /api/botModels/import/uipath` (body `{files, name?}`; an explicit name overrides project.json) → `{botModel, report}`; 400 for uploads without workflows
- [x] Route + controller: `GET /api/botModels/:id/migrationReport?target=pad|none`; works for modeled bots too (nodes without `mappingStatus` count as mapped when they have a concept)
  - Logic in `backend/src/services/migrationService.ts` (tested without Mongo); targets in `backend/src/analysis/migrationTargets.ts`
  - JSON body limit raised to 50 MB for project uploads (`server.ts`)
- [x] Fix the double-send in delete (`BotModelController.ts`)
- Verified end to end against the dev server and local Mongo: import, report, `?type=pad` export, 400s, delete (test bots removed afterwards)

Front end:
- [x] `frontend/src/views/BotImport.vue` (route `/import`): `<input webkitdirectory>` reads `.xaml` and `.json` files (others by name only, metadata folders skipped), optional bot name, then posts them and opens the report
- [x] `frontend/src/views/BotMigrationReport.vue` (route `/migration/:modelId`): coverage tiles (ontology, PAD), process tree with status marks, unmapped activities, applications with evidence, manual work, source project, PAD download
- [x] `frontend/src/api/botModelApi.ts`: `importUiPath` and `getMigrationReport`; report type in `frontend/src/interfaces/MigrationReport.ts`
- [x] `frontend/src/components/BotOverview/BotOverviewCard.vue` and `frontend/src/utils/utils.ts`: "Power Automate Desktop" export (`.txt`), a report link on every bot; imported bots open the report instead of the modeler and hide the abstraction link (abstraction is only applied to the diagram; since M5 this applies only to bots imported before M5, which have no diagram). Overview has an "Import UiPath" tile
- [x] Tolerate imported bots in the existing views:
  - [x] `parseBotModel` accepts bots without a diagram and fills in the missing `dataResourceInfo` / `transientDataInfo`
  - [x] `getOperationBranch` (`ontologyParser.ts`) returns a short branch for unmapped steps and context containers instead of throwing
  - [x] `abstractionContextAnalysis.ts` accepts unknown concepts and a first step without software context
  - [x] `BpmnModdleParser.ts` threw on elements without an operation; fixed in M5
  - Checked: the front end's metrics calculator and abstractor run on imported templates; the metrics page shows the metrics of an imported bot (no diagram)
- [x] Loops in the modeler: the properties panel offers the loop operations (and any other `CompoundActivity` operation) for sub-processes, next to the context containers. A loop marker is not drawn yet for loops modeled by hand; generated diagrams have one (M5)
- Checked with headless Chrome screenshots against the running dev servers: overview, import page, report page (all-mapped bot and a bot with unmapped and manual steps), metrics page
- `npm run build` in `frontend/` still fails on the 89 type errors that were there before; the changes add none (88 now)
- [x] Stretch: process tree → BPMN XML with auto-layout and `rpa:operation` attributes, so imported bots open in the modeler and abstraction views; done in M5 (`backend/src/bpmn/`)

## M5: Diagrams and migration workbench

Imported bots get a BPMN diagram, and the modeler becomes the place where a migration is finished: unmapped, manual and PAD-less steps are resolved in the diagram before export, and the report keeps what the importer did on its own apart from what a person fixed (the thesis's measure of how much the ontology covers automatically).

Decisions (2026-10-20): imported bots are editable, and saving keeps their UiPath info; scopes, containers and loops are drawn expanded inline (OntoRPA's context-container notation); each step remembers its import result. Left for later: ontology gap proposals, a portfolio page (#11), Try/Catch modeling (#6), variables and config as data objects (#7), a live PAD preview of the whole flow, a re-layout button.

Back end:
- [x] `backend/src/bpmn/bpmnLayout.ts` + `bpmnGenerator.ts`: `generateBpmn(processTree)` → BPMN XML (xmlbuilder2)
  - Element ids are the process tree ids, steps carry `rpa:operation`, the process is `Process_1`: the abstraction view finds elements by tree id, and the linkers' id conventions (`Gateway`, `Loop`) survive a save
  - Gateways get a join `<id>_join` and `gatewayDirection` (Diverging / Converging), so the parser tells a split from its join; a gateway without branches gets one empty branch
  - Sub-processes are expanded, with their own start and end events; `ForEachLoop` gets a sequential multi-instance marker, `ConditionalLoop` and imported `Loop_*` a standard loop marker
  - Layout: measured, then placed, left to right; the first branch stays on the main line, the others stack below with orthogonal flows; gateway labels above, with room reserved
- [x] The import stores the diagram (`model`, as the modeler does: the XML as a JSON string) and the report at import (`importReport`); each node keeps the importer's result as `imported: {concept, mappingStatus}`
- [x] The report of a stored imported bot has a `review`: coverage at import, resolved steps (mapped, corrected, unmapped), removed and added steps (`buildReview` in `migrationReport.ts`)
- [x] `GET /api/migrationTargets` (operations each target generates) and `POST /api/migrationTargets/pad/preview` (PAD lines of one step, from the linker's `padStepLines`)
- [x] CLI: `--out` also writes `<bot>.bpmn`, which opens in bpmn.io or Camunda Modeler
- Backend dev server note: ts-node-dev does not watch type-only files (`BotModelInterface.ts`), so after changing one, restart `npm run dev`

Front end:
- [x] `BpmnModdleParser.ts`: nested splits of the same type (an If in an If) no longer end a branch; sub-processes without an operation keep their id; steps without an operation are kept with concept `""`; errors are `ProcessStructureError`s naming the element; `findStructureProblems` lists steps not reached from the start event and steps with several outgoing flows
- [x] Saving an imported bot keeps its UiPath info (`mergeProcessTree` in `frontend/src/utils/migrationStatus.ts`): with an operation a step is mapped, without one it falls back to manual or structural if it was imported so, otherwise unmapped
- [x] Fixed: `stringifyBotModel` left `source` as an object (saving an imported bot failed) and changed the bot in place
- [x] Status colours in the diagram (canvas markers, never saved): red unmapped, amber manual, blue mapped but no PAD action
- [x] `MigrationChecklist.vue`: live step count and coverage (counted like the report), open steps and diagram problems; clicking one selects the element
- [x] Properties panel: the step's UiPath source and import status, its PAD lines, and the operation list with the step's application first and PAD actions marked
- [x] Overview opens bots with a diagram in the modeler; the report links to the modeler and shows coverage at import and the resolved steps
- [x] Fixed: the metrics page broke on ratios over nothing (NaN), e.g. data resource access in a bot without data resources
- [x] Overview cards have a delete button (asks for confirmation, then removes the card)
- Bots imported before M5 have no diagram: re-import them

Checked with headless Chrome (DevTools protocol) against the dev servers, on imported templates: diagrams and colours in the modeler (TransactionalProcess, SaveOutlookAttachments, EnterExcelDataIntoWebsite); checklist numbers equal the report; correcting an operation (PAD 50 % → 100 %) and removing the manual Flowchart loop-back step, then saving, gives the expected review and PAD export; a loose task is listed; the inspector shows source and PAD lines; abstraction and metrics pages show the diagram, and abstraction aggregates the generated steps

## M6: Growing the mapping rate

The goal is to raise ontology and PAD coverage on bots that did not shape the mappings, so that the thesis can defend the numbers.
- **Dev set:** public GitHub UiPath projects. Its gap census drives the mappings.
- **Eval set:** the real client bots, held out. They are measured each round but never cited as evidence.

Ontology operations and PAD actions grow in lockstep. Orchestrator queues, assets and credentials stay manual (#7, #8). Sets and selection are described in [`corpus/README.md`](corpus/README.md); the numbers are in [`coverage-history.md`](coverage-history.md).

Decisions (2026-10-21):
- Round 2 extends the ontology for activities seen at least 5 times in at least 3 dev bots.
- SAP UI activities reuse the desktop UI operations; `sap` stays in the source context.
- Each round is its own commit, so the eval set can be measured before and after it.

- [x] Round 0: corpus and measurement
  - [x] 40 public projects selected by fixed rules, pinned in `docs/corpus/public-corpus.json`, fetched by `scripts/fetch-public-corpus.sh` into `samples/public/`
  - [x] Gap census: `buildGapReport` (`backend/src/analysis/gapReport.ts`); the CLI prints it and writes `gaps.md` / `gaps.csv`. Reports list `ontologyOnlyOperations`
  - [x] Robustness over every bot in `samples/` (`backend/test/samples.ts`). This found and fixed the REFramework import, which lost business workflows that were renamed or invoked from extra states
  - [x] Baseline: 68.4 % pooled on the dev set
- [x] Round 1a: importer and mapping-table wins, without ontology changes. UI context from the activity's own selector, aliases onto existing operations, more scopes, `Highlight` ignored. 71.5 % pooled on the dev set. The PAD export flags actions on an application instance (`%Browser%`, …) that nothing launches
- [ ] Round 2: ontology extensions and PAD actions for the 35 activity types over the threshold (DataTable, files and folders, desktop UI, wait and element exists, processes, dialogs, HTTP/JSON, SMTP, Break), documented in [`ontology-extensions.md`](ontology-extensions.md)
- [ ] `npm run pad:catalog`: one Robin flow with every PAD template, to paste into PAD
- [ ] Eval set: copy the client bots into `samples/client/` and measure rounds 0, 1a and 2

## Verification

- [x] `npm test` in `backend/` passes (252 tests), with unit tests for:
  - [x] `xamlReader` (property-element traversal)
  - [x] `UiPathImporter` (each construct produces the expected tree; REFramework detected; Invoke inlined; cycle guard)
  - [x] `migrationReport` (counts and coverage on inline test bots; the fixture bots are still to come, see M0)
  - [x] PAD linker (exact output per construct; no throw on unmapped or unknown nodes; balanced IF/LOOP/SWITCH blocks on every template)
  - [x] every ontology id in `uipathActivityMapping` and `padMapping` exists in `rpa-operations.json`
  - [x] BPMN generator (types, operations, loop markers; every element drawn, no overlaps, flows between their nodes; every template)
  - [x] contract tests against the front end's code (`backend/test/contract/`): generated diagrams read back by `BpmnModdleParser` give the same tree (every template); parser structure errors; `mergeProcessTree`; `countSteps` equals the report; checklist classification
  - [x] review in the report, target endpoints, `padStepLines` matching the linker
- [ ] `npm run import:uipath samples/*`: each real sample imports without errors, and the portfolio table looks plausible against a manual read of one bot
  - Done for the 11 template bots (`samples/uipath-studio-templates/`); still needs the real client bots
- [ ] End to end: start Mongo (`docker compose up -d`), run back end and front end with `npm run dev`, import a sample at `/import`, open its report, download the PAD export
  - Partly done: import through the API, then the overview, import, report and metrics pages checked with headless Chrome; since M5 also the modeler workflow (edit, save, review in the report, PAD export after the fix) and deleting from the overview. Still to do by hand: choose a folder on the import page and click the PAD download
- [ ] On a Windows machine, paste the exported skeleton into the Power Automate Desktop designer and confirm it parses. Mapped actions appear, only TODO parameters are flagged. Fix any action names in `padMapping.ts` that PAD rejects
