# Coverage history

How the UiPath → Power Automate mapping rate develops, round by round. **Ontology coverage** is the share of steps mapped to an ontology operation. **PAD coverage** is the share that the Power Automate Desktop exporter generates an action for. Steps are mapped, unmapped and manual nodes (structural scopes are not counted). The sets are described in [`corpus/README.md`](corpus/README.md); for the thesis, only the eval set's change counts as evidence.

Pooled: all steps of all bots together. Median: over bots with steps.

| Round | Date | Set | Bots | Steps | Ontology pooled | Ontology median | PAD pooled | PAD median |
|---|---|---|---|---|---|---|---|---|
| 0 | 2026-10-21 | dev (public) | 40 | 4,642 | 68.4 % | 58.6 % | 68.4 % | 58.6 % |
| 0 | | eval (client) | – | – | pending | | | |

## Round 0: baseline

Mapping tables as of M5. Before measuring, the importer was fixed to handle what the public corpus showed. These are fixes to the import, not new mappings:
- REFramework bots now import what the Initialization, Process Transaction and End Process states invoke, without the framework's own workflows. Before, only files named exactly `Process.xaml`, `InitAllApplications.xaml` and `CloseAllApplications.xaml` were imported. Bots with renamed files (`10.e Process.xaml`) or extra workflows invoked from the states (`AddQueue.xaml`) lost their business logic. Six dev bots gained steps, for example 9 → 63 and 21 → 344.

Dev set at round 0:
- 1,307 unmapped steps in 156 activity types
- 159 manual steps (mostly Throw, Orchestrator assets and credentials, Invoke Method)
- 3 ontology-only steps (ParallelSplit)

PAD coverage is practically the same as ontology coverage, so the gap is almost all unmapped activities.
