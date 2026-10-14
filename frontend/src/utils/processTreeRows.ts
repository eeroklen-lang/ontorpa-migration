import {
  MappingStatus,
  ProcessTreeNodeInfo,
  ProcessTreeStructure,
} from "../interfaces/BotModel";

/** One line of a process tree as shown in the migration report. */
export interface ProcessTreeRow {
  depth: number;
  /** "node" for operations, gateways, loops and scopes; "branch" for the numbered branches of a gateway. */
  kind: "node" | "branch";
  status?: MappingStatus;
  /** Ontology operation, or the source activity type if there is none. */
  name: string;
  label: string;
  isLoop: boolean;
  /** Context, condition and reason for manual work. */
  details: string[];
}

/**
 * Flattens a process tree into rows with indentation depth. Flow nodes are transparent and
 * gateway branches get their own numbered rows, like the back end's command-line rendering.
 */
export function processTreeRows(
  tree: ProcessTreeStructure,
  nodeInfo: Record<string, ProcessTreeNodeInfo>
): ProcessTreeRow[] {
  const rows: ProcessTreeRow[] = [];

  const addItem = (item: string | ProcessTreeStructure, depth: number) => {
    if (typeof item === "string") {
      rows.push(nodeRow(item, nodeInfo[item], depth));
      return;
    }
    for (const key in item) {
      const children = item[key];
      if (key === "Flow" || key === "Process") {
        children.forEach((child) => addItem(child, depth));
        continue;
      }
      rows.push(nodeRow(key, nodeInfo[key], depth));
      if (key.includes("Gateway")) {
        children.forEach((branch, index) => {
          rows.push({
            depth: depth + 1,
            kind: "branch",
            name: `Branch ${index + 1}`,
            label: "",
            isLoop: false,
            details: [],
          });
          addItem(branch, depth + 2);
        });
      } else {
        children.forEach((child) => addItem(child, depth + 1));
      }
    }
  };

  addItem(tree, 0);
  return rows;
}

function nodeRow(
  nodeId: string,
  info: ProcessTreeNodeInfo | undefined,
  depth: number
): ProcessTreeRow {
  if (!info) {
    return { depth, kind: "node", name: nodeId, label: "", isLoop: false, details: [] };
  }
  const status: MappingStatus =
    info.mappingStatus ?? (info.concept ? "mapped" : "unmapped");
  const source = info.source;
  const details: string[] = [];
  if (status !== "mapped" && source?.context) {
    details.push(source.context);
  }
  if (nodeId.includes("Gateway") && source?.expression) {
    details.push(`if ${source.expression}`);
  }
  if (status === "manual" && source?.reason) {
    details.push(source.reason);
  }
  return {
    depth,
    kind: "node",
    status,
    name: info.concept || source?.activityType || nodeId,
    label: info.label,
    isLoop: nodeId.startsWith("Loop"),
    details,
  };
}
