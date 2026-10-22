import {
  IProcessTreeNodeInfo,
  IProcessTreeStructure,
} from "../interfaces/BotModelInterface";
import { Gap, GapReport, PortfolioCoverage } from "../analysis/gapReport";
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
    ...rows.map((row) => markdownRow(PORTFOLIO_COLUMNS.map(([, value]) => value(row)))),
  ];
  return lines.join("\n");
}

export function portfolioCsv(rows: PortfolioRow[]): string {
  return [
    PORTFOLIO_COLUMNS.map(([name]) => csvValue(name)).join(","),
    ...rows.map((row) => PORTFOLIO_COLUMNS.map(([, value]) => csvValue(value(row))).join(",")),
  ].join("\n");
}

function csvValue(value: string | number): string {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function markdownRow(values: (string | number)[]): string {
  return `| ${values.map((v) => String(v).replace(/\|/g, "\\|")).join(" | ")} |`;
}

/** Coverage gain in percentage points with one decimal, e.g. "+3.2 pp". */
export function gain(share: number | null): string {
  return share === null ? "–" : `+${(share * 100).toFixed(1)} pp`;
}

/** Occurrences by context, most frequent first, e.g. "desktop 3 · none 1". */
function contexts(g: Gap): string {
  return Object.entries(g.contexts || {})
    .sort(([a, x], [b, y]) => y - x || a.localeCompare(b))
    .map(([context, count]) => `${context || "none"} ${count}`)
    .join(" · ");
}

/** The portfolio's gaps as Markdown: coverage, then unmapped activities, ontology-only operations and manual work. */
export function gapsMarkdown(report: GapReport): string {
  const coverage = (name: string, c: PortfolioCoverage) =>
    `${name} coverage: pooled ${percent(c.pooled)} · median ${percent(c.median)}`;
  const table = (heading: string, first: string, gaps: Gap[], withContext = false) => [
    "",
    `## ${heading}`,
    "",
    ...(gaps.length === 0
      ? ["None."]
      : [
          markdownRow([first, "Occurrences", "Bots", "Gain", ...(withContext ? ["Contexts"] : [])]),
          `|${Array(withContext ? 5 : 4).fill("---").join("|")}|`,
          ...gaps.map((g) =>
            markdownRow([g.name, g.occurrences, g.bots, gain(g.gain), ...(withContext ? [contexts(g)] : [])])
          ),
        ]),
  ];

  return [
    "# Mapping gaps",
    "",
    `Bots: ${report.bots} (${report.botsWithSteps} with steps) · steps: ${report.steps}`,
    "",
    `- ${coverage("Ontology", report.coverage.ontology)}`,
    ...(report.target && report.coverage.target ? [`- ${coverage(report.target, report.coverage.target)}`] : []),
    "",
    "Gain: how much the pooled coverage would rise if the gap were closed (occurrences / steps).",
    ...table("Unmapped activities", "Activity", report.unmapped, true),
    ...(report.target
      ? table(`Ontology-only operations (no ${report.target} action)`, "Operation", report.ontologyOnly)
      : []),
    ...table("Manual work", "Reason", report.manual),
  ].join("\n");
}

/** All gaps in one table, for spreadsheets: kind is unmapped, ontologyOnly or manual; gain is a share. */
export function gapsCsv(report: GapReport): string {
  const rows = [
    ...report.unmapped.map((g) => ["unmapped", g] as const),
    ...report.ontologyOnly.map((g) => ["ontologyOnly", g] as const),
    ...report.manual.map((g) => ["manual", g] as const),
  ];
  return [
    "Kind,Name,Occurrences,Bots,Gain,Contexts",
    ...rows.map(([kind, g]) =>
      [kind, g.name, g.occurrences, g.bots, g.gain === null ? "" : g.gain.toFixed(4), contexts(g)]
        .map(csvValue)
        .join(",")
    ),
  ].join("\n");
}
