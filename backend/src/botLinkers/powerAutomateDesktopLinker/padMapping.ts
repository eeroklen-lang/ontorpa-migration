import { IProcessTreeNodeSource } from "../../interfaces/BotModelInterface";

/**
 * Power Automate Desktop (PAD) actions for ontology operations, written in Robin, the text form
 * PAD uses when actions are copied out of or pasted into the flow designer.
 *
 * The action names follow PAD's Robin as copied from the designer, but they have not yet been
 * validated by pasting into PAD (`npm run pad:catalog`, see M6 in docs/PLAN.md). Operations
 * without a confident PAD equivalent are left out on purpose: the linker emits a TODO comment
 * for them, and the migration report counts them as "ontology-only". PAD has native actions for
 * some of them, whose Robin still has to be copied from the designer: CheckElement (wait for or
 * check a UI element), MaximizeWindow, BrowserExtractTable, the data table operations other than
 * TableGetRowItem, PathExists (If file/folder exists), HttpRequest and SmtpSendEmail.
 */

/** What a template gets to fill in its parameters. */
export interface PadStep {
  label: string;
  source?: IProcessTreeNodeSource;
}

export type PadTemplate = (step: PadStep) => string[];

/** Placeholder for a UI element: selectors have to be re-captured in PAD's UI element picker. */
export const UI_ELEMENT = "appmask['TODO']['TODO']";

/** A Robin text literal. Backslashes and quotes are escaped; %…% stays, as PAD reads it as an expression. */
export function text(value: string): string {
  return `$'''${value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'''`;
}

/** A single-line Robin comment. */
export function comment(value: string): string {
  return `# ${value.replace(/\s*[\r\n]+\s*/g, " ")}`;
}

/** A TODO comment naming the step, e.g. # TODO "Click Save": re-capture the UI element */
export function todo(step: PadStep, hint: string): string {
  return comment(`TODO "${step.label}": ${hint}`);
}

/** The step's target (URL or file path) as a Robin literal, or TODO with a hint if it is an expression. */
function targetOf(step: PadStep, what: string): { value: string; hints: string[] } {
  const source = step.source;
  if (source?.target && source.targetLanguage === "Literal") {
    return { value: text(source.target), hints: [] };
  }
  if (source?.target) {
    return { value: text("TODO"), hints: [`set the ${what}; UiPath uses ${source.target}`] };
  }
  return { value: text("TODO"), hints: [`set the ${what}`] };
}

/** The step's value as a Robin literal, or TODO with a hint if it is a VB/C# expression. */
function valueOf(step: PadStep): { value: string; hints: string[] } {
  const source = step.source;
  if (source?.expression !== undefined && source.expressionLanguage === "Literal") {
    return { value: text(source.expression), hints: [] };
  }
  if (source?.expression) {
    return { value: text("TODO"), hints: [`translate the value; UiPath uses ${source.expression}`] };
  }
  return { value: text("TODO"), hints: ["set the value"] };
}

/** Prefixes the action with a TODO comment if anything needs filling in. */
function withHints(step: PadStep, hints: string[], action: string): string[] {
  return hints.length > 0 ? [todo(step, hints.join("; ")), action] : [action];
}

const ELEMENT_HINT = "re-capture the UI element";

const padActions: Record<string, PadTemplate> = {
  // Browser
  BrowserOpen: (step) => {
    const url = targetOf(step, "URL");
    return withHints(
      step,
      url.hints,
      `WebAutomation.LaunchEdge.LaunchEdge Url: ${url.value} WindowState: WebAutomation.BrowserWindowState.Normal ClearCache: False ClearCookies: False WaitForPageToLoadTimeout: 60 Timeout: 60 BrowserInstance=> Browser`
    );
  },
  BrowserOpenURL: (step) => {
    const url = targetOf(step, "URL");
    return withHints(
      step,
      url.hints,
      `WebAutomation.GoToWebPage.GoToWebPage BrowserInstance: Browser Url: ${url.value} WaitForPageToLoadTimeout: 60`
    );
  },
  BrowserNavigate: (step) => [
    todo(step, "check the direction (back, forward or reload)"),
    "WebAutomation.GoToWebPage.GoBack BrowserInstance: Browser WaitForPageToLoadTimeout: 60",
  ],
  BrowserClose: () => ["WebAutomation.CloseWebBrowser BrowserInstance: Browser"],
  BrowserClickButton: (step) =>
    withHints(
      step,
      [ELEMENT_HINT],
      `WebAutomation.Click.Click BrowserInstance: Browser Control: ${UI_ELEMENT} WaitForPageToLoadTimeout: 60 MouseButton: WebAutomation.MouseClickType.LeftClick ClickType: WebAutomation.ClickType.SingleClick HoverMouseOverElement: True`
    ),
  BrowserInputText: (step) => {
    const value = valueOf(step);
    return withHints(
      step,
      [ELEMENT_HINT, ...value.hints],
      `WebAutomation.PopulateTextField.PopulateTextField BrowserInstance: Browser Control: ${UI_ELEMENT} Text: ${value.value} EmulateTyping: True UnfocusAfterPopulate: False Mode: WebAutomation.PopulateTextMode.Replace TimeoutInSeconds: 60`
    );
  },
  BrowserGetText: (step) =>
    withHints(
      step,
      [ELEMENT_HINT],
      `WebAutomation.GetDetailsOfElement.GetAttribute BrowserInstance: Browser Control: ${UI_ELEMENT} AttributeName: ${text("Own Text")} AttributeValue=> ElementText`
    ),
  BrowserGetAttribute: (step) =>
    withHints(
      step,
      [ELEMENT_HINT, "set the attribute name"],
      `WebAutomation.GetDetailsOfElement.GetAttribute BrowserInstance: Browser Control: ${UI_ELEMENT} AttributeName: ${text("TODO")} AttributeValue=> AttributeValue`
    ),
  BrowserSelectCheckbox: (step) =>
    withHints(
      step,
      [ELEMENT_HINT],
      `WebAutomation.SetCheckBoxState.SetCheckBoxState BrowserInstance: Browser Control: ${UI_ELEMENT} State: WebAutomation.CheckboxState.Checked`
    ),
  BrowserSelectItem: (step) => {
    const value = valueOf(step);
    return withHints(
      step,
      [ELEMENT_HINT, ...value.hints],
      `WebAutomation.SetDropDownListValue.SetDropDownListValueByName BrowserInstance: Browser Control: ${UI_ELEMENT} OptionNames: ${value.value} IsRegex: False`
    );
  },
  BrowserSelectItems: (step) =>
    withHints(
      step,
      [ELEMENT_HINT, "set the options"],
      `WebAutomation.SetDropDownListValue.SetDropDownListValueByName BrowserInstance: Browser Control: ${UI_ELEMENT} OptionNames: ${text("TODO")} IsRegex: False`
    ),

  // Excel
  ExcelOpen: () => ["Excel.LaunchExcel.LaunchUnderExistingProcess Visible: True Instance=> ExcelInstance"],
  ExcelCreateWorkbook: () => ["Excel.LaunchExcel.LaunchUnderExistingProcess Visible: True Instance=> ExcelInstance"],
  ExcelOpenWorkbook: (step) => {
    const path = targetOf(step, "workbook path");
    return withHints(
      step,
      path.hints,
      `Excel.LaunchExcel.LaunchAndOpenUnderExistingProcess Path: ${path.value} Visible: True ReadOnly: False Instance=> ExcelInstance`
    );
  },
  ExcelReadCellValue: (step) =>
    withHints(
      step,
      ["set the cell"],
      `Excel.ReadFromExcel.ReadCell Instance: ExcelInstance StartColumn: ${text("A")} StartRow: 1 ReadAsText: False CellValue=> ExcelCellValue`
    ),
  ExcelWriteCellValue: (step) => {
    const value = valueOf(step);
    return withHints(
      step,
      ["set the cell", ...value.hints],
      `Excel.WriteToExcel.WriteCell Instance: ExcelInstance Value: ${value.value} Column: ${text("A")} Row: 1`
    );
  },
  ExcelReadRange: () => [
    "Excel.ReadFromExcel.ReadAllCells Instance: ExcelInstance ReadAsText: False FirstLineIsHeader: True RangeValue=> ExcelData",
  ],
  ExcelWriteRange: (step) => [
    todo(step, "check the table variable and the start cell"),
    `Excel.WriteToExcel.WriteCell Instance: ExcelInstance Value: ExcelData Column: ${text("A")} Row: 1`,
  ],
  ExcelCopyRange: (step) => [
    todo(step, "set the source range and the destination cell"),
    "Excel.CopyCellsFromExcel.CopyCells Instance: ExcelInstance StartColumn: 1 StartRow: 1 EndColumn: 1 EndRow: 1",
    "Excel.PasteCellsToExcel.PasteToCell Instance: ExcelInstance Column: 1 Row: 1",
  ],
  ExcelInsertSheet: (step) =>
    withHints(
      step,
      ["set the sheet name"],
      `Excel.AddWorksheet Instance: ExcelInstance Name: ${text("TODO")} WorksheetPosition: Excel.WorksheetPosition.Last`
    ),
  ExcelRenameSheet: (step) =>
    withHints(
      step,
      ["set the sheet names"],
      `Excel.RenameWorksheet.ByName Instance: ExcelInstance Name: ${text("TODO")} NewName: ${text("TODO")}`
    ),
  ExcelSaveWorkbook: () => ["Excel.SaveExcel.Save Instance: ExcelInstance"],
  ExcelClose: () => ["Excel.CloseExcel.Close Instance: ExcelInstance"],

  // Outlook
  OutlookOpen: () => ["Outlook.Launch Instance=> OutlookInstance"],
  OutlookClose: () => ["Outlook.Close Instance: OutlookInstance"],
  OutlookGetEmails: (step) =>
    withHints(
      step,
      ["set the account and folder"],
      `Outlook.RetrieveEmailMessages.RetrieveEmails Instance: OutlookInstance Account: ${text("TODO")} MailFolder: ${text("Inbox")} EmailsToRetrieve: Outlook.RetrieveMessagesMode.All MarkAsRead: False ReadBodyAsHtml: False Messages=> RetrievedEmails`
    ),
  OutlookSendEmail: (step) =>
    withHints(
      step,
      ["set the account, recipients, subject and body"],
      `Outlook.SendEmailThroughOutlook.SendEmail Instance: OutlookInstance Account: ${text("TODO")} SendTo: ${text("TODO")} Subject: ${text("TODO")} Body: ${text("TODO")} IsBodyHtml: False IsDraft: False`
    ),

  // Desktop applications and SAP, through PAD's UI automation
  ClickElement: (step) =>
    withHints(
      step,
      [ELEMENT_HINT],
      `UIAutomation.Click Element: ${UI_ELEMENT} ClickType: UIAutomation.ClickType.LeftClick MousePositionRelativeToElement: UIAutomation.RectangleEdgePoint.MiddleCenter OffsetX: 0 OffsetY: 0`
    ),
  TypeIntoElement: (step) => {
    const value = valueOf(step);
    return withHints(
      step,
      [ELEMENT_HINT, ...value.hints],
      `UIAutomation.PopulateTextField TextField: ${UI_ELEMENT} Text: ${value.value} Mode: UIAutomation.PopulateTextMode.Replace ClickType: UIAutomation.PopulateMouseClickType.SingleClick`
    );
  },
  PressKeys: (step) =>
    withHints(
      step,
      ["set the keys, e.g. {Control}({C})"],
      `MouseAndKeyboard.SendKeys.FocusAndSendKeys TextToSend: ${text("TODO")} DelayBetweenKeystrokes: 10 SendTextAsHardwareKeys: False`
    ),

  // Files and text
  CreateTextFile: (step) => {
    const path = targetOf(step, "file path");
    // An empty file, unless the step writes text into it (UiPath Write Text File)
    const value = step.source?.expression !== undefined ? valueOf(step) : { value: text(""), hints: [] };
    return withHints(
      step,
      [...path.hints, ...value.hints],
      `File.WriteText File: ${path.value} TextToWrite: ${value.value} AppendNewLine: False IfFileExists: File.IfFileExists.Overwrite Encoding: File.FileEncoding.UTF8`
    );
  },
  AppendPlainText: (step) => {
    const path = targetOf(step, "file path");
    const value = valueOf(step);
    return withHints(
      step,
      [...path.hints, ...value.hints],
      `File.WriteText File: ${path.value} TextToWrite: ${value.value} AppendNewLine: True IfFileExists: File.IfFileExists.Append Encoding: File.FileEncoding.UTF8`
    );
  },
  DeleteFile: (step) => {
    const path = targetOf(step, "file path");
    return withHints(step, path.hints, `File.Delete Files: ${path.value}`);
  },
  ReadTextFile: (step) => {
    const path = targetOf(step, "file path");
    return withHints(
      step,
      path.hints,
      `File.ReadTextFromFile.ReadText File: ${path.value} Encoding: File.TextFileEncoding.UTF8 Content=> FileContents`
    );
  },
  ReadCsvFile: (step) => {
    const path = targetOf(step, "file path");
    return withHints(
      step,
      path.hints,
      `File.ReadFromCSVFile.ReadCSV CSVFile: ${path.value} Encoding: File.CSVEncoding.UTF8 TrimFields: True FirstLineContainsColumnNames: True ColumnsSeparator: File.CSVColumnsSeparator.SystemDefault CSVTable=> CSVTable`
    );
  },
  CopyFile: (step) => {
    const path = targetOf(step, "file to copy");
    return withHints(
      step,
      [...path.hints, "set the destination folder"],
      `File.Copy Files: ${path.value} Destination: ${text("TODO")} IfFileExists: File.IfExists.DoNothing CopiedFiles=> CopiedFiles`
    );
  },
  CreateFolder: (step) => createFolder(step),
  StringTrim: (step) =>
    withHints(
      step,
      ["set the text"],
      `Text.Trim Text: ${text("TODO")} TrimOption: Text.TrimOption.Both TrimmedText=> TrimmedText`
    ),

  // Variables, data tables, lists and JSON
  SetVariable: (step) => setVariable(step),
  TableGetRowItem: (step) => [
    todo(step, "read the column from the row, e.g. %CurrentItem['Name']%"),
    `SET RowItem TO ${text("TODO")}`,
  ],
  ListAddItem: (step) =>
    withHints(step, ["set the item and the list"], `Variables.AddItemToList Item: ${text("TODO")} List: List`),
  StringReplace: (step) =>
    withHints(
      step,
      ["set the text, the pattern and the replacement"],
      `Text.Replace Text: ${text("TODO")} TextToFind: ${text("TODO")} IsRegEx: True IgnoreCase: False ReplaceWith: ${text("TODO")} ActivateEscapeSequences: False Result=> Replaced`
    ),
  JsonParse: (step) =>
    withHints(
      step,
      ["set the JSON text"],
      `Variables.ConvertJsonToCustomObject Json: ${text("TODO")} CustomObject=> JsonAsCustomObject`
    ),

  // Databases
  DatabaseConnect: (step) =>
    withHints(step, ["set the connection string"], `Database.Connect ConnectionString: ${text("TODO")} Connection=> SQLConnection`),
  DatabaseRunQuery: (step) =>
    withHints(
      step,
      ["set the SQL statement"],
      `Database.ExecuteSqlStatement.Execute Connection: SQLConnection Statement: ${text("TODO")} Timeout: 30 Result=> QueryResult`
    ),

  // System: processes, waiting, dialogs and loops
  StartProcess: (step) => {
    const path = targetOf(step, "application path");
    return withHints(
      step,
      path.hints,
      `System.RunApplication.RunApplication ApplicationPath: ${path.value} WindowStyle: System.ProcessWindowStyle.Normal ProcessId=> AppProcessId`
    );
  },
  KillProcess: (step) => {
    const name = targetOf(step, "process name");
    return withHints(step, name.hints, `System.TerminateProcess.TerminateProcessByName ProcessName: ${name.value}`);
  },
  Wait: (step) => [todo(step, "set the duration in seconds"), "WAIT 5"],
  ShowMessage: (step) => {
    const value = valueOf(step);
    return withHints(
      step,
      value.hints,
      `Display.ShowMessageDialog.ShowMessage Title: ${text("")} Message: ${value.value} Icon: Display.Icon.None Buttons: Display.Buttons.OK DefaultButton: Display.DefaultButton.Button1 IsTopMost: False ButtonPressed=> ButtonPressed`
    );
  },
  AskForInput: (step) =>
    withHints(
      step,
      ["set the title and the message"],
      `Display.InputDialog Title: ${text("TODO")} Message: ${text("TODO")} InputType: Display.InputType.SingleLine IsTopMost: False UserInput=> UserInput ButtonPressed=> ButtonPressed`
    ),
  ExitLoop: () => ["EXIT LOOP"],
};

/** PAD creates a folder from its parent folder and its name, so a literal path is split. */
function createFolder(step: PadStep): string[] {
  const source = step.source;
  const literal = source?.target && source.targetLanguage === "Literal" ? source.target : undefined;
  const split = literal ? /^(.*)[\\/]([^\\/]+)[\\/]?$/.exec(literal) : null;
  if (split) {
    return [`Folder.Create FolderPath: ${text(split[1])} FolderName: ${text(split[2])} Folder=> NewFolder`];
  }
  const hint = source?.target
    ? `set the parent folder and the folder name; UiPath creates ${source.target}`
    : "set the parent folder and the folder name";
  return [todo(step, hint), `Folder.Create FolderPath: ${text("TODO")} FolderName: ${text("TODO")} Folder=> NewFolder`];
}

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Assign → SET. Simple literals are translated; other expressions become TODO. */
function setVariable(step: PadStep): string[] {
  const expression = step.source?.expression;
  const assignments = (expression || "").split(/;\s*/).filter(Boolean);
  if (assignments.length === 0) {
    return [todo(step, "set a variable"), `SET NewVar TO ${text("TODO")}`];
  }
  return assignments.flatMap((assignment) => {
    const [to, ...rest] = assignment.split(" = ");
    const value = rest.join(" = ").trim();
    if (!IDENTIFIER.test(to.trim())) {
      return [todo(step, `UiPath assigns ${assignment}`)];
    }
    const literal = robinLiteral(value);
    return literal !== undefined
      ? [`SET ${to.trim()} TO ${literal}`]
      : [todo(step, `translate ${value}`), `SET ${to.trim()} TO ${text("TODO")}`];
  });
}

/** Translates simple VB/C# literals: numbers, booleans, strings without escapes. */
function robinLiteral(value: string): string | undefined {
  if (/^-?\d+(\.\d+)?$/.test(value)) {
    return value;
  }
  if (/^(true|false)$/i.test(value)) {
    return value.toLowerCase() === "true" ? "True" : "False";
  }
  const quoted = /^"([^"\\]*)"$/.exec(value);
  return quoted ? text(quoted[1]) : undefined;
}

/** Context containers: PAD launches and closes the application around the body. */
const padContainers: Record<string, { setup: PadTemplate; cleanup: PadTemplate }> = {
  WithBrowser: { setup: padActions.BrowserOpen, cleanup: padActions.BrowserClose },
  WithMicrosoftExcel: {
    setup: padActions.ExcelOpenWorkbook,
    cleanup: () => ["Excel.CloseExcel.CloseAndSave Instance: ExcelInstance"],
  },
};

/** App scopes without an ontology container that PAD still needs an instance for. */
const padScopes: Record<string, { setup: PadTemplate; cleanup: PadTemplate }> = {
  outlook: { setup: padActions.OutlookOpen, cleanup: padActions.OutlookClose },
};

export function padActionFor(operation: string): PadTemplate | undefined {
  return padActions[operation];
}

export function padContainerFor(operation: string) {
  return padContainers[operation];
}

export function padScopeFor(context: string | undefined) {
  return context ? padScopes[context] : undefined;
}

/** Control-flow operations PAD supports natively; ParallelSplit runs its branches one after another. */
export const PAD_CONTROL_FLOW = ["BinaryDecision", "CaseDecision", "ForEachLoop", "ConditionalLoop"];

/** Every ontology operation the PAD linker generates an action for, for the migration report. */
export function padOperationIds(): Set<string> {
  return new Set([...Object.keys(padActions), ...Object.keys(padContainers), ...PAD_CONTROL_FLOW]);
}
