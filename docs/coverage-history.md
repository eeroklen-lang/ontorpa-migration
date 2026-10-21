# Coverage history

How the UiPath → Power Automate mapping rate develops, round by round. **Ontology coverage** is the share of steps mapped to an ontology operation. **PAD coverage** is the share that the Power Automate Desktop exporter generates an action for. Steps are mapped, unmapped and manual nodes (structural scopes are not counted). The sets are described in [`corpus/README.md`](corpus/README.md); for the thesis, only the eval set's change counts as evidence.

Pooled: all steps of all bots together. Median: over bots with steps.

| Round | Date | Set | Bots | Steps | Ontology pooled | Ontology median | PAD pooled | PAD median |
|---|---|---|---|---|---|---|---|---|
| 0 | 2026-10-21 | dev (public) | 40 | 4,642 | 68.4 % | 58.6 % | 68.4 % | 58.6 % |
| 0 | | eval (client) | – | – | pending | | | |
| 1a | 2026-10-21 | dev (public) | 40 | 4,625 | 71.5 % | 63.4 % | 71.4 % | 63.4 % |
| 1a | | eval (client) | – | – | pending | | | |
| 1a | 2026-10-21 | templates | 11 | 33 | 93.9 % | 100 % | 78.8 % | 75 % |
| 2 | 2026-10-21 | dev (public) | 40 | 4,686 | 87.8 % | 85.6 % | 80.7 % | 76.7 % |
| 2 | | eval (client) | – | – | pending | | | |
| 2 | 2026-10-21 | templates | 11 | 33 | 93.9 % | 100 % | 78.8 % | 75 % |

## Round 0: baseline

Mapping tables as of M5. Before measuring, the importer was fixed to handle what the public corpus showed. These are fixes to the import, not new mappings:
- REFramework bots now import what the Initialization, Process Transaction and End Process states invoke, without the framework's own workflows. Before, only files named exactly `Process.xaml`, `InitAllApplications.xaml` and `CloseAllApplications.xaml` were imported. Bots with renamed files (`10.e Process.xaml`) or extra workflows invoked from the states (`AddQueue.xaml`) lost their business logic. Six dev bots gained steps, for example 9 → 63 and 21 → 344.

Dev set at round 0:
- 1,307 unmapped steps in 156 activity types
- 159 manual steps (mostly Throw, Orchestrator assets and credentials, Invoke Method)
- 3 ontology-only steps (ParallelSplit)

PAD coverage is practically the same as ontology coverage, so the gap is almost all unmapped activities.

## Round 1a: importer and mapping-table wins (no ontology change)

- **UI context from the activity's own selector:** a UI activity outside any UI scope now acts on the application its selector names (`<html>`/`<webctrl>` → browser, `saplogon` → SAP, other `<wnd>`/`<ctrl>` → desktop). This mapped 63 classic browser clicks with full selectors. The PAD export marks the first action that uses a browser (or Excel/Outlook instance) that nothing in the flow launched.
- **Aliases onto existing operations**, each seen in the dev census:

  | Activity | Operation | Occurrences in the dev set |
  |---|---|---|
  | `Delete` (classic file delete) | `DeleteFile` | 23 |
  | `ExcelCopyPasteRange` | `ExcelCopyRange` | 15 |
  | `NSetText` | `BrowserInputText` (in a browser) | 7 |
  | `WriteTextFile` | `CreateTextFile` (the PAD action now writes the text) | 5 |
  | `AppendRange` | `ExcelWriteRange` | 3 |
  | `CloseApplication`, `CloseWindow` | `BrowserClose` (in a browser) | 3 |

- **Scopes:**
  - `ExcelScope` (a third-party Excel scope) → `WithMicrosoftExcel`
  - `WordScope` → Word scope
  - `ExcelProcessScopeX` → structural, so it is no longer a step
- **Ignored** (no effect on the automated system): `Highlight`, 6 occurrences. Together with the scopes, this is why the step count fell by 17.

## Round 2: ontology extension from the dev set

31 new operations (in 14 new classes) for the 35 activity types that occur at least 5 times in at least 3 dev bots. The evidence and design are in [`ontology-extensions.md`](ontology-extensions.md#round-2-2026-10-21-from-the-public-dev-corpus). PAD actions were added for 19 of them; the other 12 are ontology-only until their Robin is copied from the PAD designer, which is why PAD coverage now trails ontology coverage.

- Check App State (`NCheckState`) with steps in its branches imports as a decision. Before, the steps in its branches were lost, so the step count rose by 61.
- Dev set after round 2:
  - 402 unmapped steps in 110 activity types. None meets the threshold, and most occur in one or two bots (e.g. `ExcelLookUpRange`, `ClickImage`, `RemoveDataColumn`).
  - 334 ontology-only steps (data tables, element checks, PathExists, HTTP, SMTP).
  - 170 manual steps.
- The numbers are circular, because the extensions come from the same bots. The eval set's change is the evidence that counts.
