# Ontology extensions

Changes to the ontology of RPA operations (`rpa-operations.json`) made for UiPath migration, with the evidence for each. Both copies of the file (`backend/src/resources/` and `frontend/src/resources/`) are kept identical. The file is the JSON-LD export of the OWL ontology; additions follow the existing style: classes with label, comment and one parent, individuals with a `bpmoConcept` and relations to software and data.

## Round 1 (2026-10-12): from the UiPath Studio templates

Basis: the unmapped activities found by `npm run import:uipath` over five official UiPath Studio templates (`samples/uipath-studio-templates/`, see the plan's M0). Decided at the M2 checkpoint: add all four groups now rather than waiting for real bots.

| Group | New class (parent) | New individuals | UiPath activities mapped to them | Evidence |
|---|---|---|---|---|
| Loops | `control-flow-loop` (control-flow-operation) | `ForEachLoop`, `ConditionalLoop` (CompoundActivity) | ForEach, ForEachRow, ParallelForEach, ExcelForEachRow, ForEachRowX, ForEachSheetX, ForEachFileX, ForEachFolderX, OutlookForEachMail, ForEachEmailX → ForEachLoop; While, DoWhile, InterruptibleWhile, InterruptibleDoWhile → ConditionalLoop | Loops in EnterExcelDataIntoWebsite and SaveOutlookAttachments; `ui:ForEach` ×28 and `While` ×15 across the templates. Already a known gap before the import |
| Assign | – (existing `transient-data-operation`) | `SetVariable` | Assign, MultipleAssign | `Assign` ×387 and `ui:MultipleAssign` ×30 across the templates (mostly in REFramework) |
| Excel ranges | `read-range` (data-extraction-operation), `write-range` (data-input-operation) | `ExcelReadRange` (yields the new `TableTransientData`), `ExcelWriteRange` | ReadRangeX, ExcelReadRange, ReadRange; WriteRangeX, ExcelWriteRange, WriteRange | `ui:ReadRange` ×14 and `ui:WriteRange` ×2 in the REFramework framework files |
| Excel sheet operations | `copy-range`, `filter-range`, `format-as-table`, `insert-sheet`, `rename-sheet` (all data-transformation-operation, which had no subclasses) | `ExcelCopyRange`, `ExcelFilterRange`, `ExcelFormatAsTable`, `ExcelInsertSheet`, `ExcelRenameSheet` | CopyPasteRangeX; FilterX, ExcelFilterTable; CreateTableX, ExcelCreateTable; InsertSheetX; RenameSheetX | 10 of the 12 steps in SplitExcelSheet |
| Mail attachments, navigation, files | `save-attachments` (data-extraction-operation), `navigate` (software-control-operation) | `OutlookSaveAttachments`, `BrowserNavigate`, `DeleteFile` (existing `delete-file`) | SaveMailAttachmentsX (in an Outlook scope); NNavigateBrowser; DeleteFileX | One occurrence each: SaveOutlookAttachments, EnterExcelDataIntoWebsite, SplitExcelSheet |

Design notes:
- **Loops are `CompoundActivity`**, like context containers: in BPMN a loop is a sub-process (with a loop marker) that contains its body. The loops are tool-neutral; that a loop runs over Excel rows or Outlook mails is kept in the imported node's `source.context`, not in the ontology.
- **`SetVariable` has no `yields`**: variables can have any type, and the ontology only has string transient data so far.
- **One `BrowserNavigate`** covers back, forward, refresh and home, as UiPath's Navigate Browser does with an option.
- **Excel sheet operations sit under the formerly empty `data-transformation-operation`**: they change the workbook's structure or contents without reading data into the bot or entering new data.

Effect on ontology coverage of the templates (Excel-to-website / Outlook attachments / Split Excel sheet / Transactional process): 82 % / 0 % / 8 % / 50 % before, 100 % / 100 % / 100 % / 75 % after. The remaining gap in TransactionalProcess is a Flowchart loop-back, which needs manual redesign.

**Caveat for the evaluation:** these extensions were derived from the same templates, so their coverage after the extension is circular and does not show that the ontology generalises. The thesis evaluation should report coverage on bots that were not used to design the extensions (e.g. the real samples), before and after each round.

Known gaps without evidence yet: SAP operations, generic desktop UI operations (`click-button`, `fill-text-box` and `press-key` exist as classes without individuals). Round 2 closed the second one.

## Round 2 (2026-10-21): from the public dev corpus

**Basis:** the gap census over the 40 public bots of the dev set, after round 1a ([`corpus/README.md`](corpus/README.md), [`coverage-history.md`](coverage-history.md)). None of the real client bots (the eval set) was used.

**Admission rule** (decided before any extension was made): an activity type earns an operation if it occurs at least 5 times in at least 3 dev bots. 35 activity types met it. Activities that occur in one or two bots stay unmapped, even with many occurrences (e.g. `ExcelLookUpRange`: 41 occurrences, 1 bot), so that a single bot does not shape the ontology.

**Mapped activity types:** the activity types that passed the rule, plus their classic or modern twins and other census activities with the same meaning. A twin shares the rule entry (e.g. `NClick` with `Click`, `ElementExists` with `UiElementExists`, `DeserializeJsonArray` with `DeserializeJson`).

| Group | New class (parent) | New individuals | UiPath activities (dev occurrences / bots) |
|---|---|---|---|
| Desktop UI | – (existing `click-button`, `fill-text-box`, `press-key`); `check-element`, `arrange-window` (software-control-operation) | `ClickElement`, `TypeIntoElement`, `PressKeys`, `CheckElement`, `MaximizeWindow` | Click in a desktop app 65/5, TypeInto in a desktop app 24/4; SendHotkey 43/8; UiElementExists 49/9, WaitUiElementAppear 13/4, NCheckState without branches 19/4; MaximizeWindow 6/5 |
| Web data | `extract-table` (data-extraction-operation) | `BrowserExtractTable` | NExtractData 5/3 (and ExtractData) |
| Data tables | `table-operation` (transient-data-operation) | `TableCreate`, `TableAddRow`, `TableAddColumn`, `TableFilter`, `TableLookup`, `TableGetRowItem`, `TableClear` | BuildDataTable 26/12, AddDataRow 32/11, AddDataColumn 42/3, FilterDataTable 68/8, LookupDataTable 13/3, GetRowItem 14/3, ClearDataTable 7/3 |
| Text, lists, JSON | – (existing `transient-data-operation`) | `StringReplace`, `ListAddItem`, `JsonParse` | Replace 19/3, AddToCollection 15/3, DeserializeJson 12/7 |
| Files and folders | `read-file`, `check-path` (data-extraction-operation); `copy-file`, `create-folder` (data-file-operation) | `ReadTextFile`, `ReadCsvFile`, `PathExists`, `CopyFile`, `CreateFolder` | ReadTextFile 11/8, ReadCsvFile 7/5, PathExists 14/6, FileExistsX 15/4, FolderExistsX 15/5, CopyFile 19/6, CreateDirectory 46/10 |
| Processes | – (existing `software-start-operation`, `software-close-operation`) | `StartProcess`, `KillProcess` | StartProcess 9/5, KillProcess 17/5 |
| Databases | `open-connection` (software-control-operation), `run-query` (data-extraction-operation) | `DatabaseConnect`, `DatabaseRunQuery` | DatabaseConnect 5/4, ExecuteQuery 38/4 |
| Web services, mail | `call-web-service` (data-operation); – (existing `send-email`) | `HttpRequest`, `SmtpSendEmail` | HttpClient 11/5, SendMail 10/5 |
| Waiting, loops, dialogs | `wait` (internal-operation), `loop-control` (control-flow-operation), `user-dialog` (rpa-operation) | `Wait`, `ExitLoop`, `ShowMessage`, `AskForInput` | Delay 34/6, Break 6/3, MessageBox 12/9, InputDialog 11/4 |

Design notes:
- **Desktop UI operations have no `automates`.** The ontology defines human-interface operations as independent of concrete software ("they simulate the input of a human user"), and the classes for clicks, typing and keys had no individuals until now. A click in Notepad, in a desktop ERP or in SAP GUI is therefore the same `ClickElement`. Which application it acts on is kept in the imported step's `source.context`, as with the loops. Browsers keep their own `Browser*` operations, because PAD automates web pages differently from desktop windows.
- **SAP reuses the desktop operations** (decided 2026-10-21). SAP GUI is a desktop application, and the dev set has no SAP evidence. This is a design choice, not a result of evidence, and the eval set's SAP bots benefit from it.
- **`user-dialog` is a new top-level kind of operation** next to automation, control-flow and internal operations. A message box neither automates software nor stays internal to the bot: it involves the person running an attended bot.
- **`ExitLoop` is control flow** (`loop-control`); PAD has `EXIT LOOP`. The modeler's metrics count it with the other control-flow operations.
- **Check App State is a decision when it has branches.** With steps in its "element appears" or "element does not appear" branch, `NCheckState` imports as a `BinaryDecision`; without them it is a `CheckElement`. Before round 2, the steps in its branches were not imported at all.

**PAD.** The exporter generates PAD actions for 19 of the 31 new operations. For the other 12, PAD has a native action, but its Robin text has not been copied from the designer yet, so they count as ontology-only for now:
- CheckElement and MaximizeWindow
- BrowserExtractTable
- the data table operations other than TableGetRowItem
- PathExists
- HttpRequest and SmtpSendEmail

`npm run pad:catalog` prints every generated action as one flow, so the names can be checked in PAD in a single paste.

**Effect on the dev set (circular, as in round 1):** 71.5 % → 87.8 % pooled ontology coverage (median 63.4 % → 85.6 %), and 71.4 % → 80.7 % PAD coverage. As with round 1, these numbers are derived from the same bots that justified the extensions. Only the eval set can show whether the ontology generalises.

Front end: the modeler's properties panel offers the loop operations for sub-processes (done in M4). Loops are still drawn as plain expanded sub-processes without a loop marker.
