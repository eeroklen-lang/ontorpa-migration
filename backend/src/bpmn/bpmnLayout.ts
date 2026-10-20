import {
  IProcessTree,
  IProcessTreeNodeInfo,
  IProcessTreeStructure,
} from "../interfaces/BotModelInterface";
import { ontologyIndividuals } from "../utils/ontologyIndex";

type TreeItem = string | IProcessTreeStructure;

export interface Point {
  x: number;
  y: number;
}

export interface Bounds extends Point {
  width: number;
  height: number;
}

export type DiagramNodeType =
  | "task"
  | "subProcess"
  | "exclusiveGateway"
  | "parallelGateway"
  | "startEvent"
  | "endEvent";

/** A BPMN flow node with its place on the canvas. Steps keep their process tree id. */
export interface DiagramNode {
  id: string;
  type: DiagramNodeType;
  name?: string;
  /** Ontology operation, written as rpa:operation. */
  operation?: string;
  gatewayDirection?: "Diverging" | "Converging";
  /** Loop marker: "sequential" for for-each loops, "standard" for the others. */
  loop?: "standard" | "sequential";
  /** Sub-process the node lies in; undefined for the top level of the process. */
  parent?: string;
  bounds: Bounds;
  /** External label of a named gateway. */
  label?: Bounds;
}

export interface DiagramFlow {
  id: string;
  source: string;
  target: string;
  parent?: string;
  waypoints: Point[];
}

export interface Diagram {
  nodes: DiagramNode[];
  flows: DiagramFlow[];
}

const TASK_WIDTH = 100;
const TASK_HEIGHT = 80;
const GATEWAY_SIZE = 50;
const EVENT_SIZE = 36;
/** Space between consecutive nodes, and between stacked branches. */
const H_GAP = 50;
const V_GAP = 40;
/** Inside a sub-process: room for its name at the top and its loop marker at the bottom. */
const PADDING = 20;
const TITLE_HEIGHT = 30;
const BOTTOM_PADDING = 30;
const MIN_SUBPROCESS_WIDTH = 200;
/** Gateway labels sit above the gateway, up to three lines. */
const LABEL_WIDTH = 90;
const LABEL_LINE_HEIGHT = 14;
const LABEL_CHARS_PER_LINE = 15;
const LABEL_GAP = 5;
const ORIGIN: Point = { x: 100, y: 100 };

/**
 * Lays out a process tree as a BPMN diagram, left to right. The tree is block-structured, so
 * every part is a block that is measured first and placed afterwards: steps are tasks, gateways
 * get a matching join with the first branch on the main line and the others stacked below, and
 * scopes, containers and loops are expanded sub-processes sized to their content.
 */
export function layoutProcessTree(processTree: IProcessTree): Diagram {
  return new TreeLayout(processTree.nodeInfo || {}).layout(processTree.tree);
}

/** A part of the tree, measured; placing it adds its nodes and flows to the diagram. */
interface Block {
  width: number;
  height: number;
  /** Distance from the top of the block to the line on which flows enter and leave it. */
  axis: number;
  /** Places the block with its top-left corner at (x, y); returns its first and last node, if any. */
  place(x: number, y: number, parent: string | undefined): Ends | undefined;
}

interface Ends {
  first: string;
  last: string;
}

class TreeLayout {
  private nodes: DiagramNode[] = [];
  private flows: DiagramFlow[] = [];

  constructor(private nodeInfo: Record<string, IProcessTreeNodeInfo>) {}

  layout(tree: IProcessTreeStructure): Diagram {
    const body = this.sequence(tree.Process || []);
    this.framed("StartEvent_1", "EndEvent_1", body).place(ORIGIN.x, ORIGIN.y, undefined);
    return { nodes: this.nodes, flows: this.flows };
  }

  private block(item: TreeItem): Block {
    if (typeof item === "string") {
      return this.task(item);
    }
    const blocks = Object.entries(item).map(([key, children]) => this.keyed(key, children));
    return blocks.length === 1 ? blocks[0] : this.sequenceOf(blocks);
  }

  private keyed(key: string, children: TreeItem[]): Block {
    if (key === "Flow" || key === "Process") {
      return this.sequence(children);
    }
    const bpmoConcept = ontologyIndividuals[this.nodeInfo[key]?.concept || ""]?.bpmoConcept;
    if (
      key.includes("Gateway") ||
      bpmoConcept === "ExclusiveGateway" ||
      bpmoConcept === "ParallelGateway"
    ) {
      const type = bpmoConcept === "ParallelGateway" ? "parallelGateway" : "exclusiveGateway";
      return this.gateway(key, type, children);
    }
    return this.subProcess(key, children);
  }

  private task(id: string): Block {
    return {
      width: TASK_WIDTH,
      height: TASK_HEIGHT,
      axis: TASK_HEIGHT / 2,
      place: (x, y, parent) => {
        this.addNode(id, "task", { x, y, width: TASK_WIDTH, height: TASK_HEIGHT }, parent);
        return { first: id, last: id };
      },
    };
  }

  private event(id: string, type: "startEvent" | "endEvent"): Block {
    return {
      width: EVENT_SIZE,
      height: EVENT_SIZE,
      axis: EVENT_SIZE / 2,
      place: (x, y, parent) => {
        this.addNode(id, type, { x, y, width: EVENT_SIZE, height: EVENT_SIZE }, parent);
        return { first: id, last: id };
      },
    };
  }

  private sequence(items: TreeItem[]): Block {
    return this.sequenceOf(items.map((item) => this.block(item)));
  }

  /** Blocks one after another on a shared axis, connected by straight flows. */
  private sequenceOf(blocks: Block[]): Block {
    // Empty flows (e.g. an empty branch nested in a sequence) take no space
    const parts = blocks.filter((block) => block.width > 0);
    const axis = Math.max(0, ...parts.map((block) => block.axis));
    const below = Math.max(0, ...parts.map((block) => block.height - block.axis));
    const width =
      parts.reduce((sum, block) => sum + block.width, 0) +
      H_GAP * Math.max(0, parts.length - 1);

    return {
      width,
      height: axis + below,
      axis,
      place: (x, y, parent) => {
        let ends: Ends | undefined;
        let left = x;
        for (const part of parts) {
          const placed = part.place(left, y + axis - part.axis, parent);
          if (placed && ends) {
            this.addFlow(ends.last, placed.first, parent, [
              { x: left - H_GAP, y: y + axis },
              { x: left, y: y + axis },
            ]);
            ends = { first: ends.first, last: placed.last };
          } else if (placed) {
            ends = placed;
          }
          left += part.width + H_GAP;
        }
        return ends;
      },
    };
  }

  /** A body between a start and an end event, as inside the process and every sub-process. */
  private framed(startId: string, endId: string, body: Block): Block {
    return this.sequenceOf([this.event(startId, "startEvent"), body, this.event(endId, "endEvent")]);
  }

  /** A split gateway and its join; a gateway without branches gets one empty branch. */
  private gateway(
    id: string,
    type: "exclusiveGateway" | "parallelGateway",
    children: TreeItem[]
  ): Block {
    const branches = (children.length > 0 ? children : [{ Flow: [] }]).map((child) =>
      this.block(child)
    );
    const name = this.nodeInfo[id]?.label;
    const labelHeight = name
      ? LABEL_LINE_HEIGHT * Math.min(3, Math.ceil(name.length / LABEL_CHARS_PER_LINE))
      : 0;
    const axis = Math.max(
      GATEWAY_SIZE / 2 + (name ? LABEL_GAP + labelHeight : 0),
      branches[0].axis
    );

    // Branch tops relative to the block: the first branch on the axis, the others below it
    const tops: number[] = [];
    let bottom = 0;
    branches.forEach((branch, index) => {
      const top = index === 0 ? axis - branch.axis : bottom + V_GAP;
      tops.push(top);
      bottom = top + branch.height;
    });
    const width = GATEWAY_SIZE + H_GAP + Math.max(0, ...branches.map((b) => b.width)) + H_GAP + GATEWAY_SIZE;

    return {
      width,
      height: Math.max(bottom, axis + GATEWAY_SIZE / 2),
      axis,
      place: (x, y, parent) => {
        const axisY = y + axis;
        const joinId = `${id}_join`;
        const joinX = x + width - GATEWAY_SIZE;
        const gatewayY = axisY - GATEWAY_SIZE / 2;
        this.addNode(id, type, { x, y: gatewayY, width: GATEWAY_SIZE, height: GATEWAY_SIZE }, parent, {
          gatewayDirection: "Diverging",
          label: name
            ? {
                x: x + GATEWAY_SIZE / 2 - LABEL_WIDTH / 2,
                y: gatewayY - LABEL_GAP - labelHeight,
                width: LABEL_WIDTH,
                height: labelHeight,
              }
            : undefined,
        });
        this.addNode(joinId, type, { x: joinX, y: gatewayY, width: GATEWAY_SIZE, height: GATEWAY_SIZE }, parent, {
          gatewayDirection: "Converging",
        });

        const branchLeft = x + GATEWAY_SIZE + H_GAP;
        const splitBottom = { x: x + GATEWAY_SIZE / 2, y: axisY + GATEWAY_SIZE / 2 };
        const joinBottom = { x: joinX + GATEWAY_SIZE / 2, y: axisY + GATEWAY_SIZE / 2 };
        branches.forEach((branch, index) => {
          const ends = branch.place(branchLeft, y + tops[index], parent);
          const branchRight = branchLeft + branch.width;
          if (index === 0) {
            // Straight along the axis
            if (ends) {
              this.addFlow(id, ends.first, parent, [{ x: x + GATEWAY_SIZE, y: axisY }, { x: branchLeft, y: axisY }]);
              this.addFlow(ends.last, joinId, parent, [{ x: branchRight, y: axisY }, { x: joinX, y: axisY }]);
            } else {
              this.addFlow(id, joinId, parent, [{ x: x + GATEWAY_SIZE, y: axisY }, { x: joinX, y: axisY }]);
            }
            return;
          }
          // Down from the split, along the branch's own line, and up into the join
          const laneY = y + tops[index] + branch.axis;
          if (ends) {
            this.addFlow(id, ends.first, parent, [splitBottom, { x: splitBottom.x, y: laneY }, { x: branchLeft, y: laneY }]);
            this.addFlow(ends.last, joinId, parent, [{ x: branchRight, y: laneY }, { x: joinBottom.x, y: laneY }, joinBottom]);
          } else {
            this.addFlow(id, joinId, parent, [
              splitBottom,
              { x: splitBottom.x, y: laneY },
              { x: joinBottom.x, y: laneY },
              joinBottom,
            ]);
          }
        });
        return { first: id, last: joinId };
      },
    };
  }

  /** An expanded sub-process with its own start and end event around the body. */
  private subProcess(id: string, children: TreeItem[]): Block {
    const inner = this.framed(`${id}_start`, `${id}_end`, this.sequence(children));
    const width = Math.max(MIN_SUBPROCESS_WIDTH, PADDING + inner.width + PADDING);
    const height = TITLE_HEIGHT + inner.height + BOTTOM_PADDING;
    return {
      width,
      height,
      axis: TITLE_HEIGHT + inner.axis,
      place: (x, y, parent) => {
        this.addNode(id, "subProcess", { x, y, width, height }, parent, { loop: this.loopOf(id) });
        // Centred, as a sub-process is at least MIN_SUBPROCESS_WIDTH wide
        inner.place(x + Math.round((width - inner.width) / 2), y + TITLE_HEIGHT, id);
        return { first: id, last: id };
      },
    };
  }

  private loopOf(id: string): DiagramNode["loop"] {
    const concept = this.nodeInfo[id]?.concept;
    if (concept === "ForEachLoop") {
      return "sequential";
    }
    // Loop_ ids without a loop operation are imported loops, e.g. REFramework's transaction loop
    if (concept === "ConditionalLoop" || id.startsWith("Loop")) {
      return "standard";
    }
    return undefined;
  }

  private addNode(
    id: string,
    type: DiagramNodeType,
    bounds: Bounds,
    parent: string | undefined,
    extra: Partial<DiagramNode> = {}
  ) {
    const info = this.nodeInfo[id];
    this.nodes.push({
      id,
      type,
      name: info?.label || undefined,
      operation: info?.concept || undefined,
      parent,
      bounds,
      ...extra,
    });
  }

  private addFlow(source: string, target: string, parent: string | undefined, waypoints: Point[]) {
    this.flows.push({ id: `Flow_${this.flows.length + 1}`, source, target, parent, waypoints });
  }
}
