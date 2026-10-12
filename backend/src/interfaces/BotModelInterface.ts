interface IBotModel {
  name: string;
  description?: string;
  model: string;
  processTree: string;
}

/**
 * How an imported activity relates to the ontology:
 * - mapped: concept is an ontology operation
 * - unmapped: no ontology operation fits (concept is "")
 * - structural: a construct that only shapes the tree (e.g. an app scope without a context container)
 * - manual: needs human redesign (custom code, error handling, orchestration)
 */
export type MappingStatus = "mapped" | "unmapped" | "structural" | "manual";

/** Where an imported node came from in the source RPA tool. */
export interface IProcessTreeNodeSource {
  vendor: "UiPath";
  activityType: string;
  displayName?: string;
  /** Workflow file, relative to the project root. */
  file: string;
  /** Application context the activity runs in, e.g. "browser", "excel", "sap". */
  context?: string;
  /** Condition or value expression, kept as source text. */
  expression?: string;
  /** URL, file path or selector the activity targets. */
  target?: string;
  /** Why the node needs manual work, for mappingStatus "manual". */
  reason?: string;
}

export interface IProcessTreeNodeInfo {
  label: string;
  concept: string;
  source?: IProcessTreeNodeSource;
  mappingStatus?: MappingStatus;
}
export type IProcessTreeStructure = Record<
  string,
  (string | IProcessTreeStructure)[]
>;

export interface IProcessTree {
  tree: IProcessTreeStructure;
  nodeInfo: Record<string, IProcessTreeNodeInfo>;
}

export default IBotModel;
