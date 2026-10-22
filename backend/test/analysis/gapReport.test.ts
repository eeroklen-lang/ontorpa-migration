import { describe, expect, it } from "vitest";
import { buildGapReport } from "../../src/analysis/gapReport";
import { buildMigrationReport, MigrationTarget } from "../../src/analysis/migrationReport";
import { importProject } from "../../src/importers/uipath/UiPathImporter";

const NAMESPACES = `
  xmlns="http://schemas.microsoft.com/netfx/2009/xaml/activities"
  xmlns:ui="http://schemas.uipath.com/workflow/activities"
  xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"`;

const target: MigrationTarget = { name: "PAD", operations: new Set(["BrowserOpenURL"]) };

function report(body: string) {
  return buildMigrationReport(
    importProject({ "Main.xaml": `<Activity x:Class="Main" ${NAMESPACES}><Sequence>${body}</Sequence></Activity>` }),
    target
  );
}

describe("buildGapReport", () => {
  // 4 steps: 2 mapped (1 with a PAD action), 1 unmapped, 1 manual
  const first = report(`<ui:NavigateTo /><Assign /><ui:Beep /><ui:InvokeCode />`);
  // 2 steps: 1 unmapped, 1 manual
  const second = report(`<ui:Beep /><ui:InvokeCode />`);
  // No steps
  const empty = report(`<ui:LogMessage />`);
  const gaps = buildGapReport([first, second, empty]);

  it("counts bots and pooled steps", () => {
    expect(gaps).toMatchObject({ bots: 3, botsWithSteps: 2, steps: 6, target: "PAD" });
  });

  it("pools coverage over all steps and takes the median over bots with steps", () => {
    expect(gaps.coverage.ontology).toEqual({ pooled: 2 / 6, median: (0 + 2 / 4) / 2 });
    expect(gaps.coverage.target).toEqual({ pooled: 1 / 6, median: (0 + 1 / 4) / 2 });
  });

  it("lists unmapped activities with occurrences, bots and projected gain", () => {
    expect(gaps.unmapped).toEqual([
      { name: "Beep", occurrences: 2, contexts: { "": 2 }, bots: 2, gain: 2 / 6 },
    ]);
  });

  it("lists ontology-only operations and manual reasons", () => {
    expect(gaps.ontologyOnly).toEqual([{ name: "SetVariable", occurrences: 1, bots: 1, gain: 1 / 6 }]);
    expect(gaps.manual).toEqual([
      { name: "Invoke Code: custom VB/C# code", occurrences: 2, bots: 2, gain: 2 / 6 },
    ]);
  });

  it("groups an activity's contexts and sorts by occurrences, then bots", () => {
    const withContexts = buildGapReport([
      {
        ...first,
        unmappedActivities: [
          { activityType: "NClick", context: "sap", count: 3 },
          { activityType: "Delay", count: 4 },
          { activityType: "NClick", context: "desktop", count: 1 },
        ],
      },
      {
        ...second,
        unmappedActivities: [
          { activityType: "NClick", context: "desktop", count: 2 },
          { activityType: "Delay", count: 2 },
        ],
      },
    ]);
    expect(withContexts.unmapped.map((g) => [g.name, g.occurrences, g.bots, g.contexts])).toEqual([
      ["Delay", 6, 2, { "": 6 }],
      ["NClick", 6, 2, { sap: 3, desktop: 3 }],
    ]);
  });

  it("has no coverage or gain for a portfolio without steps", () => {
    const none = buildGapReport([empty]);
    expect(none.coverage.ontology).toEqual({ pooled: null, median: null });
    const nothing = buildGapReport([]);
    expect(nothing).toMatchObject({ bots: 0, steps: 0, unmapped: [] });
    expect(nothing.target).toBeUndefined();
  });
});
