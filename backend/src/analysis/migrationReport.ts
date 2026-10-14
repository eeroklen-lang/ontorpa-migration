import {
  IProcessTree,
  IProcessTreeNodeInfo,
} from "../interfaces/BotModelInterface";
import {
  CatchInfo,
  UiPathProjectInfo,
} from "../importers/uipath/UiPathImporter";
import { ontologyIndividuals } from "../utils/ontologyIndex";

/** A target RPA tool, given by the ontology operations it can generate. */
export interface MigrationTarget {
  name: string;
  operations: Set<string>;
}

export interface ManualWorkItem {
  activityType: string;
  label: string;
  file: string;
  reason: string;
}

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
  /** Counts of process tree nodes; structural nodes (scopes without a container) are not steps. */
  totals: {
    steps: number;
    mapped: number;
    /** Mapped to the ontology, but the target has no translation for the operation. */
    ontologyOnly?: number;
    unmapped: number;
    manual: number;
    structural: number;
  };
  /** Share of steps between 0 and 1, or null for a bot without steps. */
  coverage: {
    /** Steps mapped to an ontology operation. */
    ontology: number | null;
    /** Steps the target can generate automatically. */
    target?: number | null;
  };
  target?: string;
  /** Activity types with no ontology operation, most frequent first. */
  unmappedActivities: { activityType: string; context?: string; count: number }[];
  /** Applications the bot automates, with where the evidence came from. */
  applications: { name: string; evidence: ("operation" | "scope" | "dependency")[] }[];
  manualWork: {
    items: ManualWorkItem[];
    catches: CatchInfo[];
    notes: { activityType: string; displayName?: string; file: string; reason: string }[];
    /** REFramework workflows that map to the Power Automate work-queue pattern. */
    frameworkFiles: string[];
    /** Config files with settings, asset and queue names to recreate. */
    configFiles: string[];
    /** UI activities with selectors to re-capture in the target tool. */
    selectors: number;
  };
}

const SOFTWARE_NAMES: Record<string, string> = {
  Browser: "Browser",
  MicrosoftExcel: "Microsoft Excel",
  MicrosoftOutlook: "Microsoft Outlook",
  MicrosoftWord: "Microsoft Word",
  OperatingSystem: "File system",
  GoogleMail: "Gmail",
  GoogleSheets: "Google Sheets",
};

const CONTEXT_NAMES: Record<string, string> = {
  browser: "Browser",
  excel: "Microsoft Excel",
  outlook: "Microsoft Outlook",
  mail: "Email",
  word: "Microsoft Word",
  sap: "SAP",
  desktop: "Desktop application",
};

const PACKAGE_NAMES: Record<string, string> = {
  "UiPath.Excel.Activities": "Microsoft Excel",
  "UiPath.Mail.Activities": "Email",
  "UiPath.Word.Activities": "Microsoft Word",
  "UiPath.Presentations.Activities": "Microsoft PowerPoint",
  "UiPath.MicrosoftOffice365.Activities": "Microsoft 365",
  "UiPath.GSuite.Activities": "Google Workspace",
  "UiPath.SAP.BAPI.Activities": "SAP",
  "UiPath.Database.Activities": "Database",
  "UiPath.PDF.Activities": "PDF",
  "UiPath.WebAPI.Activities": "Web API",
  "UiPath.Terminal.Activities": "Terminal",
};

/**
 * Summarises how far an imported bot can be migrated automatically: how many steps map to the
 * ontology (and to the target tool, if given), which activity types are missing, which
 * applications are involved, and what needs manual work.
 */
export function buildMigrationReport(
  imported: { name: string; processTree: IProcessTree; source?: UiPathProjectInfo },
  target?: MigrationTarget
): MigrationReport {
  // Bots modeled in OntoRPA have no source project, and their nodes no mapping status
  const source = imported.source ?? modeledBotInfo();
  const nodes = Object.values(imported.processTree.nodeInfo);
  const statusOf = (n: IProcessTreeNodeInfo) => n.mappingStatus ?? (n.concept ? "mapped" : "unmapped");
  const withStatus = (status: string) => nodes.filter((n) => statusOf(n) === status);

  const mapped = withStatus("mapped");
  const unmapped = withStatus("unmapped");
  const manual = withStatus("manual");
  const steps = mapped.length + unmapped.length + manual.length;
  const share = (count: number) => (steps === 0 ? null : count / steps);

  const report: MigrationReport = {
    bot: {
      name: imported.name,
      main: source.main,
      expressionLanguage: source.expressionLanguage,
      targetFramework: source.targetFramework,
      reframework: !!source.reframework,
      workflowFiles: source.workflowFiles.length,
      importedFiles: source.importedFiles.length,
      missingFiles: source.missingFiles,
    },
    totals: {
      steps,
      mapped: mapped.length,
      unmapped: unmapped.length,
      manual: manual.length,
      structural: withStatus("structural").length,
    },
    coverage: { ontology: share(mapped.length) },
    unmappedActivities: countUnmapped(unmapped),
    applications: applicationsOf(nodes, source),
    manualWork: {
      items: manual.map((n) => ({
        activityType: n.source?.activityType || "",
        label: n.label,
        file: n.source?.file || "",
        reason: n.source?.reason || "",
      })),
      catches: source.catches,
      notes: source.notes,
      frameworkFiles: source.reframework?.frameworkFiles || [],
      configFiles: source.reframework?.configFiles || [],
      selectors: source.selectorCount,
    },
  };

  if (target) {
    const generated = mapped.filter((n) => target.operations.has(n.concept));
    report.target = target.name;
    report.totals.ontologyOnly = mapped.length - generated.length;
    report.coverage.target = share(generated.length);
  }
  return report;
}

function modeledBotInfo(): UiPathProjectInfo {
  return {
    vendor: "UiPath",
    main: "",
    dependencies: {},
    workflowFiles: [],
    importedFiles: [],
    missingFiles: [],
    catches: [],
    notes: [],
    selectorCount: 0,
  };
}

function countUnmapped(nodes: IProcessTreeNodeInfo[]): MigrationReport["unmappedActivities"] {
  const counts = new Map<string, { activityType: string; context?: string; count: number }>();
  for (const node of nodes) {
    const activityType = node.source?.activityType || "unknown";
    const context = node.source?.context;
    const key = `${activityType}@${context || ""}`;
    const entry = counts.get(key) || { activityType, context, count: 0 };
    entry.count++;
    counts.set(key, entry);
  }
  return Array.from(counts.values())
    .map((entry) => (entry.context ? entry : { activityType: entry.activityType, count: entry.count }))
    .sort((a, b) => b.count - a.count || a.activityType.localeCompare(b.activityType));
}

function applicationsOf(
  nodes: IProcessTreeNodeInfo[],
  source: UiPathProjectInfo
): MigrationReport["applications"] {
  const evidence = new Map<string, Set<"operation" | "scope" | "dependency">>();
  const add = (name: string | undefined, kind: "operation" | "scope" | "dependency") => {
    if (!name) {
      return;
    }
    if (!evidence.has(name)) {
      evidence.set(name, new Set());
    }
    evidence.get(name)!.add(kind);
  };

  for (const node of nodes) {
    const automates = ontologyIndividuals[node.concept]?.automates;
    if (node.mappingStatus === "mapped" && automates) {
      add(SOFTWARE_NAMES[automates] || automates, "operation");
    }
    if (node.source?.context) {
      add(CONTEXT_NAMES[node.source.context], "scope");
    }
  }
  for (const dependency of Object.keys(source.dependencies)) {
    add(PACKAGE_NAMES[dependency], "dependency");
  }

  const order = ["operation", "scope", "dependency"];
  return Array.from(evidence.entries())
    .map(([name, kinds]) => ({
      name,
      evidence: Array.from(kinds).sort((a, b) => order.indexOf(a) - order.indexOf(b)),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
