import {
  MappingStatus,
  ProcessTree,
  ProcessTreeNodeInfo,
} from "../interfaces/BotModel";
import { MigrationReport } from "../interfaces/MigrationReport";

/** How far a step is migrated; ontologyOnly: mapped, but the target tool has no action for it. */
export type StepClass = MappingStatus | "ontologyOnly";

/** Step counts and coverage, as in the back end's migration report. */
export type StepCounts = Pick<MigrationReport, "totals" | "coverage">;

/**
 * The mapping status of a step after editing: with an operation it is mapped. Without one, it
 * falls back to its import status if that was manual or structural, and is unmapped otherwise.
 *
 * @param saved - the step's node info as last saved; undefined for steps added in the modeler
 * @param concept - the operation the step has now, or ""
 */
export function resolveStatus(
  saved: ProcessTreeNodeInfo | undefined,
  concept: string
): MappingStatus {
  if (concept) {
    return "mapped";
  }
  const base = saved?.imported?.mappingStatus ?? saved?.mappingStatus;
  return base === "manual" || base === "structural" ? base : "unmapped";
}

/**
 * Carries the import information of a bot over to the process tree parsed from its edited
 * diagram, matching nodes by id, and updates their mapping status. Nodes of modeled bots and
 * nodes added in the modeler stay as parsed.
 */
export function mergeProcessTree(
  saved: ProcessTree | undefined,
  parsed: ProcessTree
): ProcessTree {
  const nodeInfo: Record<string, ProcessTreeNodeInfo> = {};
  for (const [id, info] of Object.entries(parsed.nodeInfo)) {
    const previous = saved?.nodeInfo?.[id];
    if (!previous?.mappingStatus) {
      nodeInfo[id] = info;
      continue;
    }
    nodeInfo[id] = {
      ...info,
      mappingStatus: resolveStatus(previous, info.concept),
      ...(previous.source ? { source: previous.source } : {}),
      ...(previous.imported ? { imported: previous.imported } : {}),
    };
  }
  return { ...parsed, nodeInfo };
}

/** A node's status; modeled nodes have none and count as mapped if they have an operation. */
export function statusOf(node: ProcessTreeNodeInfo): MappingStatus {
  return node.mappingStatus ?? (node.concept ? "mapped" : "unmapped");
}

export function classifyStep(
  status: MappingStatus,
  concept: string,
  targetOperations?: Set<string>
): StepClass {
  return status === "mapped" && targetOperations && !targetOperations.has(concept)
    ? "ontologyOnly"
    : status;
}

/**
 * Counts steps and coverage like the back end's buildMigrationReport (backend/src/analysis/
 * migrationReport.ts), so the modeler shows the numbers the report will show after saving.
 * Structural nodes are not steps.
 */
export function countSteps(
  nodeInfo: Record<string, ProcessTreeNodeInfo>,
  targetOperations?: Set<string>
): StepCounts {
  const nodes = Object.values(nodeInfo);
  const withStatus = (status: MappingStatus) => nodes.filter((n) => statusOf(n) === status);
  const mapped = withStatus("mapped");
  const unmapped = withStatus("unmapped").length;
  const manual = withStatus("manual").length;
  const steps = mapped.length + unmapped + manual;
  const share = (count: number) => (steps === 0 ? null : count / steps);

  const counts: StepCounts = {
    totals: {
      steps,
      mapped: mapped.length,
      unmapped,
      manual,
      structural: withStatus("structural").length,
    },
    coverage: { ontology: share(mapped.length) },
  };
  if (targetOperations) {
    const generated = mapped.filter((n) => targetOperations.has(n.concept)).length;
    counts.totals.ontologyOnly = mapped.length - generated;
    counts.coverage.target = share(generated);
  }
  return counts;
}
