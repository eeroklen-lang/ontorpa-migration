import { describe, expect, it } from "vitest";
import { generateBpmn } from "../../src/bpmn/bpmnGenerator";
import { importProject } from "../../src/importers/uipath/UiPathImporter";
import { IProcessTree } from "../../src/interfaces/BotModelInterface";
import { readDiagram } from "../contract/frontendParser";
import { hasTemplates, templateFiles, templateProjects } from "../templates";
import { SAMPLE_TREE } from "./sampleTree";

/** Flow elements by id, from the process and every sub-process, with their container's id. */
function flowElements(container: any, parent?: string, found: Record<string, any> = {}) {
  for (const element of container.flowElements || []) {
    found[element.id] = { element, parent };
    if (element.$type === "bpmn:SubProcess") {
      flowElements(element, element.id, found);
    }
  }
  return found;
}

function overlaps(a: any, b: any): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

function inside(inner: any, outer: any): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  );
}

function onBorder(point: any, bounds: any): boolean {
  const withinX = point.x >= bounds.x && point.x <= bounds.x + bounds.width;
  const withinY = point.y >= bounds.y && point.y <= bounds.y + bounds.height;
  return (
    (withinY && (point.x === bounds.x || point.x === bounds.x + bounds.width)) ||
    (withinX && (point.y === bounds.y || point.y === bounds.y + bounds.height))
  );
}

/** Checks that every element is drawn, nothing overlaps, and flows run between their nodes. */
async function expectWellDrawn(processTree: IProcessTree) {
  const definitions = await readDiagram(generateBpmn(processTree));
  const elements = flowElements(definitions.rootElements[0]);
  const plane = definitions.diagrams[0].plane;
  const di: Record<string, any> = Object.fromEntries(
    plane.planeElement.map((d: any) => [d.bpmnElement.id, d])
  );

  expect(Object.keys(elements).filter((id) => !di[id])).toEqual([]);
  const nodes = Object.entries(elements).filter(([, e]) => e.element.$type !== "bpmn:SequenceFlow");
  for (const [id, { element, parent }] of nodes) {
    const bounds = di[id].bounds;
    if (parent) {
      expect(inside(bounds, di[parent].bounds), `${id} inside ${parent}`).toBe(true);
    }
    for (const [otherId, other] of nodes) {
      if (otherId !== id && other.parent === parent) {
        expect(overlaps(bounds, di[otherId].bounds), `${id} overlaps ${otherId}`).toBe(false);
      }
    }
    if (element.$type === "bpmn:SubProcess") {
      expect(di[id].isExpanded).toBe(true);
    }
  }
  for (const [id, { element }] of Object.entries(elements)) {
    if (element.$type !== "bpmn:SequenceFlow") {
      continue;
    }
    const points = di[id].waypoint;
    expect(onBorder(points[0], di[element.sourceRef.id].bounds), `${id} leaves its source`).toBe(true);
    expect(onBorder(points[points.length - 1], di[element.targetRef.id].bounds), `${id} enters its target`).toBe(true);
    points.slice(1).forEach((point: any, i: number) => {
      const previous = points[i];
      expect(point.x === previous.x || point.y === previous.y, `${id} is orthogonal`).toBe(true);
    });
  }
  return { definitions, elements, di };
}

describe("generateBpmn", () => {
  it("keeps the process tree ids and operations", async () => {
    const { elements } = await expectWellDrawn(SAMPLE_TREE);
    const typeOf = (id: string) => elements[id].element.$type;

    expect(typeOf("Activity_1")).toBe("bpmn:Task");
    expect(typeOf("Gateway_1")).toBe("bpmn:ExclusiveGateway");
    expect(typeOf("Gateway_1_join")).toBe("bpmn:ExclusiveGateway");
    expect(typeOf("Gateway_3")).toBe("bpmn:ParallelGateway");
    expect(typeOf("Activity_3")).toBe("bpmn:SubProcess");
    expect(typeOf("Loop_1")).toBe("bpmn:SubProcess");
    expect(elements.Loop_1.parent).toBe("Activity_3");

    for (const [id, info] of Object.entries(SAMPLE_TREE.nodeInfo)) {
      const element = elements[id].element;
      expect(element.name).toBe(info.label);
      expect(element.$attrs["rpa:operation"]).toBe(info.concept || undefined);
    }
    expect(elements.Gateway_1.element.gatewayDirection).toBe("Diverging");
    expect(elements.Gateway_1_join.element.gatewayDirection).toBe("Converging");
    expect(elements.Gateway_1_join.element.$attrs["rpa:operation"]).toBeUndefined();
  });

  it("marks loops: for-each as sequential multi-instance, others as standard loops", async () => {
    const { elements } = await expectWellDrawn(SAMPLE_TREE);
    expect(elements.Loop_1.element.loopCharacteristics).toMatchObject({
      $type: "bpmn:MultiInstanceLoopCharacteristics",
      isSequential: true,
    });
    expect(elements.Loop_2.element.loopCharacteristics.$type).toBe("bpmn:StandardLoopCharacteristics");
    expect(elements.Activity_3.element.loopCharacteristics).toBeUndefined();
  });

  it("names the process Process_1, as the abstraction view expects", async () => {
    const definitions = await readDiagram(generateBpmn(SAMPLE_TREE));
    expect(definitions.rootElements[0].id).toBe("Process_1");
  });

  it("draws a bot without steps as start and end event", async () => {
    const { elements } = await expectWellDrawn({ tree: { Process: [{ Flow: [] }] }, nodeInfo: {} });
    expect(Object.keys(elements).sort()).toEqual(["EndEvent_1", "Flow_1", "StartEvent_1"]);
  });

  it("escapes labels", async () => {
    const { elements } = await expectWellDrawn({
      tree: { Process: ["Activity_1"] },
      nodeInfo: { Activity_1: { label: 'Type "<b>" & go', concept: "" } },
    });
    expect(elements.Activity_1.element.name).toBe('Type "<b>" & go');
  });
});

describe.skipIf(!hasTemplates)("generateBpmn on UiPath Studio templates", () => {
  it.each(templateProjects())("draws %s", async (project) => {
    await expectWellDrawn(importProject(templateFiles(project)).processTree);
  });
});
