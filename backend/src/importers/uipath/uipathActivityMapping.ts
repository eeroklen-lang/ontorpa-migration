import { getArgument, XamlExpression, XamlNode } from "./xamlReader";

/** Application an activity runs in, derived from the enclosing scopes. */
export type AppContext =
  | "browser"
  | "excel"
  | "outlook"
  | "mail"
  | "word"
  | "sap"
  | "desktop";

/**
 * Applications from the enclosing scopes. UI activities target the innermost UI scope
 * (browser, desktop app, SAP) even inside an API scope such as "Use Excel File", so the two
 * are tracked separately.
 */
export interface MappingContext {
  /** Innermost UI automation scope: "browser", "desktop" or "sap". */
  ui?: AppContext;
  /** Innermost API scope: "excel", "outlook", "mail" or "word". */
  api?: AppContext;
}

export type MappingResult =
  | { status: "mapped"; operation: string }
  | { status: "unmapped" }
  | { status: "manual"; reason: string }
  | { status: "ignore" };

type Rule = MappingResult | ((context: MappingContext) => MappingResult);

const mapped = (operation: string): MappingResult => ({ status: "mapped", operation });
const unmapped: MappingResult = { status: "unmapped" };
const ignore: MappingResult = { status: "ignore" };
const manual = (reason: string): MappingResult => ({ status: "manual", reason });

const uiActivityTypes = new Set<string>();

/** A UI activity whose ontology operation depends on the UI scope it runs in. */
const ui = (operations: Partial<Record<AppContext, string>>): Rule => {
  const rule = ({ ui: app }: MappingContext) =>
    app && operations[app] ? mapped(operations[app]!) : unmapped;
  uiRules.add(rule);
  return rule;
};
const uiRules = new Set<Rule>();

/**
 * Desktop applications and SAP GUI share the software-independent human-interface operations;
 * the application stays in the step's source context.
 */
const onDesktop = (operation: string): Partial<Record<AppContext, string>> => ({
  desktop: operation,
  sap: operation,
});

/** An API activity whose ontology operation depends on the application scope it runs in. */
const api =
  (operations: Partial<Record<AppContext, string>>): Rule =>
  ({ api: app }) =>
    app && operations[app] ? mapped(operations[app]!) : unmapped;

/**
 * Leaf activities by local XAML element name (classic and modern UiPath activities).
 * Activities missing here are reported as unmapped, which makes them visible in the coverage report.
 */
const activityRules: Record<string, Rule> = {
  // UI automation, modern (uix) and classic (ui)
  NClick: ui({ browser: "BrowserClickButton", ...onDesktop("ClickElement") }),
  Click: ui({ browser: "BrowserClickButton", ...onDesktop("ClickElement") }),
  NTypeInto: ui({ browser: "BrowserInputText", ...onDesktop("TypeIntoElement") }),
  TypeInto: ui({ browser: "BrowserInputText", ...onDesktop("TypeIntoElement") }),
  TypeSecureText: ui({ browser: "BrowserInputText", ...onDesktop("TypeIntoElement") }),
  SetText: ui({ browser: "BrowserInputText", ...onDesktop("TypeIntoElement") }),
  NSetText: ui({ browser: "BrowserInputText", ...onDesktop("TypeIntoElement") }),
  NGetText: ui({ browser: "BrowserGetText" }),
  GetValue: ui({ browser: "BrowserGetText" }),
  GetFullText: ui({ browser: "BrowserGetText" }),
  GetVisibleText: ui({ browser: "BrowserGetText" }),
  NGetAttribute: ui({ browser: "BrowserGetAttribute" }),
  GetAttribute: ui({ browser: "BrowserGetAttribute" }),
  NCheck: ui({ browser: "BrowserSelectCheckbox" }),
  Check: ui({ browser: "BrowserSelectCheckbox" }),
  NSelectItem: ui({ browser: "BrowserSelectItem" }),
  SelectItem: ui({ browser: "BrowserSelectItem" }),
  SelectMultipleItems: ui({ browser: "BrowserSelectItems" }),
  NGoToUrl: mapped("BrowserOpenURL"),
  NNavigateBrowser: mapped("BrowserNavigate"),
  NavigateTo: mapped("BrowserOpenURL"),
  CloseTab: mapped("BrowserClose"),
  NCloseTab: mapped("BrowserClose"),
  CloseApplication: ui({ browser: "BrowserClose" }),
  CloseWindow: ui({ browser: "BrowserClose" }),
  // Keys, element checks and windows work the same in any application
  SendHotkey: mapped("PressKeys"),
  NKeyboardShortcuts: mapped("PressKeys"),
  UiElementExists: mapped("CheckElement"),
  ElementExists: mapped("CheckElement"),
  WaitUiElementAppear: mapped("CheckElement"),
  NCheckState: mapped("CheckElement"),
  MaximizeWindow: mapped("MaximizeWindow"),
  NExtractData: ui({ browser: "BrowserExtractTable" }),
  ExtractData: ui({ browser: "BrowserExtractTable" }),

  // Excel, modern (…X) and classic
  ReadCellValueX: mapped("ExcelReadCellValue"),
  ExcelReadCell: mapped("ExcelReadCellValue"),
  ReadCell: mapped("ExcelReadCellValue"),
  WriteCellX: mapped("ExcelWriteCellValue"),
  ExcelWriteCell: mapped("ExcelWriteCellValue"),
  WriteCell: mapped("ExcelWriteCellValue"),
  SaveExcelFileX: mapped("ExcelSaveWorkbook"),
  ExcelSaveWorkbook: mapped("ExcelSaveWorkbook"),
  SaveAsPdfX: mapped("ExcelExportPDF"),
  ExcelCloseWorkbook: mapped("ExcelClose"),
  ReadRangeX: mapped("ExcelReadRange"),
  ExcelReadRange: mapped("ExcelReadRange"),
  ReadRange: mapped("ExcelReadRange"),
  WriteRangeX: mapped("ExcelWriteRange"),
  ExcelWriteRange: mapped("ExcelWriteRange"),
  WriteRange: mapped("ExcelWriteRange"),
  AppendRange: mapped("ExcelWriteRange"),
  CopyPasteRangeX: mapped("ExcelCopyRange"),
  ExcelCopyPasteRange: mapped("ExcelCopyRange"),
  FilterX: mapped("ExcelFilterRange"),
  ExcelFilterTable: mapped("ExcelFilterRange"),
  CreateTableX: mapped("ExcelFormatAsTable"),
  ExcelCreateTable: mapped("ExcelFormatAsTable"),
  InsertSheetX: mapped("ExcelInsertSheet"),
  RenameSheetX: mapped("ExcelRenameSheet"),

  // Mail: the same modern activity serves Outlook and Gmail, so it depends on the scope
  SendOutlookMail: mapped("OutlookSendEmail"),
  GetOutlookMailMessages: mapped("OutlookGetEmails"),
  SendMailX: api({ outlook: "OutlookSendEmail" }),
  GetEmailListX: api({ outlook: "OutlookGetEmails" }),
  DeleteMailX: api({ outlook: "OutlookDeleteEmail" }),
  SaveMailAttachmentsX: api({ outlook: "OutlookSaveAttachments" }),

  // Mail over SMTP
  SendMail: mapped("SmtpSendEmail"),

  // Files and folders
  AppendLine: mapped("AppendPlainText"),
  WriteTextFile: mapped("CreateTextFile"),
  DeleteFileX: mapped("DeleteFile"),
  Delete: mapped("DeleteFile"),
  ReadTextFile: mapped("ReadTextFile"),
  ReadCsvFile: mapped("ReadCsvFile"),
  CopyFile: mapped("CopyFile"),
  CreateDirectory: mapped("CreateFolder"),
  PathExists: mapped("PathExists"),
  FileExistsX: mapped("PathExists"),
  FolderExistsX: mapped("PathExists"),

  // Variables, data tables, collections, text and JSON
  Assign: mapped("SetVariable"),
  MultipleAssign: mapped("SetVariable"),
  BuildDataTable: mapped("TableCreate"),
  AddDataRow: mapped("TableAddRow"),
  AddDataColumn: mapped("TableAddColumn"),
  FilterDataTable: mapped("TableFilter"),
  LookupDataTable: mapped("TableLookup"),
  GetRowItem: mapped("TableGetRowItem"),
  ClearDataTable: mapped("TableClear"),
  AddToCollection: mapped("ListAddItem"),
  Replace: mapped("StringReplace"),
  DeserializeJson: mapped("JsonParse"),
  DeserializeJsonArray: mapped("JsonParse"),

  // Databases and web services
  DatabaseConnect: mapped("DatabaseConnect"),
  ExecuteQuery: mapped("DatabaseRunQuery"),
  HttpClient: mapped("HttpRequest"),

  // System: waiting, processes, dialogs for attended bots, leaving a loop
  Delay: mapped("Wait"),
  StartProcess: mapped("StartProcess"),
  KillProcess: mapped("KillProcess"),
  MessageBox: mapped("ShowMessage"),
  InputDialog: mapped("AskForInput"),
  Break: mapped("ExitLoop"),

  // Logging and comments carry no behaviour to migrate
  LogMessage: ignore,
  WriteLine: ignore,
  Comment: ignore,
  CommentOut: ignore,
  AddLogFields: ignore,
  RemoveLogFields: ignore,
  // Only marks an element on screen while debugging
  Highlight: ignore,

  // Needs human redesign; out of scope for automatic migration
  InvokeCode: manual("Invoke Code: custom VB/C# code"),
  InvokeMethod: manual("Invoke Method: .NET call"),
  InvokePowerShell: manual("Invoke PowerShell: custom script"),
  Throw: manual("Error handling: Throw"),
  Rethrow: manual("Error handling: Rethrow"),
  TerminateWorkflow: manual("Error handling: Terminate Workflow"),
  ShouldStop: manual("Orchestration: stop signal"),
  GetQueueItem: manual("Orchestration: queue"),
  GetTransactionItem: manual("Orchestration: queue"),
  AddQueueItem: manual("Orchestration: queue"),
  AddTransactionItem: manual("Orchestration: queue"),
  SetTransactionStatus: manual("Orchestration: queue"),
  SetTransactionProgress: manual("Orchestration: queue"),
  GetRobotAsset: manual("Config and secrets: Orchestrator asset"),
  GetAsset: manual("Config and secrets: Orchestrator asset"),
  GetCredential: manual("Config and secrets: Orchestrator credential"),
  GetRobotCredential: manual("Config and secrets: Orchestrator credential"),
};

for (const [activityType, rule] of Object.entries(activityRules)) {
  if (uiRules.has(rule)) {
    uiActivityTypes.add(activityType);
  }
}

const UI_AUTOMATION_NAMESPACE = "http://schemas.uipath.com/workflow/activities/uix";
const CLASSIC_UI_ACTIVITIES = new Set([
  "Hover",
  "SendHotkey",
  "ExtractData",
  "ElementExists",
  "UiElementExists",
  "FindElement",
  "WaitUiElementAppear",
  "WaitUiElementVanish",
  "OnElementAppear",
  "TakeScreenshot",
  "SetFocus",
  "Highlight",
]);

/** True for activities that act on a UI element, so their context is the UI scope. */
export function isUiActivity(node: XamlNode): boolean {
  return (
    node.namespace === UI_AUTOMATION_NAMESPACE ||
    uiActivityTypes.has(node.name) ||
    CLASSIC_UI_ACTIVITIES.has(node.name)
  );
}

/**
 * The application a UI activity outside any UI scope acts on, from its own selector: a web page
 * (<html>, <webctrl>), SAP, or another desktop application (<wnd>, <ctrl>, …). Classic activities
 * keep the selector in Target, modern ones in TargetAnchorable. Undefined without a selector, or
 * when the selector is only a variable.
 */
export function uiContextOfSelector(node: XamlNode): AppContext | undefined {
  const target = node.slots.Target?.[0];
  const selectors = [
    arg(node, "Selector"),
    ...(target ? ["Selector", "ScopeSelectorArgument", "FullSelectorArgument"].map((p) => arg(target, p)) : []),
  ];
  const text = selectors.map((s) => s?.text || "").join(" ");
  if (!/<\w+[\s/>]/.test(text)) {
    return undefined;
  }
  return /<(html|webctrl)[\s/>]/i.test(text) ? "browser" : scopeForApplication(undefined, text).app;
}

/** Loop activities: collection loops map to ForEachLoop, condition loops to ConditionalLoop. */
const loopOperations: Record<string, string> = {
  ForEach: "ForEachLoop",
  ForEachRow: "ForEachLoop",
  ParallelForEach: "ForEachLoop",
  ExcelForEachRow: "ForEachLoop",
  ForEachRowX: "ForEachLoop",
  ForEachSheetX: "ForEachLoop",
  ForEachFileX: "ForEachLoop",
  ForEachFolderX: "ForEachLoop",
  OutlookForEachMail: "ForEachLoop",
  ForEachEmailX: "ForEachLoop",
  While: "ConditionalLoop",
  DoWhile: "ConditionalLoop",
  InterruptibleWhile: "ConditionalLoop",
  InterruptibleDoWhile: "ConditionalLoop",
};

/** The loop operation for a loop activity, or undefined if the activity is not a loop. */
export function loopOperationOf(activityType: string): string | undefined {
  return loopOperations[activityType];
}

export function mapActivity(
  activityType: string,
  context: MappingContext
): MappingResult {
  const rule = activityRules[activityType];
  if (!rule) {
    return unmapped;
  }
  return typeof rule === "function" ? rule(context) : rule;
}

/** Every ontology id the table can produce, for consistency checks against the ontology. */
export function mappedOperationIds(): string[] {
  const contexts: MappingContext[] = [
    {},
    ...(["browser", "excel", "outlook", "mail", "word", "sap", "desktop"] as AppContext[]).map(
      (app) => ({ ui: app, api: app })
    ),
  ];
  const ids = new Set<string>();
  for (const rule of Object.values(activityRules)) {
    for (const context of contexts) {
      const result = typeof rule === "function" ? rule(context) : rule;
      if (result.status === "mapped") {
        ids.add(result.operation);
      }
    }
  }
  scopeContainers.forEach((container) => ids.add(container));
  Object.values(loopOperations).forEach((loop) => ids.add(loop));
  return Array.from(ids);
}

// ================
// APPLICATION SCOPES

export interface ScopeInfo {
  app: AppContext;
  /** "ui" for scopes that UI activities act in (browser, desktop app, SAP), "api" for the others. */
  kind: "ui" | "api";
  /** Ontology context container that models the scope, if there is one. */
  container?: string;
  /** URL, workbook path or executable the scope targets. */
  target?: XamlExpression;
}

const scopeContainers = ["WithBrowser", "WithMicrosoftExcel"];

const SAP_PATTERN = /saplogon|sapgui|sap logon|SAP Easy Access/i;
const OUTLOOK_PATTERN = /outlook/i;

function scopeForApplication(
  target: XamlExpression | undefined,
  selector: string | undefined
): ScopeInfo {
  const text = `${target?.text || ""} ${selector || ""}`;
  if (/^https?:|^www\./i.test(target?.text || "") || /<html/i.test(selector || "")) {
    return { app: "browser", kind: "ui", container: "WithBrowser", target };
  }
  if (SAP_PATTERN.test(text)) {
    return { app: "sap", kind: "ui", target };
  }
  if (/excel\.exe/i.test(text)) {
    return { app: "excel", kind: "ui", target };
  }
  if (OUTLOOK_PATTERN.test(text)) {
    return { app: "outlook", kind: "ui", target };
  }
  if (/winword\.exe/i.test(text)) {
    return { app: "word", kind: "ui", target };
  }
  return { app: "desktop", kind: "ui", target };
}

function arg(node: XamlNode, property: string): XamlExpression | undefined {
  return getArgument(node, property);
}

/**
 * Returns scope information for activities that open or attach to an application and
 * run their body inside it, or undefined for other activities.
 */
export function scopeOf(node: XamlNode): ScopeInfo | undefined {
  switch (node.name) {
    // Browser
    case "OpenBrowser":
      return { app: "browser", kind: "ui", container: "WithBrowser", target: arg(node, "Url") };
    case "BrowserScope":
      return { app: "browser", kind: "ui", container: "WithBrowser", target: arg(node, "Selector") };
    // Modern "Use Application/Browser": the target app tells which one
    case "NApplicationCard": {
      const targetApp = node.slots.TargetApp?.[0];
      return scopeForApplication(
        targetApp && (arg(targetApp, "Url") || arg(targetApp, "FilePath")),
        targetApp && arg(targetApp, "Selector")?.text
      );
    }
    // Classic desktop application scopes
    case "OpenApplication":
      return scopeForApplication(arg(node, "FileName"), arg(node, "Selector")?.text);
    case "WindowScope":
    case "ElementScope":
      return scopeForApplication(undefined, arg(node, "Selector")?.text);
    case "SAPLogon":
    case "SAPLogin":
      return { app: "sap", kind: "ui" };
    // Excel; ExcelScope is a third-party scope that works like Excel Application Scope
    case "ExcelApplicationCard":
    case "ExcelApplicationScope":
    case "ExcelScope":
      return {
        app: "excel",
        kind: "api",
        container: "WithMicrosoftExcel",
        target: arg(node, "WorkbookPath") ?? arg(node, "FilePath"),
      };
    // Modern Excel Process Scope: the Use Excel File cards inside it are the containers
    case "ExcelProcessScopeX":
      return { app: "excel", kind: "api" };
    // Mail
    case "OutlookApplicationCard":
    case "OutlookMailMessagesScope":
      return { app: "outlook", kind: "api", target: arg(node, "Account") };
    case "GmailApplicationCard":
    case "GSuiteApplicationScope":
      return { app: "mail", kind: "api" };
    // Word
    case "WordApplicationScope":
    case "WordApplicationCard":
    case "WordScope":
      return { app: "word", kind: "api", target: arg(node, "FilePath") };
    default:
      return undefined;
  }
}
