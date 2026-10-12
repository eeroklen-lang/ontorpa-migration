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

Known gaps without evidence yet: SAP operations, generic desktop UI operations (`click-button`, `fill-text-box` and `press-key` exist as classes without individuals).

Front-end follow-ups (M4): the modeler's properties panel lists only context containers for sub-processes, so a loop dragged from the sidebar cannot be changed to another operation there; loops are drawn as plain expanded sub-processes without a loop marker.
