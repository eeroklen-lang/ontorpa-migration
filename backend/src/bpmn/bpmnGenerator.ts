import { create } from "xmlbuilder2";
import { XMLBuilder } from "xmlbuilder2/lib/interfaces";
import { IProcessTree } from "../interfaces/BotModelInterface";
import { Bounds, Diagram, DiagramNode, layoutProcessTree } from "./bpmnLayout";

const NAMESPACES = {
  bpmn2: "http://www.omg.org/spec/BPMN/20100524/MODEL",
  bpmndi: "http://www.omg.org/spec/BPMN/20100524/DI",
  dc: "http://www.omg.org/spec/DD/20100524/DC",
  di: "http://www.omg.org/spec/DD/20100524/DI",
  // The front end's moddle extension (frontend/src/resources/rpaExtension.json)
  rpa: "http://some-company/schema/bpmn/rpa",
};

/**
 * Generates a BPMN diagram for a process tree, as the modeler would store it: element ids are
 * the process tree ids, steps carry their ontology operation as rpa:operation, and the process
 * is "Process_1". The front end's BpmnModdleParser reads the diagram back into the same tree.
 */
export function generateBpmn(processTree: IProcessTree): string {
  const diagram = layoutProcessTree(processTree);
  const document = create({ version: "1.0", encoding: "UTF-8" });
  const definitions = document.ele(NAMESPACES.bpmn2, "bpmn2:definitions", {
    "xmlns:bpmndi": NAMESPACES.bpmndi,
    "xmlns:dc": NAMESPACES.dc,
    "xmlns:di": NAMESPACES.di,
    "xmlns:rpa": NAMESPACES.rpa,
    id: "Definitions_1",
    targetNamespace: "http://bpmn.io/schema/bpmn",
  });

  const process = definitions.ele("bpmn2:process", { id: "Process_1", isExecutable: "false" });
  new SemanticWriter(diagram).write(process, undefined);

  const plane = definitions
    .ele("bpmndi:BPMNDiagram", { id: "BPMNDiagram_1" })
    .ele("bpmndi:BPMNPlane", { id: "BPMNPlane_1", bpmnElement: "Process_1" });
  for (const node of diagram.nodes) {
    const shape = plane.ele("bpmndi:BPMNShape", {
      id: `${node.id}_di`,
      bpmnElement: node.id,
      ...(node.type === "subProcess" ? { isExpanded: "true" } : {}),
    });
    writeBounds(shape, node.bounds);
    if (node.label) {
      writeBounds(shape.ele("bpmndi:BPMNLabel"), node.label);
    }
  }
  for (const flow of diagram.flows) {
    const edge = plane.ele("bpmndi:BPMNEdge", { id: `${flow.id}_di`, bpmnElement: flow.id });
    flow.waypoints.forEach((point) =>
      edge.ele("di:waypoint", { x: String(point.x), y: String(point.y) })
    );
  }

  return document.end({ prettyPrint: true });
}

/** Writes the flow elements of the process and, nested inside them, of every sub-process. */
class SemanticWriter {
  private incoming = new Map<string, string[]>();
  private outgoing = new Map<string, string[]>();

  constructor(private diagram: Diagram) {
    for (const flow of diagram.flows) {
      append(this.outgoing, flow.source, flow.id);
      append(this.incoming, flow.target, flow.id);
    }
  }

  write(container: XMLBuilder, parent: string | undefined) {
    for (const node of this.diagram.nodes.filter((n) => n.parent === parent)) {
      const element = container.ele(`bpmn2:${node.type}`, attributesOf(node));
      (this.incoming.get(node.id) || []).forEach((flow) => element.ele("bpmn2:incoming").txt(flow));
      (this.outgoing.get(node.id) || []).forEach((flow) => element.ele("bpmn2:outgoing").txt(flow));
      if (node.loop === "sequential") {
        element.ele("bpmn2:multiInstanceLoopCharacteristics", { isSequential: "true" });
      } else if (node.loop === "standard") {
        element.ele("bpmn2:standardLoopCharacteristics");
      }
      if (node.type === "subProcess") {
        this.write(element, node.id);
      }
    }
    for (const flow of this.diagram.flows.filter((f) => f.parent === parent)) {
      container.ele("bpmn2:sequenceFlow", { id: flow.id, sourceRef: flow.source, targetRef: flow.target });
    }
  }
}

function attributesOf(node: DiagramNode): Record<string, string> {
  const attributes: Record<string, string> = { id: node.id };
  if (node.name) {
    attributes.name = node.name;
  }
  if (node.gatewayDirection) {
    attributes.gatewayDirection = node.gatewayDirection;
  }
  if (node.operation) {
    attributes["rpa:operation"] = node.operation;
  }
  return attributes;
}

function writeBounds(element: XMLBuilder, bounds: Bounds) {
  element.ele("dc:Bounds", {
    x: String(bounds.x),
    y: String(bounds.y),
    width: String(bounds.width),
    height: String(bounds.height),
  });
}

function append(map: Map<string, string[]>, key: string, value: string) {
  map.set(key, [...(map.get(key) || []), value]);
}
