import { buildMigrationReport, MigrationReport } from "../analysis/migrationReport";
import { migrationTargets } from "../analysis/migrationTargets";
import { generateBpmn } from "../bpmn/bpmnGenerator";
import { importProject, UiPathProjectInfo } from "../importers/uipath/UiPathImporter";
import IBotModel, { IProcessTree } from "../interfaces/BotModelInterface";

export class MigrationRequestError extends Error {}

/**
 * Imports an uploaded UiPath project into a bot ready to be stored, plus its migration report
 * for Power Automate Desktop.
 *
 * @param files - file contents by path, as uploaded from a project folder
 * @param name - bot name; overrides the name in project.json
 */
export function importUiPathBot(
  files: unknown,
  name?: string
): { bot: IBotModel; report: MigrationReport } {
  if (!files || typeof files !== "object" || Array.isArray(files)) {
    throw new MigrationRequestError("Expected files as an object of { path: content }.");
  }
  const entries = Object.entries(files as Record<string, unknown>);
  if (entries.some(([, content]) => typeof content !== "string")) {
    throw new MigrationRequestError("Every file content must be a string.");
  }
  if (!entries.some(([path]) => path.toLowerCase().endsWith(".xaml"))) {
    throw new MigrationRequestError("No UiPath workflow (.xaml) files found.");
  }

  const imported = importProject(files as Record<string, string>, { name });
  if (name?.trim()) {
    imported.name = name.trim();
  }
  return {
    bot: {
      name: imported.name,
      description: imported.description,
      // Stored like the modeler stores diagrams: the BPMN XML as a JSON string
      model: JSON.stringify(generateBpmn(imported.processTree)),
      processTree: JSON.stringify(imported.processTree),
      source: JSON.stringify(imported.source),
    },
    report: buildMigrationReport(imported, migrationTargets.pad),
  };
}

/**
 * Builds the migration report of a stored bot, imported or modeled.
 *
 * @param targetName - key of a migration target, e.g. "pad", or "none" for ontology coverage only
 */
export function migrationReportFor(bot: IBotModel, targetName = "pad"): MigrationReport {
  if (targetName !== "none" && !(targetName in migrationTargets)) {
    throw new MigrationRequestError(
      `Unknown target "${targetName}". Use one of: ${Object.keys(migrationTargets).join(", ")}, none.`
    );
  }
  const processTree: IProcessTree = JSON.parse(bot.processTree);
  const source: UiPathProjectInfo | undefined = bot.source ? JSON.parse(bot.source) : undefined;
  return buildMigrationReport(
    { name: bot.name, processTree, source },
    targetName === "none" ? undefined : migrationTargets[targetName]
  );
}
