import {
  Definitions,
  FlowElement,
  FlowNode,
  Gateway,
  ItemAwareElement,
  Process,
  SequenceFlow,
  SubProcess,
} from "bpmn-moddle";
import {
  ProcessTreeNodeInfo,
  ProcessTree,
  ProcessTreeStructure,
} from "../interfaces/BotModel";
import YAML from "yaml";

/** A problem with the structure of a diagram, pointing at the element at fault if there is one. */
export interface ProcessStructureProblem {
  message: string;
  elementId?: string;
}

/** Thrown when a diagram cannot be read as a block-structured process. */
export class ProcessStructureError extends Error implements ProcessStructureProblem {
  elementId?: string;

  constructor(message: string, elementId?: string) {
    super(message);
    this.name = "ProcessStructureError";
    this.elementId = elementId;
  }
}

class BpmnModdleParser {
  processTreeNodes: Record<string, ProcessTreeNodeInfo> = {};
  dataResourceInfo: Record<string, ProcessTreeNodeInfo> = {};
  transientDataInfo: Record<string, ProcessTreeNodeInfo> = {};

  /**
   * Parses a bpmn-js model to a BPMN-independent process tree as a nested list.
   *
   * @param bpmnModdle - Definitions object of a bpmn-js modeler
   */
  parseBpmnModdle(bpmnModdle: Definitions): ProcessTree {
    const process: Process = bpmnModdle.rootElements[0] as Process;
    const parsedProcess = this.parseProcess(process)[0];

    console.log(this.processTreeNodes);
    //console.log(JSON.stringify(parsedProcess));
    console.log(YAML.stringify(parsedProcess));

    const generatedProcessTree: ProcessTree = {
      tree: parsedProcess,
      nodeInfo: this.processTreeNodes,
      dataResourceInfo: this.dataResourceInfo,
      transientDataInfo: this.transientDataInfo,
    };

    // console.log(generatedProcessTree);

    return generatedProcessTree;
  }

  /**
   * Parses a BPMN-moddle process object to a process tree.
   *
   * @param process
   *
   * @returns [ProcessTree, last element in flow]
   */
  private parseProcess(
    process: Process | SubProcess
  ): [ProcessTreeStructure, FlowNode | undefined] {
    const startFlow = BpmnModdleParser.getStartFlowOfProcess(process);
    const processTree: ProcessTreeStructure = {};
    const isSubProcess = process.$type === "bpmn:SubProcess";

    if (!startFlow || !startFlow.targetRef) {
      throw new ProcessStructureError(
        isSubProcess
          ? `${describe(process)} has no start event connected to its flow.`
          : "The start event is not connected to the flow.",
        isSubProcess ? process.id : undefined
      );
    }

    const [treePart, lastElement] = this.parseProcessFlowUntilElement(
      startFlow.targetRef,
      "bpmn:EndEvent"
    );

    // Sub-processes without an operation (e.g. imported scopes) are steps too
    if (isSubProcess) {
      processTree[process.id] = treePart;
      this.addProcessNodeInfo(process);
    } else {
      processTree["Process"] = treePart;
    }
    // last node can not be the end-event! Otherwise, sub-processes would terminate
    // the parsing as their end events have no outgoing flow to the subsequent parts, but the sub-process itself.
    return [processTree, process];
  }

  /**
   * Parses a process flow until a certain modeling element is observed.
   *
   * @param startElement - The modeling element in which the flow to parse starts
   * @param TerminationElementType - The modeling element where to stop parsing; for a gateway
   * type, only a join of that type stops it, so nested splits of the same type are parsed
   * @returns [ProcessTree, last element in flow]
   */
  private parseProcessFlowUntilElement(
    startElement: FlowNode,
    TerminationElementType: String
  ): [
    ProcessTreeStructure | ProcessTreeStructure[] | string[],
    FlowNode | undefined
  ] {
    // console.log("Parsing flow starting in " + elementToString(startElement));

    const parsedProcess: (string | ProcessTreeStructure)[] = [];
    let nextElementInFlow: FlowNode | undefined = startElement;
    const isTermination = (element: FlowNode) =>
      element.$type === TerminationElementType &&
      (TerminationElementType === "bpmn:EndEvent" || isJoin(element));

    while (nextElementInFlow && !isTermination(nextElementInFlow)) {
      const [treePart, lastElement] =
        this.parseProcessSegment(nextElementInFlow);
      parsedProcess.push(treePart);

      if (lastElement && lastElement.outgoing) {
        nextElementInFlow = lastElement.outgoing[0].targetRef;
      } else {
        nextElementInFlow = undefined;
      }
    }

    if (parsedProcess.length === 1) {
      return [parsedProcess, nextElementInFlow];
    }
    return [[{ Flow: parsedProcess }], nextElementInFlow];
  }

  /**
   * Parses an element, such as an activity, or a segment of process, like a parallel block, or a sub-process.
   *
   * @param currentElement - The modeling element to parse or where the segment starts
   * @returns [ProcessTree or single element, last element in flow]
   */
  private parseProcessSegment(
    currentElement: FlowNode
  ): [string | ProcessTreeStructure, FlowNode | undefined] {
    // console.log("Parsing " + elementToString(currentElement));
    switch (currentElement.$type) {
      case "bpmn:Task":
        this.addProcessNodeInfo(currentElement);
        return [currentElement.id, currentElement];
      case "bpmn:ParallelGateway":
      case "bpmn:ExclusiveGateway":
        if (isJoin(currentElement)) {
          throw new ProcessStructureError(
            `${describe(currentElement)} joins branches that no gateway of the same type splits.`,
            currentElement.id
          );
        }
        return this.parseSplittedControlflow(currentElement);
      case "bpmn:SubProcess":
        return this.parseProcess(currentElement as SubProcess);
      default:
        return ["", undefined];
    }
  }

  /**
   * Parses a block from a splitting gateway to its join.
   *
   * @param gatewayElement The gateway where the block starts
   * @returns [ProcessTree, last element in flow]
   */
  private parseSplittedControlflow(
    gatewayElement: FlowNode
  ): [ProcessTreeStructure, FlowNode | undefined] {
    // console.log(
    //   "Start analyzing splitted control flow for gateway " +
    //     elementToString(gatewayElement)
    // );
    const splittetControlflowBranches: (string | ProcessTreeStructure)[] = [];
    const lastElementsOfBranches: FlowElement[] = [];

    gatewayElement.outgoing.forEach((branch) => {
      const [parsedFlowBranch, lastElement] = this.parseProcessFlowUntilElement(
        branch.targetRef,
        gatewayElement.$type
      );

      if (parsedFlowBranch.length === 1) {
        splittetControlflowBranches.push(parsedFlowBranch[0]);
      } else {
        splittetControlflowBranches.push(parsedFlowBranch);
      }

      if (lastElement) {
        lastElementsOfBranches.push(lastElement);
      }
    });

    // Ensure that really every branch ended with the same gateway (should be always true)
    if (
      !lastElementsOfBranches.every(
        (element) => element.id === lastElementsOfBranches[0].id
      )
    ) {
      throw new ProcessStructureError(
        `The branches of ${describe(gatewayElement)} end at different gateways.`,
        gatewayElement.id
      );
    }

    const gatewayId = gatewayElement.id;

    this.addProcessNodeInfo(gatewayElement);
    const gatewayProcessTree: ProcessTreeStructure = {};
    gatewayProcessTree[gatewayElement.id] = splittetControlflowBranches;

    return [gatewayProcessTree, lastElementsOfBranches[0]];
  }

  private addProcessNodeInfo(element: FlowNode): void {
    // Elements without an operation are kept as unmapped steps (concept ""), e.g. imported
    // activities that no ontology operation fits yet
    const nodeInfo: ProcessTreeNodeInfo = {
      label: element.name || element.id,
      concept: element.$attrs?.["rpa:operation"] || "",
    };

    // Look for data associations
    if (element.$type === "bpmn:Task") {
      const resourceInput: string[] = [];
      const resourceOutput: string[] = [];
      const variableInput: string[] = [];
      const variableOutput: string[] = [];

      if (element.dataInputAssociations) {
        element.dataInputAssociations.forEach((association) => {
          const dataInformationObject = association.sourceRef[0];
          if (dataInformationObject.$type === "bpmn:DataStoreReference") {
            resourceInput.push(dataInformationObject.id);
          } else {
            variableInput.push(dataInformationObject.id);
          }
          this.addDataInfo(dataInformationObject);
        });
      }
      if (element.dataOutputAssociations) {
        element.dataOutputAssociations.forEach((association) => {
          const dataInformationObject = association.targetRef;
          if (dataInformationObject.$type === "bpmn:DataStoreReference") {
            resourceOutput.push(dataInformationObject.id);
          } else {
            variableOutput.push(dataInformationObject.id);
          }
          this.addDataInfo(dataInformationObject);
        });
      }
      if (resourceInput.length > 0) {
        nodeInfo.dataResourceInput = resourceInput;
      }
      if (variableInput.length > 0) {
        nodeInfo.variableInput = variableInput;
      }
      if (resourceOutput.length > 0) {
        nodeInfo.dataResourceOutput = resourceOutput;
      }
      if (variableOutput.length > 0) {
        nodeInfo.variableOutput = variableOutput;
      }
    }

    // Get basic information about the element
    this.processTreeNodes[element.id] = nodeInfo;
  }

  private addDataInfo(dataNode: ItemAwareElement): void {
    const nodeInfo: ProcessTreeNodeInfo = {
      label: dataNode.name || dataNode.id,
      concept: dataNode.$attrs["rpa:operation"],
    };

    if (dataNode.$type === "bpmn:DataStoreReference") {
      this.dataResourceInfo[dataNode.id] = nodeInfo;
    } else if (dataNode.$type === "bpmn:DataObjectReference") {
      this.transientDataInfo[dataNode.id] = nodeInfo;
    } else {
      throw new Error("Data node is neither a data store nor a data object.");
    }
  }

  /**
   * Find the sequence flow that originates from a start event.
   *
   * @param sequenceFlows - Set of sequence flows to analyze
   * @returns The sequence flow originating in start event
   */
  private static getStartFlowOfProcess(
    process: Process | SubProcess
  ): SequenceFlow | undefined {
    const sequenceFlows: SequenceFlow[] = process.flowElements.filter(
      (flowElement) => flowElement.$type === "bpmn:SequenceFlow"
    ) as SequenceFlow[];

    return sequenceFlows.find(
      (sequenceFlow) => sequenceFlow.sourceRef.$type === "bpmn:StartEvent"
    );
  }

  private static elementToString(element: FlowNode): string {
    return element.name || element.id + " (" + element.$type + ")";
  }
}

/**
 * Finds the parts of a diagram that its process tree leaves out: steps not reached from the
 * start event, and steps with several outgoing flows, of which only the first is followed.
 *
 * @param bpmnModdle - Definitions object of a bpmn-js modeler
 * @param processTree - The process tree parsed from it
 */
export function findStructureProblems(
  bpmnModdle: Definitions,
  processTree: ProcessTree
): ProcessStructureProblem[] {
  const problems: ProcessStructureProblem[] = [];

  const visit = (container: Process | SubProcess) => {
    container.flowElements.forEach((element) => {
      const isStep =
        element.$type === "bpmn:Task" || element.$type === "bpmn:SubProcess";
      if (isStep && !(element.id in processTree.nodeInfo)) {
        problems.push({
          message: `${describe(element)} is not reached from the start event, so the bot leaves it out.`,
          elementId: element.id,
        });
        return;
      }
      const outgoing = (element as FlowNode).outgoing || [];
      if (!element.$type.endsWith("Gateway") && outgoing.length > 1) {
        problems.push({
          message: `${describe(element)} has ${outgoing.length} outgoing flows, but only the first is followed. Use a gateway to branch.`,
          elementId: element.id,
        });
      }
      if (element.$type === "bpmn:SubProcess") {
        visit(element as SubProcess);
      }
    });
  };
  visit(bpmnModdle.rootElements[0] as Process);

  return problems;
}

/** A gateway that joins branches: marked as converging, or unmarked with one outgoing flow. */
function isJoin(gateway: FlowNode): boolean {
  const direction = (gateway as Gateway).gatewayDirection;
  if (direction === "Converging") {
    return true;
  }
  if (direction === "Diverging") {
    return false;
  }
  return (gateway.outgoing || []).length <= 1;
}

/** Names an element for a message, e.g. Gateway "Invoice found?" */
function describe(element: { $type: string; id: string; name?: string }): string {
  const kind = element.$type.endsWith("Gateway")
    ? "Gateway"
    : element.$type === "bpmn:SubProcess"
    ? "Sub-process"
    : element.$type === "bpmn:Task"
    ? "Step"
    : "Element";
  return element.name ? `${kind} "${element.name}"` : `${kind} ${element.id}`;
}

export default BpmnModdleParser;
