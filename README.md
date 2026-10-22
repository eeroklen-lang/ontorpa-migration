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
docker compose up -d                        # MongoDB on 127.0.0.1:27017

cd backend  && npm install && npm run dev   # API on http://localhost:3001
cd frontend && npm install && npm run dev   # modeler, URL printed by Vite
```

The back end only starts serving the API once it has connected to MongoDB. The API, the modeler and the database only listen on this machine, as the app has no login. To open the app from another computer on purpose, start the back end with `HOST=0.0.0.0` and the front end with `npm run dev -- --host`. The database keeps its data in the `mongo-data` volume, so `docker compose down` keeps stored bots; `docker compose down -v` deletes them. MongoDB is only reachable from this machine.

## Importing UiPath bots

The back end can import UiPath projects from the command line and report how much of each bot maps to the ontology:

```bash
cd backend
npm run import:uipath -- ../samples/MyBot                 # tree + report for one bot
npm run import:uipath -- --summary ../samples             # portfolio table for every bot found
npm run import:uipath -- --pad ../samples/MyBot           # also print a Power Automate Desktop skeleton
npm run import:uipath -- --out ../samples/output ../samples  # also write JSON reports, PAD skeletons, BPMN diagrams, portfolio.md and portfolio.csv
```

The Power Automate Desktop skeleton is Robin text that can be pasted into an empty subflow in the PAD designer. Steps without a PAD action, UI elements and VB/C# expressions are marked `TODO`. A stored bot can also be exported with `GET /api/botModels/<id>?type=pad`.

A bot is any folder with a `project.json` or `Main.xaml`; folders are searched recursively. In the tree, `✓` marks steps mapped to an ontology operation, `✗` unmapped ones, `!` steps that need manual redesign and `·` structural scopes.

The `.bpmn` diagrams open in any BPMN tool, such as [bpmn.io](https://demo.bpmn.io) or Camunda Modeler.

## Finishing a migration in the modeler

Bots imported on the **Import UiPath** page get a BPMN diagram and open in the modeler. There, the diagram marks what keeps a bot from exporting cleanly to Power Automate Desktop: red steps have no ontology operation, amber steps need manual redesign, and blue steps have an operation that PAD has no action for yet. The migration checklist beside the diagram lists these steps with the live ontology and PAD coverage; clicking one selects it. For a selected step, the properties panel shows where it came from in UiPath and the PAD lines it exports as, and lists the operations for its application first.

Fix a step by choosing an operation for it, or redesign that part of the diagram, then save. Saving keeps each step's UiPath information, and the migration report shows the coverage at import next to the steps resolved since.

## Credits

Built on OntoRPA by Maximilian Völker ([bptlab](https://github.com/bptlab), Hasso Plattner Institute):

- Back end: <https://github.com/bptlab/conceptual-bot-backend>
- Front end: <https://github.com/bptlab/onto-rpa-frontend>

Both were imported with their full git history and are MIT-licensed. Their original licenses are kept in `backend/LICENSE.md` and `frontend/LICENSE.md`.
