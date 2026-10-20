import { describe, expect, it } from "vitest";
import { ProcessStructureError } from "../../../frontend/src/utils/BpmnModdleParser";
import defaultRpaDiagram from "../../../frontend/src/resources/defaultRPADiagram";
import { parseDiagram } from "./frontendParser";

interface Diagram {
  nodes: { type: string; id: string; attrs?: string; inner?: Diagram }[];
  /** Sequence flows as [source, target], in the order they leave their source. */
  flows: [string, string][];
}

/** Writes a diagram's semantics as BPMN XML; the parser needs no layout. */
function diagramXml(diagram: Diagram): string {
  let flowCount = 0;
  const body = (d: Diagram): string => {
    const flows = d.flows.map(([from, to]) => ({ id: `f${++flowCount}`, from, to }));
    const nodes = d.nodes.map((node) => {
      const refs = [
        ...flows.filter((f) => f.to === node.id).map((f) => `<bpmn2:incoming>${f.id}</bpmn2:incoming>`),
        ...flows.filter((f) => f.from === node.id).map((f) => `<bpmn2:outgoing>${f.id}</bpmn2:outgoing>`),
      ];
      const inner = node.inner ? body(node.inner) : "";
      return `<bpmn2:${node.type} id="${node.id}" ${node.attrs || ""}>${refs.join("")}${inner}</bpmn2:${node.type}>`;
    });
    const sequenceFlows = flows.map(
      (f) => `<bpmn2:sequenceFlow id="${f.id}" sourceRef="${f.from}" targetRef="${f.to}" />`
    );
    return [...nodes, ...sequenceFlows].join("\n");
  };
  return `<?xml version="1.0" encoding="UTF-8"?>
<bpmn2:definitions xmlns:bpmn2="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:rpa="http://some-company/schema/bpmn/rpa" id="test" targetNamespace="http://bpmn.io/schema/bpmn">
<bpmn2:process id="Process_1">
${body(diagram)}
</bpmn2:process>
</bpmn2:definitions>`;
}

const task = (id: string, operation?: string) => ({
  type: "task",
  id,
  attrs: `name="${id}"` + (operation ? ` rpa:operation="${operation}"` : ""),
});
const gateway = (id: string, attrs = "") => ({ type: "exclusiveGateway", id, attrs });
const start = { type: "startEvent", id: "S" };
const end = { type: "endEvent", id: "E" };

describe("BpmnModdleParser", () => {
  it("parses a diagram drawn in the modeler", async () => {
    const { processTree, problems } = await parseDiagram(defaultRpaDiagram);
    expect(processTree.tree).toEqual({
      Process: [
        {
          Flow: [
            "Activity_1ftvt3q",
            { Gateway_19smgdd: ["Activity_02xnb0y", "Activity_1nyp1o0"] },
          ],
        },
      ],
    });
    expect(processTree.nodeInfo.Gateway_19smgdd.concept).toBe("BinaryDecision");
    expect(problems).toEqual([]);
  });

  it("parses a split nested directly in a branch of a split of the same type", async () => {
    const xml = diagramXml({
      nodes: [
        start,
        gateway("G1", 'name="Outer" rpa:operation="BinaryDecision"'),
        gateway("G2", 'name="Inner" rpa:operation="BinaryDecision"'),
        task("A", "ExcelOpenWorkbook"),
        task("B"),
        gateway("G2j"),
        task("C", "ExcelCloseWorkbook"),
        gateway("G1j"),
        end,
      ],
      flows: [
        ["S", "G1"],
        ["G1", "G2"],
        ["G1", "C"],
        ["G2", "A"],
        ["G2", "B"],
        ["A", "G2j"],
        ["B", "G2j"],
        ["G2j", "G1j"],
        ["C", "G1j"],
        ["G1j", "E"],
      ],
    });
    const { processTree } = await parseDiagram(xml);
    expect(processTree.tree).toEqual({ Process: [{ G1: [{ G2: ["A", "B"] }, "C"] }] });
    expect(processTree.nodeInfo.G2).toEqual({ label: "Inner", concept: "BinaryDecision" });
  });

  it("keeps steps and sub-processes without an operation, with an empty concept", async () => {
    const xml = diagramXml({
      nodes: [
        start,
        {
          type: "subProcess",
          id: "Scope",
          attrs: 'name="Use app"',
          inner: {
            nodes: [{ type: "startEvent", id: "S2" }, task("T"), { type: "endEvent", id: "E2" }],
            flows: [
              ["S2", "T"],
              ["T", "E2"],
            ],
          },
        },
        end,
      ],
      flows: [
        ["S", "Scope"],
        ["Scope", "E"],
      ],
    });
    const { processTree } = await parseDiagram(xml);
    expect(processTree.tree).toEqual({ Process: [{ Scope: ["T"] }] });
    expect(processTree.nodeInfo).toEqual({
      Scope: { label: "Use app", concept: "" },
      T: { label: "T", concept: "" },
    });
  });

  it("uses the gateway direction to tell a single-branch split from its join", async () => {
    const xml = diagramXml({
      nodes: [
        start,
        gateway("G", 'gatewayDirection="Diverging" rpa:operation="CaseDecision"'),
        task("A"),
        gateway("J", 'gatewayDirection="Converging"'),
        end,
      ],
      flows: [
        ["S", "G"],
        ["G", "A"],
        ["A", "J"],
        ["J", "E"],
      ],
    });
    expect((await parseDiagram(xml)).processTree.tree).toEqual({ Process: [{ G: ["A"] }] });
  });

  it("names the gateway whose branches end at different joins", async () => {
    const xml = diagramXml({
      nodes: [
        start,
        gateway("G1", 'rpa:operation="BinaryDecision"'),
        gateway("G2", 'name="Inner" rpa:operation="BinaryDecision"'),
        task("A"),
        task("B"),
        gateway("G2j"),
        task("C"),
        gateway("G1j"),
        end,
      ],
      flows: [
        ["S", "G1"],
        ["G1", "G2"],
        ["G1", "C"],
        ["G2", "A"],
        ["G2", "B"],
        ["A", "G1j"],
        ["B", "G2j"],
        ["G2j", "G1j"],
        ["C", "G1j"],
        ["G1j", "E"],
      ],
    });
    const error = await parseDiagram(xml).catch((e) => e);
    expect(error).toBeInstanceOf(ProcessStructureError);
    expect(error).toMatchObject({
      elementId: "G2",
      message: 'The branches of Gateway "Inner" end at different gateways.',
    });
  });

  it("names a join that no split opened", async () => {
    const xml = diagramXml({
      nodes: [start, task("A"), gateway("J"), end],
      flows: [
        ["S", "A"],
        ["A", "J"],
        ["J", "E"],
      ],
    });
    await expect(parseDiagram(xml)).rejects.toMatchObject({ elementId: "J" });
  });

  it("reports steps the tree leaves out", async () => {
    const xml = diagramXml({
      nodes: [start, task("A"), task("B"), task("Lonely"), end],
      flows: [
        ["S", "A"],
        ["A", "E"],
        ["A", "B"],
        ["B", "E"],
      ],
    });
    const { processTree, problems } = await parseDiagram(xml);
    expect(processTree.tree).toEqual({ Process: ["A"] });
    expect(problems.map((p) => p.elementId)).toEqual(["A", "B", "Lonely"]);
    expect(problems[0].message).toContain("2 outgoing flows");
    expect(problems[1].message).toBe('Step "B" is not reached from the start event, so the bot leaves it out.');
  });
});
