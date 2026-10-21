import { describe, expect, it } from "vitest";
import { buildGapReport } from "../../src/analysis/gapReport";
import { buildMigrationReport } from "../../src/analysis/migrationReport";
import { migrationTargets } from "../../src/analysis/migrationTargets";
import {
  gain,
  gapsCsv,
  gapsMarkdown,
  percent,
  portfolioCsv,
  portfolioMarkdown,
  renderProcessTree,
  renderReport,
} from "../../src/cli/formatting";
import { importProject } from "../../src/importers/uipath/UiPathImporter";

const imported = importProject(
  {
    "Main.xaml": `<Activity x:Class="Main"
      xmlns="http://schemas.microsoft.com/netfx/2009/xaml/activities"
      xmlns:ui="http://schemas.uipath.com/workflow/activities"
      xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml">
      <Sequence>
        <ui:NavigateTo DisplayName="Open portal" />
        <If DisplayName="Logged in?" Condition="[loggedIn]">
          <If.Then><Assign DisplayName="Remember" /></If.Then>
          <If.Else><ui:InvokeCode DisplayName="Login script" /></If.Else>
        </If>
        <While DisplayName="Retry" Condition="[tries &lt; 3]"><Assign DisplayName="Count" /></While>
        <ui:KillProcess DisplayName="Stop app" />
      </Sequence>
    </Activity>`,
  },
  { name: "Portal, bot" }
);

describe("renderProcessTree", () => {
  it("prints one line per node with status, concept or activity type, and label", () => {
    expect(renderProcessTree(imported.processTree.tree, imported.processTree.nodeInfo)).toEqual([
      "Process",
      '  ✓ BrowserOpenURL  "Open portal"',
      '  ✓ BinaryDecision  "Logged in?"  [if loggedIn]',
      "    branch 1",
      '      ✓ SetVariable  "Remember"',
      "    branch 2",
      '      ! InvokeCode  "Login script"  [Invoke Code: custom VB/C# code]',
      '  ✓ ConditionalLoop (loop)  "Retry"',
      '    ✓ SetVariable  "Count"',
      '  ✗ KillProcess  "Stop app"',
    ]);
  });
});

describe("renderReport", () => {
  it("summarises totals, coverage and unmapped activities", () => {
    const lines = renderReport(buildMigrationReport(imported));
    expect(lines[0]).toBe("Bot: Portal, bot  (Main.xaml; 1/1 workflow files imported)");
    expect(lines[1]).toBe("Steps: 7  mapped 5 · unmapped 1 · manual 1   Ontology coverage: 71%");
    expect(lines[2]).toBe("Unmapped: KillProcess ×1");
  });
});

describe("portfolio tables", () => {
  const rows = [{ path: "bots/portal", report: buildMigrationReport(imported) }];

  it("renders Markdown with one row per bot", () => {
    const lines = portfolioMarkdown(rows).split("\n");
    expect(lines).toHaveLength(3);
    expect(lines[2]).toBe("| Portal, bot | bots/portal | no | 7 | 5 | 1 | 1 | 71% | – | 0 | 0 | Browser |");
  });

  it("quotes CSV values that contain commas", () => {
    expect(portfolioCsv(rows).split("\n")[1]).toBe('"Portal, bot",bots/portal,no,7,5,1,1,71%,–,0,0,Browser');
  });
});

describe("percent", () => {
  it("rounds shares and shows a dash for missing values", () => {
    expect(percent(0.825)).toBe("83%");
    expect(percent(null)).toBe("–");
  });
});

describe("gap tables", () => {
  const gaps = buildGapReport([buildMigrationReport(imported, migrationTargets.pad)]);

  it("renders coverage and one table per kind of gap as Markdown", () => {
    const lines = gapsMarkdown(gaps).split("\n");
    expect(lines.slice(0, 6)).toEqual([
      "# Mapping gaps",
      "",
      "Bots: 1 (1 with steps) · steps: 7",
      "",
      "- Ontology coverage: pooled 71% · median 71%",
      "- Power Automate Desktop coverage: pooled 71% · median 71%",
    ]);
    expect(lines).toContain("| KillProcess | 1 | 1 | +14.3 pp | none 1 |");
    expect(lines).toContain("| Invoke Code: custom VB/C# code | 1 | 1 | +14.3 pp |");
    expect(lines).toContain("## Ontology-only operations (no Power Automate Desktop action)");
  });

  it("writes every gap as a CSV row with its kind", () => {
    expect(gapsCsv(gaps).split("\n")).toEqual([
      "Kind,Name,Occurrences,Bots,Gain,Contexts",
      "unmapped,KillProcess,1,1,0.1429,none 1",
      "manual,Invoke Code: custom VB/C# code,1,1,0.1429,",
    ]);
  });

  it("formats gains in percentage points", () => {
    expect(gain(0.0314)).toBe("+3.1 pp");
    expect(gain(null)).toBe("–");
  });
});
