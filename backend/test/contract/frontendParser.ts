// Contract tests run the front end's BPMN parser on diagrams the back end generates, so that a
// generated diagram survives being opened and saved in the modeler.
import BpmnModdle from "bpmn-moddle";
import BpmnModdleParser, {
  findStructureProblems,
  ProcessStructureProblem,
} from "../../../frontend/src/utils/BpmnModdleParser";
import rpaExtension from "../../../frontend/src/resources/rpaExtension.json";
import { IProcessTree } from "../../src/interfaces/BotModelInterface";

/**
 * Loads BPMN XML the way bpmn-js does, with the RPA extension; fails on import warnings. The
 * extension does not declare rpa:operation on tasks, gateways and sub-processes, so the modeler
 * keeps it as a generic attribute ($attrs) and moddle warns about it; that warning is expected.
 */
export async function readDiagram(xml: string): Promise<any> {
  const moddle = BpmnModdle({ rpa: rpaExtension });
  const { rootElement, warnings } = await moddle.fromXML(xml);
  const unexpected = warnings.filter(
    (w: any) => w.message !== "unknown attribute <rpa:operation>"
  );
  if (unexpected.length > 0) {
    throw new Error(`BPMN import warnings: ${unexpected.map((w: any) => w.message).join("; ")}`);
  }
  return rootElement;
}

/** Parses BPMN XML into a process tree with the modeler's parser, as saving in the modeler does. */
export async function parseDiagram(
  xml: string
): Promise<{ definitions: any; processTree: IProcessTree; problems: ProcessStructureProblem[] }> {
  const definitions = await readDiagram(xml);
  const processTree = new BpmnModdleParser().parseBpmnModdle(definitions);
  return {
    definitions,
    processTree: { tree: processTree.tree, nodeInfo: processTree.nodeInfo } as IProcessTree,
    problems: findStructureProblems(definitions, processTree),
  };
}
