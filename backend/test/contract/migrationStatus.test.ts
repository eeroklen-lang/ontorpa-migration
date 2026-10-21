import { describe, expect, it } from "vitest";
import {
  countSteps,
  mergeProcessTree,
  resolveStatus,
} from "../../../frontend/src/utils/migrationStatus";
import { buildMigrationReport } from "../../src/analysis/migrationReport";
import { migrationTargets } from "../../src/analysis/migrationTargets";
import { importProject } from "../../src/importers/uipath/UiPathImporter";
import { IProcessTreeNodeInfo, MappingStatus } from "../../src/interfaces/BotModelInterface";
import { hasSamples, sampleFiles, sampleProjects } from "../samples";

const imported = (label: string, concept: string, mappingStatus: MappingStatus): IProcessTreeNodeInfo => ({
  label,
  concept,
  mappingStatus,
  source: { vendor: "UiPath", activityType: "Activity", file: "Main.xaml" },
  imported: { concept, mappingStatus },
});

/** A stored imported bot, and its tree as the modeler's parser reads it back (labels and concepts only). */
const saved = {
  tree: { Process: [{ Flow: ["Unmapped", "Mapped", "Removed", "Manual", { Scope: ["Kept"] }, "Deleted"] }] },
  nodeInfo: {
    Unmapped: imported("Click", "", "unmapped"),
    Mapped: imported("Open", "BrowserOpenURL", "mapped"),
    Removed: imported("Trim", "StringTrim", "mapped"),
    Manual: imported("Code", "", "manual"),
    Scope: imported("Use app", "", "structural"),
    Kept: imported("Read", "ExcelReadRange", "mapped"),
    Deleted: imported("Old", "DeleteFile", "mapped"),
  },
  dataResourceInfo: {},
  transientDataInfo: {},
};

function parsedWith(changes: Record<string, string>, added: Record<string, string> = {}) {
  const nodeInfo: Record<string, { label: string; concept: string }> = {};
  for (const [id, info] of Object.entries(saved.nodeInfo)) {
    if (id !== "Deleted") {
      nodeInfo[id] = { label: info.label, concept: id in changes ? changes[id] : info.concept };
    }
  }
  for (const [id, concept] of Object.entries(added)) {
    nodeInfo[id] = { label: id, concept };
  }
  return { tree: saved.tree, nodeInfo, dataResourceInfo: {}, transientDataInfo: {} };
}

describe("mergeProcessTree", () => {
  const merged = mergeProcessTree(
    saved,
    parsedWith(
      { Unmapped: "BrowserClickButton", Mapped: "BrowserNavigate", Removed: "" },
      { Activity_0new: "DeleteFile" }
    )
  ).nodeInfo;
  const statuses = Object.fromEntries(Object.entries(merged).map(([id, info]) => [id, info.mappingStatus]));

  it("updates the status of edited steps", () => {
    expect(statuses).toEqual({
      Unmapped: "mapped",
      Mapped: "mapped",
      Removed: "unmapped",
      Manual: "manual",
      Scope: "structural",
      Kept: "mapped",
      // Added in the modeler: no status, like a modeled step
      Activity_0new: undefined,
    });
  });

  it("keeps the UiPath source and import result, and drops deleted steps", () => {
    expect(merged.Unmapped).toEqual({
      label: "Click",
      concept: "BrowserClickButton",
      mappingStatus: "mapped",
      source: saved.nodeInfo.Unmapped.source,
      imported: { concept: "", mappingStatus: "unmapped" },
    });
    expect(merged.Deleted).toBeUndefined();
    expect(merged.Activity_0new).toEqual({ label: "Activity_0new", concept: "DeleteFile" });
  });

  it("leaves modeled bots as parsed", () => {
    const modeled = { ...saved, nodeInfo: { Task_1: { label: "Open", concept: "BrowserOpenURL" } } };
    const parsed = { ...saved, nodeInfo: { Task_1: { label: "Open", concept: "" } } };
    expect(mergeProcessTree(modeled, parsed).nodeInfo).toEqual(parsed.nodeInfo);
  });
});

describe("resolveStatus", () => {
  it("returns a manual step to manual when its operation is removed again", () => {
    const fixed = { ...saved.nodeInfo.Manual, concept: "SetVariable", mappingStatus: "mapped" as const };
    expect(resolveStatus(fixed, "SetVariable")).toBe("mapped");
    expect(resolveStatus(fixed, "")).toBe("manual");
  });

  it("treats new steps like modeled ones", () => {
    expect(resolveStatus(undefined, "StringTrim")).toBe("mapped");
    expect(resolveStatus(undefined, "")).toBe("unmapped");
  });
});

describe("countSteps", () => {
  const pad = migrationTargets.pad.operations;

  it("counts like the migration report", () => {
    const edited = mergeProcessTree(saved, parsedWith({ Unmapped: "BrowserClickButton", Removed: "" }));
    const report = buildMigrationReport({ name: "Bot", processTree: edited }, migrationTargets.pad);
    expect(countSteps(edited.nodeInfo, pad)).toEqual({ totals: report.totals, coverage: report.coverage });
    expect(countSteps(edited.nodeInfo)).toEqual({
      totals: buildMigrationReport({ name: "Bot", processTree: edited }).totals,
      coverage: buildMigrationReport({ name: "Bot", processTree: edited }).coverage,
    });
  });

  it.skipIf(!hasSamples).each(sampleProjects())("counts %s like the migration report", (project) => {
    const bot = importProject(sampleFiles(project));
    const report = buildMigrationReport(bot, migrationTargets.pad);
    expect(countSteps(bot.processTree.nodeInfo, pad)).toEqual({ totals: report.totals, coverage: report.coverage });
  });
});
