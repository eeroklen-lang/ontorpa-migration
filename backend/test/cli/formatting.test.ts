import { describe, expect, it } from "vitest";
import { buildMigrationReport } from "../../src/analysis/migrationReport";
import {
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
      '      ✗ Assign  "Remember"',
      "    branch 2",
      '      ! InvokeCode  "Login script"  [Invoke Code: custom VB/C# code]',
      '  ✗ While (loop)  "Retry"',
      '    ✗ Assign  "Count"',
    ]);
  });
});

describe("renderReport", () => {
  it("summarises totals, coverage and unmapped activities", () => {
    const lines = renderReport(buildMigrationReport(imported));
    expect(lines[0]).toBe("Bot: Portal, bot  (Main.xaml; 1/1 workflow files imported)");
    expect(lines[1]).toBe("Steps: 6  mapped 2 · unmapped 3 · manual 1   Ontology coverage: 33%");
    expect(lines[2]).toBe("Unmapped: Assign ×2, While ×1");
  });
});

describe("portfolio tables", () => {
  const rows = [{ path: "bots/portal", report: buildMigrationReport(imported) }];

  it("renders Markdown with one row per bot", () => {
    const lines = portfolioMarkdown(rows).split("\n");
    expect(lines).toHaveLength(3);
    expect(lines[2]).toBe("| Portal, bot | bots/portal | no | 6 | 2 | 3 | 1 | 33% | 0 | 0 | Browser |");
  });

  it("quotes CSV values that contain commas", () => {
    expect(portfolioCsv(rows).split("\n")[1]).toBe('"Portal, bot",bots/portal,no,6,2,3,1,33%,0,0,Browser');
  });
});

describe("percent", () => {
  it("rounds shares and shows a dash for missing values", () => {
    expect(percent(0.825)).toBe("83%");
    expect(percent(null)).toBe("–");
  });
});
