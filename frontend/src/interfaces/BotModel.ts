import defaultDiagram from "../resources/defaultDiagram";

interface BotModel {
  _id?: string;
  name: string;
  description?: string;
  /** BPMN diagram; empty for imported bots, which have only a process tree. */
  model: string;
  processTree: ProcessTree;
  /** Source project of an imported bot (see the back end's UiPathProjectInfo). */
  source?: BotModelSource;
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

export function stringifyBotModel(botModel: BotModel): BotModel {
  botModel.model = JSON.stringify(botModel.model);
  botModel.processTree = JSON.stringify(botModel.processTree);
  return botModel;
}

export function parseBotModel(botModel: BotModel): BotModel {
  // Imported bots have no diagram, and their process trees no data resources or variables
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

/** True for bots imported from another RPA tool, which have no BPMN diagram to open in the modeler. */
export function isImportedBot(botModel: BotModel): boolean {
  return !!botModel.source && !botModel.model;
}

export default BotModel;
