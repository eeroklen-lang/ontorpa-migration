import { describe, expect, it } from "vitest";
import {
  importUiPathBot,
  MigrationRequestError,
  migrationReportFor,
} from "../../src/services/migrationService";

const MAIN = `<Activity x:Class="Main"
  xmlns="http://schemas.microsoft.com/netfx/2009/xaml/activities"
  xmlns:ui="http://schemas.uipath.com/workflow/activities"
  xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml">
  <Sequence>
    <ui:NavigateTo DisplayName="Open portal" />
    <ui:KillProcess DisplayName="Stop app" />
  </Sequence>
</Activity>`;

describe("importUiPathBot", () => {
  it("returns a storable bot with JSON-encoded process tree and source, plus a PAD report", () => {
    const { bot, report } = importUiPathBot({ "Portal/Main.xaml": MAIN }, "Portal");
    expect(bot.name).toBe("Portal");
    expect(bot.model).toBeUndefined();
    expect(Object.keys(JSON.parse(bot.processTree).nodeInfo)).toHaveLength(2);
    expect(JSON.parse(bot.source!).main).toBe("Main.xaml");
    expect(report.target).toBe("Power Automate Desktop");
    expect(report.totals).toMatchObject({ steps: 2, mapped: 1, unmapped: 1 });
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
          Task_2: { label: "Hash", concept: "StringHash" },
        },
      }),
    });
    expect(report.totals).toMatchObject({ steps: 2, mapped: 2, ontologyOnly: 1 });
    expect(report.coverage).toEqual({ ontology: 1, target: 0.5 });
    expect(report.bot.reframework).toBe(false);
  });
});
