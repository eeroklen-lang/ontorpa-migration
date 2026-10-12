import { describe, expect, it } from "vitest";
import { buildMigrationReport } from "../../src/analysis/migrationReport";
import { importProject } from "../../src/importers/uipath/UiPathImporter";

const NAMESPACES = `
  xmlns="http://schemas.microsoft.com/netfx/2009/xaml/activities"
  xmlns:ui="http://schemas.uipath.com/workflow/activities"
  xmlns:uix="http://schemas.uipath.com/workflow/activities/uix"
  xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"`;

const browserCard = (body: string) => `
  <uix:NApplicationCard DisplayName="Use Browser">
    <uix:NApplicationCard.Body><ActivityAction x:TypeArguments="x:Object"><Sequence>${body}</Sequence></ActivityAction></uix:NApplicationCard.Body>
    <uix:NApplicationCard.TargetApp><uix:TargetApp Url="https://example.com" /></uix:NApplicationCard.TargetApp>
  </uix:NApplicationCard>`;

const click = (name: string) =>
  `<uix:NClick DisplayName="${name}"><uix:NClick.Target><uix:TargetAnchorable /></uix:NClick.Target></uix:NClick>`;

function importBot(body: string, extraFiles: Record<string, string> = {}) {
  return importProject({
    "project.json": JSON.stringify({
      name: "Supplier bot",
      main: "Main.xaml",
      expressionLanguage: "VisualBasic",
      dependencies: { "UiPath.UIAutomation.Activities": "[25.10.16]", "UiPath.Excel.Activities": "[3.2.1]" },
    }),
    "Main.xaml": `<Activity x:Class="Main" ${NAMESPACES}>${body}</Activity>`,
    ...extraFiles,
  });
}

describe("buildMigrationReport", () => {
  const imported = importBot(`
    <Sequence>
      ${browserCard(`${click("Save")}${click("Close")}<uix:NNavigateBrowser DisplayName="Back" />`)}
      ${click("Desktop click")}
      <Assign DisplayName="Set total" />
      <ui:InvokeCode DisplayName="Custom code" />
      <TryCatch DisplayName="Try"><TryCatch.Try><Assign /></TryCatch.Try>
        <TryCatch.Catches><Catch x:TypeArguments="s:Exception"><ActivityAction><Assign /></ActivityAction></Catch></TryCatch.Catches>
      </TryCatch>
    </Sequence>`);
  const report = buildMigrationReport(imported);

  it("counts steps by mapping status and computes ontology coverage", () => {
    // WithBrowser container + 2 browser clicks are mapped; NNavigateBrowser, the desktop click and 2 Assigns are not
    expect(report.totals).toEqual({ steps: 8, mapped: 3, unmapped: 4, manual: 1, structural: 0 });
    expect(report.coverage).toEqual({ ontology: 3 / 8 });
    expect(report.target).toBeUndefined();
  });

  it("lists unmapped activity types with their context, most frequent first", () => {
    expect(report.unmappedActivities).toEqual([
      { activityType: "Assign", count: 2 },
      { activityType: "NClick", count: 1 },
      { activityType: "NNavigateBrowser", context: "browser", count: 1 },
    ]);
  });

  it("collects applications from operations, scopes and dependencies", () => {
    expect(report.applications).toEqual([
      { name: "Browser", evidence: ["operation", "scope"] },
      { name: "Microsoft Excel", evidence: ["dependency"] },
    ]);
  });

  it("collects manual work", () => {
    expect(report.manualWork.items).toEqual([
      { activityType: "InvokeCode", label: "Custom code", file: "Main.xaml", reason: "Invoke Code: custom VB/C# code" },
    ]);
    expect(report.manualWork.catches).toHaveLength(1);
    expect(report.manualWork.selectors).toBe(3);
    expect(report.bot).toMatchObject({ name: "Supplier bot", reframework: false, workflowFiles: 1, importedFiles: 1 });
  });

  it("computes target coverage when a target is given", () => {
    const withTarget = buildMigrationReport(imported, {
      name: "Power Automate Desktop",
      operations: new Set(["WithBrowser", "BrowserClickButton"]),
    });
    expect(withTarget.target).toBe("Power Automate Desktop");
    expect(withTarget.totals.ontologyOnly).toBe(0);
    expect(withTarget.coverage.target).toBe(3 / 8);

    const partial = buildMigrationReport(imported, { name: "PAD", operations: new Set(["WithBrowser"]) });
    expect(partial.totals.ontologyOnly).toBe(2);
    expect(partial.coverage.target).toBe(1 / 8);
  });

  it("reports no coverage for a bot without steps", () => {
    const empty = buildMigrationReport(importBot(`<Sequence><ui:LogMessage /></Sequence>`));
    expect(empty.totals.steps).toBe(0);
    expect(empty.coverage.ontology).toBeNull();
  });
});
