# Bot corpus

The mapping rate is measured on two sets of UiPath bots, which are kept apart so that the evaluation is not circular (see the caveat in [`../ontology-extensions.md`](../ontology-extensions.md)):

| Set | Folder (git-ignored) | Role |
|---|---|---|
| Public GitHub projects | `samples/public/` | **Dev set.** Its gap census drives new mappings and ontology extensions |
| Real client bots | `samples/client/` | **Held-out eval set.** Measured before and after each round, never used as evidence for a mapping |
| UiPath Studio templates | `samples/uipath-studio-templates/` | Shaped round 1 of the ontology extensions; kept as a regression check |

**Rule:** no mapping, alias or ontology extension may cite evidence from `samples/client/`. Gaps found there are recorded as findings and wait for evidence in the dev set.

Coverage per round is in [`../coverage-history.md`](../coverage-history.md).

## Fetching the public dev set

```bash
sh scripts/fetch-public-corpus.sh
```

This reads [`public-corpus.json`](public-corpus.json) and clones each project into `samples/public/<owner>__<repo>/`, pinned to the listed commit, with only the project folder checked out. The code is not committed because most of the repos have no license (`license: null` in the manifest). The project is only read for research and is not redistributed.

## How the public dev set was selected (2026-10-21)

1. **Candidates:** GitHub code search for `project.json` files that name a common UiPath activity package (`UiPath.System.Activities`, `UiPath.UIAutomation.Activities`, `UiPath.Excel.Activities`, `UiPath.Mail.Activities`, `UiPath.Database.Activities`, `UiPath.PDF.Activities`, `UiPath.WebAPI.Activities`), 100 hits each. This gave 287 repositories.
2. **Pool:** one project per repository (the code-search hit; the first one by path if there were several). Forks, the official templates (`UiPath-Services/StudioTemplates`, `UiPath/ReFrameWork`) and generated projects (`mlbrilliance/*`) were dropped. The remaining 286 were shuffled with a fixed seed (20261021, linear congruential generator).
3. **Acceptance, in pool order, until 40 projects were accepted** (90 candidates were looked at, and 5 of them could not be cloned):
   - process projects only: `outputType` missing or `Process`, so no libraries
   - at least 3 steps after import, which drops placeholders and projects whose main workflow is missing from the repo
   - at most 2 projects per GitHub owner
   - no duplicate `Main.xaml` (by content hash)

The sample is varied:
- **Size:** 3 to 1,135 steps per bot.
- **Kinds:** 12 REFramework bots, 28 others.
- **Languages:** 32 VisualBasic, 4 C#, and 4 older projects that don't declare a language (VisualBasic by default).
- **Studio versions:** 18.3 to 26.0. 23 are Windows, 3 Windows-Legacy, 1 Portable, and 13 are older projects without a target framework.

Because a few large bots dominate the pooled numbers, coverage is reported both pooled (all steps together) and as the median over bots. The gap census also counts the bots each gap occurs in.

## Using the corpus

```bash
cd backend
npm run import:uipath -- --summary --out ../samples/output/<round>-public ../samples/public
```

`gaps.md` / `gaps.csv` in the output folder list the unmapped activities, the operations without a PAD action and the manual work, most frequent first, with the coverage each one would add. `npm test` also runs the robustness tests (import, PAD, BPMN round trip) over every bot in `samples/`.
