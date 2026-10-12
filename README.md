# OntoRPA Migration

A thesis project that extends the [OntoRPA platform](https://github.com/bptlab/onto-rpa-platform) into a tool for migrating and maintaining RPA bot portfolios, starting with **UiPath → Power Automate**.

The idea is to use the ontology of RPA operations as a vendor-neutral intermediate layer:

```
UiPath .xaml  →  ontology-based process tree  →  migration readiness report
                                               →  Power Automate Desktop skeleton flow
```

The development plan and its progress are tracked in [`docs/PLAN.md`](docs/PLAN.md).

## Layout

| Folder | Contents |
|---|---|
| `backend/` | Express + MongoDB back end: bot storage and translation to target RPA tools |
| `frontend/` | Vue 3 + bpmn-js modeler: modeling, analysis, abstraction and complexity metrics |
| `samples/` | Real UiPath projects for evaluation. Git-ignored; never committed. |

## Running locally

Requirements: Node.js and Docker (for MongoDB).

```bash
docker run -d --name ontorpa-mongo -p 27017:27017 mongo

cd backend  && npm install && npm run dev   # API on http://localhost:3001
cd frontend && npm install && npm run dev   # modeler, URL printed by Vite
```

## Importing UiPath bots

The back end can import UiPath projects from the command line and report how much of each bot maps to the ontology:

```bash
cd backend
npm run import:uipath -- ../samples/MyBot                 # tree + report for one bot
npm run import:uipath -- --summary ../samples             # portfolio table for every bot found
npm run import:uipath -- --out ../samples/output ../samples  # also write JSON reports, portfolio.md and portfolio.csv
```

A bot is any folder with a `project.json` or `Main.xaml`; folders are searched recursively. In the tree, `✓` marks steps mapped to an ontology operation, `✗` unmapped ones, `!` steps that need manual redesign and `·` structural scopes.

## Credits

Built on OntoRPA by Maximilian Völker ([bptlab](https://github.com/bptlab), Hasso Plattner Institute):

- Back end: <https://github.com/bptlab/conceptual-bot-backend>
- Front end: <https://github.com/bptlab/onto-rpa-frontend>

Both were imported with their full git history and are MIT-licensed. Their original licenses are kept in `backend/LICENSE.md` and `frontend/LICENSE.md`.
