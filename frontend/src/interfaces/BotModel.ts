import defaultDiagram from "../resources/defaultDiagram";

interface BotModel {
  _id?: string;
  name: string;
  description?: string;
  /** BPMN diagram; empty for bots imported before diagrams were generated. */
  model: string;
  processTree: ProcessTree;
  /** Source project of an imported bot (see the back end's UiPathProjectInfo). */
  source?: BotModelSource;
  /** Migration report at import, as a JSON string; the back end compares fixes against it. */
  importReport?: string;
}

export interface BotModelSource {
  vendor: string;
  main: string;
  expressionLanguage?: string;
  targetFramework?: string;
  dependencies: Record<string, string>;
  workflowFiles: string[];
  importedFiles: string[];
  missingFiles: string[];
  selectorCount: number;
}

/** How an imported step relates to the ontology. */
export type MappingStatus = "mapped" | "unmapped" | "structural" | "manual";

export interface ProcessTreeNodeSource {
  vendor: string;
  activityType: string;
  displayName?: string;
  file: string;
  context?: string;
  expression?: string;
  expressionLanguage?: string;
  target?: string;
  targetLanguage?: string;
  reason?: string;
}

export interface ProcessTree {
  tree: ProcessTreeStructure;
  nodeInfo: Record<string, ProcessTreeNodeInfo>;
  dataResourceInfo: Record<string, ProcessTreeNodeInfo>;
  transientDataInfo: Record<string, ProcessTreeNodeInfo>;
}

export interface ProcessTreeNodeInfo {
  label: string;
  concept: string;
  mappingStatus?: MappingStatus;
  source?: ProcessTreeNodeSource;
  /** For imported steps: the importer's result, kept when the bot is edited. */
  imported?: { concept: string; mappingStatus: MappingStatus };
  dataResourceInput?: string[];
  variableInput?: string[];
  dataResourceOutput?: string[];
  variableOutput?: string[];
}

export type ProcessTreeStructure = Record<
  string,
  (string | ProcessTreeStructure)[]
>;

export function createDefaultBotModel(): BotModel {
  return {
    name: "",
    model: defaultDiagram,
    processTree: {},
  };
}

/** A copy of the bot with the fields the back end stores as JSON strings encoded. */
export function stringifyBotModel(botModel: BotModel): BotModel {
  return {
    ...botModel,
    model: JSON.stringify(botModel.model),
    processTree: JSON.stringify(botModel.processTree) as unknown as ProcessTree,
    ...(botModel.source
      ? { source: JSON.stringify(botModel.source) as unknown as BotModelSource }
      : {}),
  };
}

export function parseBotModel(botModel: BotModel): BotModel {
  // Older imported bots have no diagram, and imported process trees no data resources or variables
  botModel.model = botModel.model ? JSON.parse(botModel.model) : "";
  botModel.processTree = {
    dataResourceInfo: {},
    transientDataInfo: {},
    ...JSON.parse(botModel.processTree as unknown as string),
  };
  if (typeof botModel.source === "string") {
    botModel.source = JSON.parse(botModel.source);
  }
  return botModel;
}

/** False for bots imported before diagrams were generated: they open in the migration report only. */
export function hasDiagram(botModel: BotModel): boolean {
  return !!botModel.model;
}

export default BotModel;
