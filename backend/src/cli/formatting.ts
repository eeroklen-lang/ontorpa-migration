import {
  IProcessTreeNodeInfo,
  IProcessTreeStructure,
} from "../interfaces/BotModelInterface";
import { MigrationReport } from "../analysis/migrationReport";

const MARKERS: Record<string, string> = {
  mapped: "✓",
  unmapped: "✗",
  manual: "!",
  structural: "·",
};

/**
 * Renders a process tree as indented text, one node per line:
 * "✓ BrowserClickButton  "Click Save"" for mapped nodes, "✗ NNavigateBrowser  "Go back"  [browser]"
 * for unmapped ones. Flow nodes are transparent; gateway branches are numbered.
 */
export function renderProcessTree(
  tree: IProcessTreeStructure,
  nodeInfo: Record<string, IProcessTreeNodeInfo>
): string[] {
  const lines: string[] = [];

  const renderItem = (item: string | IProcessTreeStructure, depth: number) => {
    if (typeof item === "string") {
      lines.push(indent(depth) + describe(item, nodeInfo[item]));
      return;
    }
    for (const [key, children] of Object.entries(item)) {
      if (key === "Flow") {
        children.forEach((child) => renderItem(child, depth));
        continue;
      }
      if (key === "Process") {
        lines.push(indent(depth) + "Process");
        children.forEach((child) => renderItem(child, depth + 1));
        continue;
      }
      lines.push(indent(depth) + describe(key, nodeInfo[key]));
      if (key.startsWith("Gateway")) {
        children.forEach((branch, index) => {
          lines.push(indent(depth + 1) + `branch ${index + 1}`);
          renderItem(branch, depth + 2);
        });
      } else {
        children.forEach((child) => renderItem(child, depth + 1));
      }
    }
  };

  renderItem(tree, 0);
  return lines;
}

function indent(depth: number): string {
  return "  ".repeat(depth);
}

function describe(nodeId: string, info: IProcessTreeNodeInfo | undefined): string {
  if (!info) {
    return nodeId;
  }
  const status = info.mappingStatus || "mapped";
  const name = info.concept || info.source?.activityType || nodeId;
  const kind = nodeId.startsWith("Loop") ? " (loop)" : "";
  const details: string[] = [];
  if (status !== "mapped" && info.source?.context) {
    details.push(info.source.context);
  }
  if (nodeId.startsWith("Gateway") && info.source?.expression) {
    details.push(`if ${info.source.expression}`);
  }
  if (status === "manual" && info.source?.reason) {
    details.push(info.source.reason);
  }
  return (
    `${MARKERS[status] || "?"} ${name}${kind}  "${info.label}"` +
    (details.length > 0 ? `  [${details.join("; ")}]` : "")
  );
}

export function percent(share: number | null | undefined): string {
  return share === null || share === undefined ? "–" : `${Math.round(share * 100)}%`;
}

/** A short plain-text summary of one bot's report. */
export function renderReport(report: MigrationReport): string[] {
  const { bot, totals, coverage, manualWork } = report;
  const lines = [
    `Bot: ${bot.name}  (${[bot.main, bot.expressionLanguage, bot.targetFramework].filter(Boolean).join(", ")}; ` +
      `${bot.importedFiles}/${bot.workflowFiles} workflow files imported)`,
    `Steps: ${totals.steps}  mapped ${totals.mapped} · unmapped ${totals.unmapped} · manual ${totals.manual}` +
      `   Ontology coverage: ${percent(coverage.ontology)}` +
      (report.target ? `   ${report.target} coverage: ${percent(coverage.target)}` : ""),
  ];
  if (report.unmappedActivities.length > 0) {
    lines.push(
      "Unmapped: " +
        report.unmappedActivities
          .map((u) => `${u.activityType}${u.context ? "@" + u.context : ""} ×${u.count}`)
          .join(", ")
    );
  }
  if (report.applications.length > 0) {
    lines.push(
      "Applications: " +
        report.applications.map((a) => `${a.name} (${a.evidence.join(", ")})`).join(", ")
    );
  }
  lines.push(
    `Manual work: ${manualWork.items.length} items · ${manualWork.catches.length} try/catch · ` +
      `${manualWork.notes.length} notes · ${manualWork.selectors} selectors to re-capture`
  );
  if (bot.reframework) {
    lines.push(
      `REFramework: config ${manualWork.configFiles.join(", ") || "–"}; ` +
        `${manualWork.frameworkFiles.length} framework files map to the work-queue pattern`
    );
  }
  if (bot.missingFiles.length > 0) {
    lines.push(`Missing workflow files: ${bot.missingFiles.join(", ")}`);
  }
  return lines;
}

export interface PortfolioRow {
  path: string;
  report: MigrationReport;
}

const PORTFOLIO_COLUMNS: [string, (row: PortfolioRow) => string | number][] = [
  ["Bot", (r) => r.report.bot.name],
  ["Path", (r) => r.path],
  ["REFramework", (r) => (r.report.bot.reframework ? "yes" : "no")],
  ["Steps", (r) => r.report.totals.steps],
  ["Mapped", (r) => r.report.totals.mapped],
  ["Unmapped", (r) => r.report.totals.unmapped],
  ["Manual", (r) => r.report.totals.manual],
  ["Ontology coverage", (r) => percent(r.report.coverage.ontology)],
  ["PAD coverage", (r) => percent(r.report.coverage.target)],
  ["Selectors", (r) => r.report.manualWork.selectors],
  ["Try/catch", (r) => r.report.manualWork.catches.length],
  ["Applications", (r) => r.report.applications.map((a) => a.name).join("; ")],
];

export function portfolioMarkdown(rows: PortfolioRow[]): string {
  const header = PORTFOLIO_COLUMNS.map(([name]) => name);
  const lines = [
    `| ${header.join(" | ")} |`,
    `|${header.map(() => "---").join("|")}|`,
    ...rows.map(
      (row) =>
        `| ${PORTFOLIO_COLUMNS.map(([, value]) => String(value(row)).replace(/\|/g, "\\|")).join(" | ")} |`
    ),
  ];
  return lines.join("\n");
}

export function portfolioCsv(rows: PortfolioRow[]): string {
  const escape = (value: string | number) => {
    const text = String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return [
    PORTFOLIO_COLUMNS.map(([name]) => escape(name)).join(","),
    ...rows.map((row) => PORTFOLIO_COLUMNS.map(([, value]) => escape(value(row))).join(",")),
  ].join("\n");
}
