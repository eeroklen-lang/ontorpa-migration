import { MappingStatus } from "./BotModel";

/** Migration readiness report of a bot, as returned by the back end (see its analysis/migrationReport.ts). */
export interface MigrationReport {
  bot: {
    name: string;
    main: string;
    expressionLanguage?: string;
    targetFramework?: string;
    reframework: boolean;
    workflowFiles: number;
    importedFiles: number;
    missingFiles: string[];
  };
  totals: {
    steps: number;
    mapped: number;
    ontologyOnly?: number;
    unmapped: number;
    manual: number;
    structural: number;
  };
  coverage: {
    ontology: number | null;
    target?: number | null;
  };
  target?: string;
  unmappedActivities: { activityType: string; context?: string; count: number }[];
  ontologyOnlyOperations?: { operation: string; count: number }[];
  applications: { name: string; evidence: string[] }[];
  manualWork: {
    items: { activityType: string; label: string; file: string; reason: string }[];
    catches: { file: string; tryCatch: string; exceptionTypes: string[] }[];
    notes: { activityType: string; displayName?: string; file: string; reason: string }[];
    frameworkFiles: string[];
    configFiles: string[];
    selectors: number;
  };
  /** For stored imported bots: how the bot changed since the import. */
  review?: MigrationReview;
}

export interface MigrationReview {
  atImport: Pick<MigrationReport, "totals" | "coverage">;
  resolved: ResolvedStep[];
  removedSteps: number;
  addedSteps: number;
}

export interface ResolvedStep {
  id: string;
  label: string;
  activityType?: string;
  /** mapped: got an operation; corrected: got another operation; unmapped: lost its operation */
  kind: "mapped" | "corrected" | "unmapped";
  from: { concept: string; status: MappingStatus };
  to: { concept: string; status: MappingStatus };
}
