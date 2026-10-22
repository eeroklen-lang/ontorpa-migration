import { describe, expect, it } from "vitest";
import {
  importUiPathBot,
  MigrationRequestError,
  migrationReportFor,
  migrationTargetOperations,
  previewPadStep,
} from "../../src/services/migrationService";

const MAIN = `<Activity x:Class="Main"
  xmlns="http://schemas.microsoft.com/netfx/2009/xaml/activities"
  xmlns:ui="http://schemas.uipath.com/workflow/activities"
  xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml">
  <Sequence>
    <ui:NavigateTo DisplayName="Open portal" />
    <ui:Beep DisplayName="Beep" />
  </Sequence>
</Activity>`;

describe("importUiPathBot", () => {
  it("returns a storable bot with JSON-encoded diagram, process tree and source, plus a PAD report", () => {
    const { bot, report } = importUiPathBot({ "Portal/Main.xaml": MAIN }, "Portal");
    expect(bot.name).toBe("Portal");
    expect(JSON.parse(bot.model!)).toContain('<bpmn2:process id="Process_1"');
    expect(Object.keys(JSON.parse(bot.processTree).nodeInfo)).toHaveLength(2);
    expect(JSON.parse(bot.source!).main).toBe("Main.xaml");
    expect(report.target).toBe("Power Automate Desktop");
    expect(report.totals).toMatchObject({ steps: 2, mapped: 1, unmapped: 1 });
    expect(JSON.parse(bot.importReport!)).toEqual(report);
  });

  it("prefers an explicit name over the one in project.json", () => {
    const files = { "project.json": JSON.stringify({ name: "From project" }), "Main.xaml": MAIN };
    expect(importUiPathBot(files, "Chosen").bot.name).toBe("Chosen");
    expect(importUiPathBot(files, " ").bot.name).toBe("From project");
  });

  it.each([
    [undefined, "Expected files"],
    [["Main.xaml"], "Expected files"],
    [{ "Main.xaml": 42 }, "must be a string"],
    [{ "project.json": "{}" }, "No UiPath workflow"],
  ])("rejects %j", (files, message) => {
    expect(() => importUiPathBot(files)).toThrow(MigrationRequestError);
    expect(() => importUiPathBot(files)).toThrow(message);
  });
});

describe("migrationReportFor", () => {
  const { bot } = importUiPathBot({ "Main.xaml": MAIN }, "Portal");

  it("rebuilds the report of a stored imported bot", () => {
    const report = migrationReportFor(bot);
    expect(report.bot.name).toBe("Portal");
    expect(report.coverage).toEqual({ ontology: 0.5, target: 0.5 });
  });

  it("compares a stored bot with its import", () => {
    const processTree = JSON.parse(bot.processTree);
    const unmapped = Object.keys(processTree.nodeInfo).find((id) => !processTree.nodeInfo[id].concept)!;
    Object.assign(processTree.nodeInfo[unmapped], { concept: "ShowMessage", mappingStatus: "mapped" });
    const report = migrationReportFor({ ...bot, processTree: JSON.stringify(processTree) });
    expect(report.coverage.ontology).toBe(1);
    expect(report.review?.atImport.coverage.ontology).toBe(0.5);
    expect(report.review?.resolved).toMatchObject([{ label: "Beep", kind: "mapped" }]);
  });

  it("reports ontology coverage only for target 'none'", () => {
    const report = migrationReportFor(bot, "none");
    expect(report.target).toBeUndefined();
    expect(report.coverage.target).toBeUndefined();
  });

  it("rejects unknown targets", () => {
    expect(() => migrationReportFor(bot, "blueprism")).toThrow('Unknown target "blueprism"');
  });

  it("reports on bots modeled in OntoRPA, which have no source or mapping status", () => {
    const report = migrationReportFor({
      name: "Modeled",
      model: "<bpmn/>",
      processTree: JSON.stringify({
        tree: { Process: [{ Flow: ["Task_1", "Task_2"] }] },
        nodeInfo: {
          Task_1: { label: "Open", concept: "BrowserOpenURL" },
          Task_2: { label: "Export", concept: "ExcelExportPDF" },
        },
      }),
    });
    expect(report.totals).toMatchObject({ steps: 2, mapped: 2, ontologyOnly: 1 });
    expect(report.coverage).toEqual({ ontology: 1, target: 0.5 });
    expect(report.bot.reframework).toBe(false);
  });
});

describe("migrationTargetOperations", () => {
  it("lists the operations PAD generates, sorted", () => {
    const { pad } = migrationTargetOperations();
    expect(pad.name).toBe("Power Automate Desktop");
    expect(pad.operations).toContain("BrowserOpenURL");
    expect(pad.operations).toContain("BinaryDecision");
    expect(pad.operations).not.toContain("ExcelExportPDF");
    expect(pad.operations).toEqual([...pad.operations].sort());
  });
});

describe("previewPadStep", () => {
  it("gives the PAD lines of a step", () => {
    expect(previewPadStep({ label: "Stop app", concept: "", mappingStatus: "unmapped" })).toEqual([
      '# TODO "Stop app": no ontology operation, rebuild by hand',
    ]);
  });

  it.each([undefined, "step", { label: "No concept" }])("rejects %j", (step) => {
    expect(() => previewPadStep(step)).toThrow(MigrationRequestError);
  });
});
