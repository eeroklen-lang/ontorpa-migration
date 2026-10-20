import { describe, expect, it } from "vitest";
import { checklistItems, diagramSteps } from "../../../frontend/src/utils/migrationChecklist";
import { migrationTargets } from "../../src/analysis/migrationTargets";
import { generateBpmn } from "../../src/bpmn/bpmnGenerator";
import { IProcessTree, IProcessTreeNodeInfo, MappingStatus } from "../../src/interfaces/BotModelInterface";
import { readDiagram } from "./frontendParser";

const node = (
  label: string,
  concept: string,
  mappingStatus: MappingStatus,
  extra: Partial<IProcessTreeNodeInfo["source"]> = {}
): IProcessTreeNodeInfo => ({
  label,
  concept,
  mappingStatus,
  source: { vendor: "UiPath", activityType: "Activity", file: "Main.xaml", ...extra },
  imported: { concept, mappingStatus },
});

const bot: IProcessTree = {
  tree: { Process: [{ Flow: ["A1", { G1: ["A2", { Flow: [] }] }, { S1: ["A3"] }, "A4"] }] },
  nodeInfo: {
    A1: node("Click", "", "unmapped", { activityType: "NClick", context: "desktop" }),
    G1: node("Found?", "BinaryDecision", "mapped"),
    A2: node("Export", "ExcelExportPDF", "mapped"),
    S1: node("Use app", "", "structural"),
    A3: node("Code", "", "manual", { reason: "Invoke Code: custom VB/C# code" }),
    A4: node("Open", "BrowserOpenURL", "mapped"),
  },
};

/** The diagram's elements as bpmn-js's element registry holds them: shapes with a business object. */
async function elementsOf(processTree: IProcessTree) {
  const definitions = await readDiagram(generateBpmn(processTree));
  const elements: { businessObject: any }[] = [];
  const visit = (container: any) =>
    container.flowElements.forEach((element: any) => {
      elements.push({ businessObject: element });
      if (element.flowElements) {
        visit(element);
      }
    });
  visit(definitions.rootElements[0]);
  return elements;
}

describe("diagramSteps", () => {
  it("classifies the steps of a generated diagram, leaving out joins and events", async () => {
    const steps = diagramSteps(await elementsOf(bot), bot.nodeInfo, migrationTargets.pad.operations);
    expect(Object.fromEntries(steps.map((step) => [step.id, step.stepClass]))).toEqual({
      A1: "unmapped",
      G1: "mapped",
      A2: "ontologyOnly",
      S1: "structural",
      A3: "manual",
      A4: "mapped",
    });
  });

  it("follows operations changed in the modeler", async () => {
    const elements = await elementsOf(bot);
    const click = elements.find((e) => e.businessObject.id === "A1")!.businessObject;
    click.$attrs["rpa:operation"] = "BrowserClickButton";
    const steps = diagramSteps(elements, bot.nodeInfo, migrationTargets.pad.operations);
    expect(steps.find((step) => step.id === "A1")).toMatchObject({ status: "mapped", stepClass: "mapped" });
  });
});

describe("checklistItems", () => {
  it("lists diagram problems first, then unmapped, manual and ontology-only steps", async () => {
    const steps = diagramSteps(await elementsOf(bot), bot.nodeInfo, migrationTargets.pad.operations);
    const items = checklistItems(steps, [{ message: "Gateway X joins nothing.", elementId: "X" }], "Power Automate Desktop");
    expect(items).toEqual([
      { elementId: "X", label: "", kind: "structure", detail: "Gateway X joins nothing." },
      { elementId: "A1", label: "Click", kind: "unmapped", detail: "UiPath NClick in desktop: choose an operation" },
      { elementId: "A3", label: "Code", kind: "manual", detail: "Invoke Code: custom VB/C# code" },
      {
        elementId: "A2",
        label: "Export",
        kind: "ontologyOnly",
        detail: "ExcelExportPDF has no Power Automate Desktop action yet",
      },
    ]);
  });
});
