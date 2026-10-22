import { describe, expect, it } from "vitest";
import { buildMigrationReport, buildReview } from "../../src/analysis/migrationReport";
import { IProcessTreeNodeInfo } from "../../src/interfaces/BotModelInterface";
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
    // Only the click outside any UI scope is unmapped; Invoke Code is manual
    expect(report.totals).toEqual({ steps: 8, mapped: 6, unmapped: 1, manual: 1, structural: 0 });
    expect(report.coverage).toEqual({ ontology: 6 / 8 });
    expect(report.target).toBeUndefined();
  });

  it("lists unmapped activity types with their context, most frequent first", () => {
    const withUnmapped = buildMigrationReport(
      importBot(`<Sequence>${click("A")}<ui:Beep />${click("B")}${browserCard("<ui:Beep />")}</Sequence>`)
    );
    expect(withUnmapped.unmappedActivities).toEqual([
      { activityType: "NClick", count: 2 },
      { activityType: "Beep", count: 1 },
      { activityType: "Beep", context: "browser", count: 1 },
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
    // BrowserNavigate and the two SetVariable steps are mapped to the ontology but not to this target
    expect(withTarget.totals.ontologyOnly).toBe(3);
    expect(withTarget.coverage.target).toBe(3 / 8);
    expect(withTarget.ontologyOnlyOperations).toEqual([
      { operation: "SetVariable", count: 2 },
      { operation: "BrowserNavigate", count: 1 },
    ]);
    expect(report.ontologyOnlyOperations).toBeUndefined();

    const partial = buildMigrationReport(imported, { name: "PAD", operations: new Set(["WithBrowser"]) });
    expect(partial.totals.ontologyOnly).toBe(5);
    expect(partial.coverage.target).toBe(1 / 8);
  });

  it("reports no coverage for a bot without steps", () => {
    const empty = buildMigrationReport(importBot(`<Sequence><ui:LogMessage /></Sequence>`));
    expect(empty.totals.steps).toBe(0);
    expect(empty.coverage.ontology).toBeNull();
  });
});

describe("buildReview", () => {
  const imported = importBot(`
    <Sequence>
      ${browserCard(`${click("Save")}<uix:NNavigateBrowser DisplayName="Back" />`)}
      ${click("Desktop click")}
      <Assign DisplayName="Set total" />
      <ui:InvokeCode DisplayName="Custom code" />
    </Sequence>`);
  const atImport = buildMigrationReport(imported);
  const idOf = (label: string) =>
    Object.keys(imported.processTree.nodeInfo).find((id) => imported.processTree.nodeInfo[id].label === label)!;

  /** The tree after edits in the modeler: statuses as the modeler's save sets them. */
  function edited() {
    const nodeInfo: Record<string, IProcessTreeNodeInfo> = JSON.parse(JSON.stringify(imported.processTree.nodeInfo));
    Object.assign(nodeInfo[idOf("Desktop click")], { concept: "BrowserClickButton", mappingStatus: "mapped" });
    Object.assign(nodeInfo[idOf("Set total")], { concept: "StringTrim" });
    Object.assign(nodeInfo[idOf("Back")], { concept: "", mappingStatus: "unmapped" });
    delete nodeInfo[idOf("Custom code")];
    nodeInfo.Activity_0new = { label: "Delete export", concept: "DeleteFile" };
    return { tree: imported.processTree.tree, nodeInfo };
  }

  it("is empty for a bot as imported", () => {
    expect(buildReview(atImport, imported.processTree)).toEqual({
      atImport: { totals: atImport.totals, coverage: atImport.coverage },
      resolved: [],
      removedSteps: 0,
      addedSteps: 0,
    });
  });

  it("lists fixed steps, and counts removed and added steps", () => {
    const review = buildReview(atImport, edited());
    expect(review.resolved.map((step) => [step.label, step.kind, step.from.concept, step.to.concept])).toEqual([
      ["Back", "unmapped", "BrowserNavigate", ""],
      ["Desktop click", "mapped", "", "BrowserClickButton"],
      ["Set total", "corrected", "SetVariable", "StringTrim"],
    ]);
    expect(review.resolved[1]).toMatchObject({
      activityType: "NClick",
      from: { status: "unmapped" },
      to: { status: "mapped" },
    });
    expect(review.removedSteps).toBe(1);
    expect(review.addedSteps).toBe(1);
  });
});
