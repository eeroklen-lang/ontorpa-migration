import { describe, expect, it } from "vitest";
import { generateBpmn } from "../../src/bpmn/bpmnGenerator";
import { importProject } from "../../src/importers/uipath/UiPathImporter";
import { IProcessTree } from "../../src/interfaces/BotModelInterface";
import { SAMPLE_TREE } from "../bpmn/sampleTree";
import { hasTemplates, templateFiles, templateProjects } from "../templates";
import { parseDiagram } from "./frontendParser";

/** What the modeler's parser keeps of each node: label (the id if empty) and concept. */
function labelsAndConcepts(processTree: IProcessTree) {
  return Object.fromEntries(
    Object.entries(processTree.nodeInfo).map(([id, info]) => [
      id,
      { label: info.label || id, concept: info.concept },
    ])
  );
}

/** Saving a generated diagram in the modeler must give back the tree it was generated from. */
async function expectRoundTrip(processTree: IProcessTree) {
  const parsed = await parseDiagram(generateBpmn(processTree));
  expect(parsed.processTree.tree).toEqual(processTree.tree);
  expect(parsed.processTree.nodeInfo).toEqual(labelsAndConcepts(processTree));
  expect(parsed.problems).toEqual([]);
}

describe("generated diagram, read back by the modeler's parser", () => {
  it("gives back the tree, including nested splits of the same type and empty branches", async () => {
    await expectRoundTrip(SAMPLE_TREE);
  });

  it("gives back a bot without steps", async () => {
    await expectRoundTrip({ tree: { Process: [{ Flow: [] }] }, nodeInfo: {} });
  });

  it("gives a gateway without branches one empty branch", async () => {
    const parsed = await parseDiagram(
      generateBpmn({
        tree: { Process: [{ Gateway_1: [] }] },
        nodeInfo: { Gateway_1: { label: "Switch", concept: "CaseDecision" } },
      })
    );
    expect(parsed.processTree.tree).toEqual({ Process: [{ Gateway_1: [{ Flow: [] }] }] });
  });
});

describe.skipIf(!hasTemplates)("generated diagrams of UiPath Studio templates", () => {
  it.each(templateProjects())("give back the imported tree of %s", async (project) => {
    await expectRoundTrip(importProject(templateFiles(project)).processTree);
  });
});
