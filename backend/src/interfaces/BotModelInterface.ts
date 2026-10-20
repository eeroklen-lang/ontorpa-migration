interface IBotModel {
  name: string;
  description?: string;
  /** BPMN diagram (JSON string of the XML); bots imported before diagrams were generated have none. */
  model?: string;
  /** Process tree (JSON string of IProcessTree). */
  processTree: string;
  /** For imported bots: information about the source project (JSON string). */
  source?: string;
  /** For imported bots: the migration report at import (JSON string), to compare fixes against. */
  importReport?: string;
}

/**
 * How an imported activity relates to the ontology:
 * - mapped: concept is an ontology operation
 * - unmapped: no ontology operation fits (concept is "")
 * - structural: a construct that only shapes the tree (e.g. an app scope without a context container)
 * - manual: needs human redesign (custom code, error handling, orchestration)
 */
export type MappingStatus = "mapped" | "unmapped" | "structural" | "manual";

/** Language of an imported expression; "Literal" for plain values such as a fixed URL. */
export type ExpressionLanguage = "VisualBasic" | "CSharp" | "Literal";

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
  expressionLanguage?: ExpressionLanguage;
  /** URL, file path or selector the activity targets. */
  target?: string;
  targetLanguage?: ExpressionLanguage;
  /** Why the node needs manual work, for mappingStatus "manual". */
  reason?: string;
}

export interface IProcessTreeNodeInfo {
  label: string;
  concept: string;
  source?: IProcessTreeNodeSource;
  mappingStatus?: MappingStatus;
  /** For imported nodes: the importer's result, kept when the bot is edited in the modeler. */
  imported?: { concept: string; mappingStatus: MappingStatus };
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
