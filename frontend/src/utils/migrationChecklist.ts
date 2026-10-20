import { MappingStatus, ProcessTreeNodeInfo } from "../interfaces/BotModel";
import { isJoin, ProcessStructureProblem } from "./BpmnModdleParser";
import { classifyStep, resolveStatus, StepClass } from "./migrationStatus";

/** A step of the diagram with its migration status, as it stands in the modeler. */
export interface DiagramStep {
  id: string;
  label: string;
  /** Operation the step has now, or "". */
  concept: string;
  status: MappingStatus;
  stepClass: StepClass;
  /** The step as last saved; undefined for steps added since. */
  saved?: ProcessTreeNodeInfo;
}

/** Open migration work: a step that does not export cleanly, or a problem with the diagram. */
export interface ChecklistItem {
  elementId?: string;
  label: string;
  kind: "unmapped" | "manual" | "ontologyOnly" | "structure";
  detail: string;
}

const STEP_TYPES = [
  "bpmn:Task",
  "bpmn:SubProcess",
  "bpmn:ExclusiveGateway",
  "bpmn:ParallelGateway",
];

/**
 * The steps among the elements of a bpmn-js modeler: tasks, sub-processes, and gateways that
 * split (or have an operation), classified from their current operation and their saved info.
 *
 * @param elements - all elements of the modeler's element registry
 * @param saved - node info of the bot as last saved
 * @param targetOperations - operations the target tool generates, to find ontology-only steps
 */
export function diagramSteps(
  elements: { businessObject?: any; labelTarget?: unknown }[],
  saved: Record<string, ProcessTreeNodeInfo>,
  targetOperations?: Set<string>
): DiagramStep[] {
  return elements
    .filter((element) => !element.labelTarget && element.businessObject)
    .map((element) => element.businessObject)
    .filter((bo) => {
      if (!STEP_TYPES.includes(bo.$type)) {
        return false;
      }
      return !bo.$type.endsWith("Gateway") || !!bo.$attrs?.["rpa:operation"] || !isJoin(bo);
    })
    .map((bo) => {
      const concept: string = bo.$attrs?.["rpa:operation"] || "";
      const status = resolveStatus(saved[bo.id], concept);
      return {
        id: bo.id,
        label: bo.name || bo.id,
        concept,
        status,
        stepClass: classifyStep(status, concept, targetOperations),
        saved: saved[bo.id],
      };
    });
}

const ORDER: ChecklistItem["kind"][] = ["structure", "unmapped", "manual", "ontologyOnly"];

/**
 * The open work of a bot: problems with the diagram first, as they keep it from being saved,
 * then unmapped, manual and ontology-only steps, each in diagram order.
 */
export function checklistItems(
  steps: DiagramStep[],
  problems: ProcessStructureProblem[],
  targetName = "the target tool"
): ChecklistItem[] {
  const items: ChecklistItem[] = problems.map((problem) => ({
    elementId: problem.elementId,
    label: "",
    kind: "structure",
    detail: problem.message,
  }));
  for (const step of steps) {
    const source = step.saved?.source;
    const origin = source
      ? `UiPath ${source.activityType}${source.context ? ` in ${source.context}` : ""}`
      : "";
    if (step.stepClass === "unmapped") {
      items.push({
        elementId: step.id,
        label: step.label,
        kind: "unmapped",
        detail: origin ? `${origin}: choose an operation` : "Choose an operation",
      });
    } else if (step.stepClass === "manual") {
      items.push({
        elementId: step.id,
        label: step.label,
        kind: "manual",
        detail: source?.reason || "Needs manual redesign",
      });
    } else if (step.stepClass === "ontologyOnly") {
      items.push({
        elementId: step.id,
        label: step.label,
        kind: "ontologyOnly",
        detail: `${step.concept} has no ${targetName} action yet`,
      });
    }
  }
  return items.sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind));
}
