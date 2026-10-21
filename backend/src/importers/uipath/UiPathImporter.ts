import path from "path";
import {
  IProcessTree,
  IProcessTreeNodeInfo,
  IProcessTreeNodeSource,
  IProcessTreeStructure,
  MappingStatus,
} from "../../interfaces/BotModelInterface";
import {
  AppContext,
  isUiActivity,
  loopOperationOf,
  mapActivity,
  scopeOf,
  uiContextOfSelector,
} from "./uipathActivityMapping";
import { getArgument, readXaml, XAML_NAMESPACE, XamlExpression, XamlNode } from "./xamlReader";

type TreeItem = string | IProcessTreeStructure;

export interface CatchInfo {
  file: string;
  /** DisplayName of the TryCatch activity. */
  tryCatch: string;
  /** Caught exception types, e.g. "ui:BusinessRuleException". */
  exceptionTypes: string[];
}

/** Something found in the bot that is not represented as a node in the process tree. */
export interface ImportNote {
  file: string;
  activityType: string;
  displayName?: string;
  reason: string;
}

export interface REFrameworkInfo {
  /** Workflows the Initialization state invokes besides the framework's own, e.g. InitAllApplications. */
  initFiles: string[];
  /** Workflows the Process Transaction state invokes: the business logic, run once per transaction. */
  processFiles: string[];
  /** Workflows the End Process state invokes besides the framework's own, e.g. CloseAllApplications. */
  closeFiles: string[];
  /** Config.xlsx / Config.json files (settings, assets and queue names). */
  configFiles: string[];
  /** Framework workflows that map to the Power Automate work-queue pattern instead of being imported. */
  frameworkFiles: string[];
}

export interface UiPathProjectInfo {
  vendor: "UiPath";
  main: string;
  expressionLanguage?: string;
  targetFramework?: string;
  studioVersion?: string;
  /** Activity packages from project.json, e.g. { "UiPath.Excel.Activities": "[3.2.1]" }. */
  dependencies: Record<string, string>;
  /** All workflow files in the project. */
  workflowFiles: string[];
  /** Workflow files reached from the entry point. */
  importedFiles: string[];
  /** Invoked workflow files that are not part of the project. */
  missingFiles: string[];
  reframework?: REFrameworkInfo;
  catches: CatchInfo[];
  notes: ImportNote[];
  /** UI activities that use a selector or target element. */
  selectorCount: number;
}

export interface UiPathImportResult {
  name: string;
  description?: string;
  processTree: IProcessTree;
  source: UiPathProjectInfo;
}

const REFRAMEWORK_STATES = [
  "Initialization",
  "Get Transaction Data",
  "Process Transaction",
  "End Process",
];

/** REFramework's own workflows (settings, queue handling, retries, cleanup), also when renamed with a prefix. */
const REFRAMEWORK_PLUMBING =
  /(^|[/\s._-])(InitAllSettings|KillAllProcesses|GetTransactionData|SetTransactionStatus|RetryCurrentTransaction|TakeScreenshot)\.xaml$/i;

// Elements that hold data, not activities, when they appear as element children.
const DATA_ELEMENTS = new Set([
  "InArgument",
  "OutArgument",
  "InOutArgument",
  "Literal",
  "DelegateInArgument",
  "DelegateOutArgument",
  "Variable",
]);

interface Scope {
  file: string;
  /** Innermost UI scope (browser, desktop app, SAP). */
  ui?: AppContext;
  /** Innermost API scope (Excel, Outlook, Word, mail). */
  api?: AppContext;
  /** Workflow files on the current invoke path, for the cycle guard. */
  stack: string[];
}

/**
 * Imports a UiPath project into an ontology-based process tree.
 *
 * @param files - file contents by path; paths may include a top-level folder and use either slash
 * @param options.name - bot name to use when the project has no project.json
 */
export function importProject(
  files: Record<string, string>,
  options: { name?: string } = {}
): UiPathImportResult {
  return new UiPathImporter(files).import(options.name);
}

class UiPathImporter {
  private files: Record<string, string>;
  private nodeInfo: Record<string, IProcessTreeNodeInfo> = {};
  private counters: Record<string, number> = {};
  private info: UiPathProjectInfo;

  constructor(rawFiles: Record<string, string>) {
    this.files = relativeToProjectRoot(rawFiles);
    const workflowFiles = Object.keys(this.files)
      .filter((file) => file.toLowerCase().endsWith(".xaml"))
      .sort();
    this.info = {
      vendor: "UiPath",
      main: "",
      dependencies: {},
      workflowFiles,
      importedFiles: [],
      missingFiles: [],
      catches: [],
      notes: [],
      selectorCount: 0,
    };
  }

  import(fallbackName?: string): UiPathImportResult {
    const project = this.readProjectJson();
    const main = this.findMain(project.main);
    this.info.main = main || "";
    this.info.expressionLanguage = project.expressionLanguage;
    this.info.targetFramework = project.targetFramework;
    this.info.studioVersion = project.studioVersion;
    this.info.dependencies = project.dependencies || {};

    let items: TreeItem[] = [];
    if (main) {
      const mainRoot = this.parse(main);
      items =
        mainRoot && this.isREFramework(mainRoot)
          ? this.importREFramework(main, mainRoot)
          : this.convertFile(main, { file: main, stack: [] });
    }

    this.info.importedFiles.sort();
    return {
      name: project.name || fallbackName || "UiPath bot",
      description: project.description,
      processTree: {
        tree: { Process: [asBranch(items)] },
        nodeInfo: this.nodeInfo,
      },
      source: this.info,
    };
  }

  // ==============
  // PROJECT LEVEL

  private readProjectJson(): {
    name?: string;
    description?: string;
    main?: string;
    expressionLanguage?: string;
    targetFramework?: string;
    studioVersion?: string;
    dependencies?: Record<string, string>;
  } {
    const content = this.files["project.json"];
    if (!content) {
      return {};
    }
    try {
      return JSON.parse(content.replace(/^﻿/, ""));
    } catch {
      this.info.notes.push({
        file: "project.json",
        activityType: "project.json",
        reason: "project.json is not valid JSON",
      });
      return {};
    }
  }

  private findMain(declaredMain?: string): string | undefined {
    const candidates = [declaredMain, "Main.xaml"]
      .filter((file): file is string => !!file)
      .map(normalizePath);
    const found = candidates.find((file) => file in this.files);
    if (found) {
      return found;
    }
    return this.info.workflowFiles.length === 1
      ? this.info.workflowFiles[0]
      : undefined;
  }

  private parse(file: string): XamlNode | undefined {
    try {
      return readXaml(this.files[file]);
    } catch {
      return undefined;
    }
  }

  // ===========
  // REFRAMEWORK

  private isREFramework(mainRoot: XamlNode): boolean {
    const stateMachine = mainRoot.children.find((n) => n.name === "StateMachine");
    if (stateMachine) {
      const stateNames = findAll(stateMachine, (n) => n.name === "State").map(
        (state) => state.displayName
      );
      if (REFRAMEWORK_STATES.filter((s) => stateNames.includes(s)).length >= 3) {
        return true;
      }
    }
    return (
      "Framework/GetTransactionData.xaml" in this.files &&
      "Framework/SetTransactionStatus.xaml" in this.files
    );
  }

  /**
   * REFramework is imported as a platform pattern: the applications are opened, the business
   * logic in Process.xaml runs once per transaction, and the applications are closed. The
   * remaining framework (queue handling, retries, config) maps to the Power Automate
   * work-queue pattern and is listed in the project info instead of being imported.
   */
  private importREFramework(main: string, mainRoot: XamlNode): TreeItem[] {
    const literalInvokes = (nodes: XamlNode[]) =>
      nodes
        .flatMap((node) => findAll(node, (n) => n.name === "InvokeWorkflowFile"))
        .map((n) => getArgument(n, "WorkflowFileName"))
        .filter((arg) => arg && arg.language === "Literal")
        .map((arg) => normalizePath(arg!.text));
    const invoked = literalInvokes([mainRoot]);
    // Prefer what each state invokes; fall back to the template's file names (also with a prefix,
    // e.g. "10.e Process.xaml") for projects without the standard states.
    const states = findAll(mainRoot, (n) => n.name === "State");
    const invokedIn = (stateName: string, fileName: string): string[] => {
      const state = states.find((s) => s.displayName === stateName);
      if (state) {
        const files = literalInvokes([...(state.slots.Entry || []), ...(state.slots.Exit || [])]);
        return Array.from(new Set(files)).filter((file) => !REFRAMEWORK_PLUMBING.test(file));
      }
      const named = new RegExp(`(^|[\\s._-])${fileName.replace(".", "\\.")}$`, "i");
      const file =
        invoked.find((f) => named.test(path.posix.basename(f))) ??
        [`Framework/${fileName}`, fileName].find((f) => f in this.files);
      return file ? [file] : [];
    };

    const initFiles = invokedIn("Initialization", "InitAllApplications.xaml");
    const processFiles = invokedIn("Process Transaction", "Process.xaml");
    const closeFiles = invokedIn("End Process", "CloseAllApplications.xaml");

    const configFiles = Object.keys(this.files).filter((file) =>
      /(^|\/)Config\.(xlsx|json)$/i.test(file)
    );
    findAll(mainRoot, (n) => n.attributes["x:Key"] === "in_ConfigFile")
      .map((n) => n.text && normalizePath(n.text))
      .forEach((file) => file && !configFiles.includes(file) && configFiles.push(file));

    const imported = new Set([main, ...initFiles, ...processFiles, ...closeFiles]);
    this.info.reframework = {
      initFiles,
      processFiles,
      closeFiles,
      configFiles,
      frameworkFiles: this.info.workflowFiles.filter(
        (file) =>
          (file.startsWith("Framework/") || REFRAMEWORK_PLUMBING.test(file)) && !imported.has(file)
      ),
    };
    this.info.importedFiles.push(main);

    const scope: Scope = { file: main, stack: [main] };
    const convertAll = (files: string[]) => files.flatMap((file) => this.convertFile(file, scope));
    const items: TreeItem[] = convertAll(initFiles);
    const loopId = this.addNode("Loop", "Process each transaction", "", "structural", {
      vendor: "UiPath",
      activityType: "REFramework.TransactionLoop",
      file: main,
      reason: "REFramework transaction loop: maps to a Power Automate work queue",
    });
    items.push({ [loopId]: [asBranch(convertAll(processFiles))] });
    items.push(...convertAll(closeFiles));
    return items;
  }

  // ==============
  // WORKFLOW FILES

  private convertFile(file: string, caller: Scope): TreeItem[] {
    if (caller.stack.includes(file)) {
      return [this.manualNode(caller, "InvokeWorkflowFile", file, `Recursive invoke of ${file}`)];
    }
    if (!(file in this.files)) {
      if (!this.info.missingFiles.includes(file)) {
        this.info.missingFiles.push(file);
      }
      return [this.manualNode(caller, "InvokeWorkflowFile", file, `Invoked workflow not found: ${file}`)];
    }
    const root = this.parse(file);
    if (!root) {
      return [this.manualNode(caller, "InvokeWorkflowFile", file, `Could not parse ${file}`)];
    }
    if (!this.info.importedFiles.includes(file)) {
      this.info.importedFiles.push(file);
    }
    return this.convertActivities(root.children, {
      ...caller,
      file,
      stack: [...caller.stack, file],
    });
  }

  private convertActivities(nodes: XamlNode[], scope: Scope): TreeItem[] {
    return nodes.filter(isActivity).flatMap((node) => this.convertActivity(node, scope));
  }

  private convertActivity(node: XamlNode, scope: Scope): TreeItem[] {
    switch (node.name) {
      case "Sequence":
      case "SequenceX":
      case "ActivityAction":
      case "ActivityFunc":
        return this.convertActivities(node.children, scope);

      case "If":
        return [
          this.gateway("BinaryDecision", node, scope, getArgument(node, "Condition"), () => [
            this.convertActivities(node.slots.Then || [], scope),
            this.convertActivities(node.slots.Else || [], scope),
          ]),
        ];

      // Check App State decides on whether a UI element appears; without steps in either
      // branch it only checks or waits, and is mapped as a leaf
      case "NCheckState": {
        const branches = [node.slots.IfExists || [], node.slots.IfNotExists || []];
        if (branches.some(hasSteps)) {
          const condition: XamlExpression = { text: "the target UI element appears", language: "Literal" };
          return [
            this.gateway("BinaryDecision", node, scope, condition, () =>
              branches.map((branch) => this.convertActivities(branch, scope))
            ),
          ];
        }
        break;
      }

      case "Switch":
        return [
          this.gateway(
            "CaseDecision",
            node,
            scope,
            getArgument(node, "Expression"),
            () =>
              [...node.children.filter(isActivity), ...(node.slots.Default || [])].map((branch) =>
                this.convertActivity(branch, scope)
              )
          ),
        ];

      case "Parallel":
        return [
          this.gateway(
            "ParallelSplit",
            node,
            scope,
            undefined,
            () => node.children.filter(isActivity).map((branch) => this.convertActivity(branch, scope))
          ),
        ];

      case "TryCatch":
        return this.convertTryCatch(node, scope);

      case "RetryScope":
        this.note(node, scope, "Retry Scope: retry policy is not migrated");
        return this.convertActivities(bodyOf(node), scope);

      case "InvokeWorkflowFile":
        return this.convertInvoke(node, scope);

      case "Flowchart":
        return new FlowchartConverter(this, node, scope).convert();

      case "StateMachine":
        return this.convertStateMachine(node, scope);
    }

    const loopOperation = loopOperationOf(node.name);
    if (loopOperation) {
      const expression =
        getArgument(node, "Condition") ??
        getArgument(node, "Values") ??
        getArgument(node, "DataTable") ??
        getArgument(node, "Range");
      const loopId = this.addNode("Loop", label(node), loopOperation, "mapped", {
        ...this.sourceOf(node, scope),
        expression: expression?.text,
        expressionLanguage: expression?.language,
      });
      return [{ [loopId]: [asBranch(this.convertActivities(bodyOf(node), scope))] }];
    }

    const appScope = scopeOf(node);
    if (appScope) {
      this.countSelectors(node);
      const inner: Scope = { ...scope, [appScope.kind]: appScope.app };
      const nodeId = this.addNode(
        "Activity",
        label(node),
        appScope.container || "",
        appScope.container ? "mapped" : "structural",
        {
          ...this.sourceOf(node, scope),
          context: appScope.app,
          target: appScope.target?.text,
          targetLanguage: appScope.target?.language,
        }
      );
      return [{ [nodeId]: [asBranch(this.convertActivities(bodyOf(node), inner))] }];
    }

    return this.convertLeaf(node, scope);
  }

  private convertLeaf(node: XamlNode, enclosing: Scope): TreeItem[] {
    // A UI activity outside any UI scope (e.g. a classic Click with a full selector) acts on the
    // application its own selector names
    const selectorContext =
      !enclosing.ui && isUiActivity(node) ? uiContextOfSelector(node) : undefined;
    const scope = selectorContext ? { ...enclosing, ui: selectorContext } : enclosing;
    const result = mapActivity(node.name, { ui: scope.ui, api: scope.api });
    if (result.status === "ignore") {
      return [];
    }
    this.countSelectors(node);

    const source: IProcessTreeNodeSource = {
      ...this.sourceOf(node, scope),
      ...withExpression(expressionOf(node)),
      ...withTarget(targetOf(node)),
    };
    if (result.status === "manual") {
      source.reason = result.reason;
    }
    const nodeId = this.addNode(
      "Activity",
      label(node),
      result.status === "mapped" ? result.operation : "",
      result.status,
      source
    );

    // Unknown activities can still wrap a body of activities (e.g. a custom scope).
    const body = bodyOf(node);
    if (body.length > 0) {
      return [{ [nodeId]: [asBranch(this.convertActivities(body, scope))] }];
    }
    return [nodeId];
  }

  private convertTryCatch(node: XamlNode, scope: Scope): TreeItem[] {
    const catches = (node.slots.Catches || []).filter((n) => n.name === "Catch");
    if (catches.length > 0) {
      this.info.catches.push({
        file: scope.file,
        tryCatch: label(node),
        exceptionTypes: catches.map((c) => c.attributes["x:TypeArguments"] || "Exception"),
      });
    }
    return [
      ...this.convertActivities(node.slots.Try || [], scope),
      ...this.convertActivities(node.slots.Finally || [], scope),
    ];
  }

  private convertInvoke(node: XamlNode, scope: Scope): TreeItem[] {
    const fileName = getArgument(node, "WorkflowFileName");
    if (!fileName || fileName.language !== "Literal") {
      return [
        this.manualNode(
          scope,
          node.name,
          label(node),
          "Invoked workflow path is an expression",
          fileName?.text
        ),
      ];
    }
    return this.convertFile(normalizePath(fileName.text), scope);
  }

  /** States are imported in discovery order; transitions need manual redesign. */
  private convertStateMachine(node: XamlNode, scope: Scope): TreeItem[] {
    const names = new Map<string, XamlNode>();
    findAll(node, (n) => n.name === "State" && !!n.attributes["x:Name"]).forEach((state) =>
      names.set(state.attributes["x:Name"], state)
    );
    const resolve = (n: XamlNode) => (n.name === "Reference" ? names.get(n.text || "") : n);

    const ordered: XamlNode[] = [];
    const visit = (state: XamlNode | undefined) => {
      if (!state || ordered.includes(state)) {
        return;
      }
      ordered.push(state);
      for (const transition of state.slots.Transitions || []) {
        (transition.slots.To || []).forEach((to) => visit(resolve(to)));
      }
    };
    const initial = node.slots.InitialState?.[0];
    visit(
      initial
        ? resolve(initial)
        : names.get(referenceName(node.attributes.InitialState) || "")
    );
    node.children.forEach((child) => visit(resolve(child)));

    return [
      this.manualNode(scope, node.name, label(node), "State machine transitions need manual redesign"),
      ...ordered.flatMap((state) => [
        ...this.convertActivities(state.slots.Entry || [], scope),
        ...this.convertActivities(state.slots.Exit || [], scope),
      ]),
    ];
  }

  // =======
  // HELPERS

  /** Adds a gateway; branches are converted afterwards so that ids follow document order. */
  gateway(
    concept: string,
    node: XamlNode,
    scope: Scope,
    expression: XamlExpression | undefined,
    convertBranches: () => TreeItem[][]
  ): IProcessTreeStructure {
    const gatewayId = this.addNode("Gateway", label(node, expression?.text), concept, "mapped", {
      ...this.sourceOf(node, scope),
      ...withExpression(expression),
    });
    return { [gatewayId]: convertBranches().map(asBranch) };
  }

  manualNode(
    scope: Scope,
    activityType: string,
    displayName: string,
    reason: string,
    expression?: string
  ): string {
    return this.addNode("Activity", displayName, "", "manual", {
      vendor: "UiPath",
      activityType,
      displayName,
      file: scope.file,
      context: scope.api ?? scope.ui,
      expression,
      reason,
    });
  }

  addNode(
    prefix: "Activity" | "Gateway" | "Loop",
    nodeLabel: string,
    concept: string,
    mappingStatus: MappingStatus,
    source: IProcessTreeNodeSource
  ): string {
    this.counters[prefix] = (this.counters[prefix] || 0) + 1;
    const nodeId = `${prefix}_${this.counters[prefix]}`;
    this.nodeInfo[nodeId] = {
      label: nodeLabel,
      concept,
      mappingStatus,
      source: withoutUndefined(source),
      imported: { concept, mappingStatus },
    };
    return nodeId;
  }

  sourceOf(node: XamlNode, scope: Scope): IProcessTreeNodeSource {
    return {
      vendor: "UiPath",
      activityType: node.name,
      displayName: node.displayName,
      file: scope.file,
      context: isUiActivity(node) ? scope.ui : scope.api ?? scope.ui,
    };
  }

  private note(node: XamlNode, scope: Scope, reason: string) {
    this.info.notes.push({
      file: scope.file,
      activityType: node.name,
      displayName: node.displayName,
      reason,
    });
  }

  private countSelectors(node: XamlNode) {
    if (node.slots.Target || node.attributes.Selector !== undefined) {
      this.info.selectorCount++;
    }
  }

  convertActivitiesFor(nodes: XamlNode[], scope: Scope): TreeItem[] {
    return this.convertActivities(nodes, scope);
  }
}

/**
 * Converts a Flowchart into a block-structured tree. Branches of a FlowDecision or FlowSwitch
 * run until the first node all branches reach (the join). A jump back to a node on the current
 * path is a loop, and a jump into another branch is unstructured; both become manual nodes.
 */
class FlowchartConverter {
  private named = new Map<string, XamlNode>();
  private emitted = new Set<XamlNode>();

  constructor(
    private importer: UiPathImporter,
    private flowchart: XamlNode,
    private scope: Scope
  ) {
    this.collect(flowchart);
  }

  convert(): TreeItem[] {
    const start =
      this.resolve(this.flowchart.slots.StartNode?.[0]) ??
      this.named.get(referenceName(this.flowchart.attributes.StartNode) || "");
    return this.walk(start, undefined, new Set());
  }

  private collect(node: XamlNode) {
    const flowNodes = [
      ...node.children,
      ...["StartNode", "Next", "True", "False", "Default"].flatMap((slot) => node.slots[slot] || []),
    ].filter((n) => ["FlowStep", "FlowDecision", "FlowSwitch"].includes(n.name));
    for (const flowNode of flowNodes) {
      if (flowNode.attributes["x:Name"]) {
        this.named.set(flowNode.attributes["x:Name"], flowNode);
      }
      this.collect(flowNode);
      if (flowNode.name === "FlowSwitch") {
        flowNode.children.forEach((c) => this.collect(c));
      }
    }
  }

  private resolve(node: XamlNode | undefined): XamlNode | undefined {
    if (!node) {
      return undefined;
    }
    return node.name === "Reference" ? this.named.get(node.text || "") : node;
  }

  private successors(node: XamlNode): (XamlNode | undefined)[] {
    switch (node.name) {
      case "FlowStep":
        return [this.resolve(node.slots.Next?.[0])];
      case "FlowDecision":
        return [this.resolve(node.slots.True?.[0]), this.resolve(node.slots.False?.[0])];
      case "FlowSwitch":
        return [
          ...node.children.map((c) => this.resolve(c)),
          this.resolve(node.slots.Default?.[0]),
        ];
      default:
        return [];
    }
  }

  private reach(start: XamlNode | undefined, path: Set<XamlNode>): XamlNode[] {
    const order: XamlNode[] = [];
    const queue = start ? [start] : [];
    while (queue.length > 0) {
      const node = queue.shift()!;
      if (order.includes(node) || path.has(node)) {
        continue;
      }
      order.push(node);
      this.successors(node).forEach((next) => next && queue.push(next));
    }
    return order;
  }

  private findJoin(starts: (XamlNode | undefined)[], path: Set<XamlNode>): XamlNode | undefined {
    const [first, ...others] = starts.map((start) => this.reach(start, path));
    return first.find((node) => others.every((reachable) => reachable.includes(node)));
  }

  private walk(start: XamlNode | undefined, stop: XamlNode | undefined, path: Set<XamlNode>): TreeItem[] {
    const items: TreeItem[] = [];
    let current = start;
    while (current && current !== stop) {
      if (path.has(current) || this.emitted.has(current)) {
        const kind = path.has(current) ? "loop back" : "jump";
        items.push(
          this.importer.manualNode(
            this.scope,
            "Flowchart",
            `Flowchart ${kind} to ${this.describe(current)}`,
            `Flowchart ${kind}: unstructured control flow needs manual redesign`
          )
        );
        break;
      }
      path.add(current);
      this.emitted.add(current);

      if (current.name === "FlowStep") {
        items.push(...this.importer.convertActivitiesFor(current.children, this.scope));
        current = this.successors(current)[0];
        continue;
      }

      const branchStarts = this.successors(current);
      const join = this.findJoin(branchStarts, path);
      const branchPath = new Set(path);
      const expression = getArgument(current, "Condition") ?? getArgument(current, "Expression");
      items.push(
        this.importer.gateway(
          current.name === "FlowDecision" ? "BinaryDecision" : "CaseDecision",
          current,
          this.scope,
          expression,
          () => branchStarts.map((branch) => this.walk(branch, join, new Set(branchPath)))
        )
      );
      current = join;
    }
    return items;
  }

  private describe(node: XamlNode): string {
    if (node.name === "FlowStep") {
      const action = node.children.find(isActivity);
      return action ? label(action) : "step";
    }
    return label(node);
  }
}

// =================
// PURE HELPERS

/** A branch of a gateway, loop or container: a single element, or a Flow of several. */
function asBranch(items: TreeItem[]): TreeItem {
  return items.length === 1 ? items[0] : { Flow: items };
}

function label(node: XamlNode, fallback?: string): string {
  return node.displayName || fallback || node.name;
}

function isActivity(node: XamlNode): boolean {
  return (
    node.namespace !== XAML_NAMESPACE &&
    !DATA_ELEMENTS.has(node.name) &&
    !(node.namespace.startsWith("clr-namespace:System") && !node.namespace.includes("Activities"))
  );
}

/** Whether the nodes contain an activity other than (empty) sequences and activity actions. */
function hasSteps(nodes: XamlNode[]): boolean {
  return nodes.some((n) =>
    n.name === "Sequence" || n.name === "ActivityAction" ? hasSteps(n.children) : isActivity(n)
  );
}

/** Activities nested in an activity's body: Body/ActivityBody slots (unwrapping ActivityAction) and content children. */
function bodyOf(node: XamlNode): XamlNode[] {
  const fromSlots = ["Body", "ActivityBody", "Action"]
    .flatMap((slot) => node.slots[slot] || [])
    .flatMap((n) => (n.name === "ActivityAction" || n.name === "ActivityFunc" ? n.children : [n]));
  return [...fromSlots, ...node.children].filter(isActivity);
}

function expressionOf(node: XamlNode): XamlExpression | undefined {
  if (node.name === "Assign") {
    const to = getArgument(node, "To");
    const value = getArgument(node, "Value");
    return to !== undefined
      ? { text: `${to.text} = ${value?.text ?? ""}`, language: value?.language ?? to.language }
      : undefined;
  }
  if (node.name === "MultipleAssign") {
    const operations = (node.slots.AssignOperations || []).flatMap((n) =>
      n.name === "AssignOperation" ? [n] : n.children.filter((c) => c.name === "AssignOperation")
    );
    const assignments = operations.map((op) => ({ to: getArgument(op, "To"), value: getArgument(op, "Value") }));
    return {
      text: assignments.map(({ to, value }) => `${to?.text ?? "?"} = ${value?.text ?? ""}`).join("; "),
      language: assignments.find(({ value }) => value && value.language !== "Literal")?.value?.language ?? "Literal",
    };
  }
  return getArgument(node, "Text") ?? getArgument(node, "Value") ?? getArgument(node, "Condition");
}

function targetOf(node: XamlNode): XamlExpression | undefined {
  for (const property of ["Url", "WorkbookPath", "FileName", "FilePath", "Path", "SheetName", "ProcessName"]) {
    const argument = getArgument(node, property);
    if (argument) {
      return argument;
    }
  }
  return undefined;
}

function withExpression(expression: XamlExpression | undefined): Partial<IProcessTreeNodeSource> {
  return expression ? { expression: expression.text, expressionLanguage: expression.language } : {};
}

function withTarget(target: XamlExpression | undefined): Partial<IProcessTreeNodeSource> {
  return target ? { target: target.text, targetLanguage: target.language } : {};
}

function findAll(node: XamlNode, predicate: (n: XamlNode) => boolean, found: XamlNode[] = []): XamlNode[] {
  if (predicate(node)) {
    found.push(node);
  }
  node.children.forEach((child) => findAll(child, predicate, found));
  Object.values(node.slots).forEach((slot) => slot.forEach((child) => findAll(child, predicate, found)));
  return found;
}

/** "{x:Reference __ReferenceID0}" → "__ReferenceID0" */
function referenceName(value: string | undefined): string | undefined {
  const match = /^\{x:Reference\s+([^}\s]+)\s*\}$/.exec(value || "");
  return match ? match[1] : undefined;
}

function normalizePath(file: string): string {
  return path.posix.normalize(file.replace(/\\/g, "/")).replace(/^(\.\/)+/, "");
}

/**
 * Makes paths relative to the project root: the folder of the top-most project.json,
 * or else the deepest folder that contains all workflow files.
 */
function relativeToProjectRoot(rawFiles: Record<string, string>): Record<string, string> {
  const files: Record<string, string> = {};
  for (const [file, content] of Object.entries(rawFiles)) {
    files[normalizePath(file).replace(/^\/+/, "")] = content;
  }

  const projectJsons = Object.keys(files)
    .filter((file) => path.posix.basename(file) === "project.json")
    .sort((a, b) => a.split("/").length - b.split("/").length);
  let root: string;
  if (projectJsons.length > 0) {
    root = path.posix.dirname(projectJsons[0]);
  } else {
    const dirs = Object.keys(files)
      .filter((file) => file.toLowerCase().endsWith(".xaml"))
      .map((file) => path.posix.dirname(file).split("/"));
    const common = dirs.length > 0 ? [...dirs[0]] : [];
    for (const dir of dirs) {
      let i = 0;
      while (i < common.length && common[i] === dir[i]) i++;
      common.length = i;
    }
    root = common.join("/") || ".";
  }
  if (root === ".") {
    return files;
  }

  const relative: Record<string, string> = {};
  for (const [file, content] of Object.entries(files)) {
    if (file.startsWith(root + "/")) {
      relative[file.slice(root.length + 1)] = content;
    }
  }
  return relative;
}

function withoutUndefined<T extends object>(value: T): T {
  const result: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (entry !== undefined) {
      result[key] = entry;
    }
  }
  return result as T;
}
