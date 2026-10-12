import { padOperationIds } from "../botLinkers/powerAutomateDesktopLinker/padMapping";
import { MigrationTarget } from "./migrationReport";

/** Target tools a migration report can measure coverage for, by the name used in the API. */
export const migrationTargets: Record<string, MigrationTarget> = {
  pad: { name: "Power Automate Desktop", operations: padOperationIds() },
};
