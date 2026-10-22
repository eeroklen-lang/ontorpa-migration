import { describe, expect, it } from "vitest";
import BotLinkerContext from "../../src/botLinkers/BotLinkerContext";
import {
  generatePadFlow,
  padCatalogFlow,
  padStepLines,
} from "../../src/botLinkers/powerAutomateDesktopLinker/PowerAutomateDesktopLinker";
import { padActionFor, padOperationIds, text } from "../../src/botLinkers/powerAutomateDesktopLinker/padMapping";
import {
  IProcessTree,
  IProcessTreeNodeInfo,
  IProcessTreeStructure,
} from "../../src/interfaces/BotModelInterface";
import { importProject } from "../../src/importers/uipath/UiPathImporter";
import { isOntologyOperation } from "../../src/utils/ontologyIndex";
import robinActions from "../fixtures/pad-robin-actions.json";
import { hasSamples, sampleFiles, sampleProjects } from "../samples";

const HEADER_LINES = 2;

/** The generated flow without the two header comments and the blank line after the header. */
function body(processTree: IProcessTree): string[] {
  const lines = generatePadFlow("Bot", processTree).trimEnd().split("\n");
  return lines.slice(lines.indexOf("") + 1);
}

/** Placeholder declarations from the header. */
function placeholders(processTree: IProcessTree): string[] {
  const lines = generatePadFlow("Bot", processTree).split("\n");
  return lines.slice(HEADER_LINES, lines.indexOf(""));
}

function tree(
  root: (string | IProcessTreeStructure)[],
  nodeInfo: Record<string, IProcessTreeNodeInfo>
): IProcessTree {
  return { tree: { Process: root }, nodeInfo };
}

const uipath = (activityType: string, extra: object = {}) => ({
  vendor: "UiPath" as const,
  activityType,
  file: "Main.xaml",
  ...extra,
});

/** A step whose action needs no application instance, for the control-flow tests. */
const deleteStep: IProcessTreeNodeInfo = {
  label: "Delete",
  concept: "DeleteFile",
  mappingStatus: "mapped",
  source: uipath("DeleteFileX", { target: "old.txt", targetLanguage: "Literal" }),
};
const deleteLine = `File.Delete Files: ${text("old.txt")}`;

const MISSING_BROWSER =
  "# TODO: nothing opens %Browser% before this action; launch, attach to or connect to it first";

describe("generatePadFlow", () => {
  it("wraps container bodies in launch and close actions, using a literal URL", () => {
    const lines = body(
      tree([{ Activity_1: ["Activity_2"] }], {
        Activity_1: {
          label: "Use Browser",
          concept: "WithBrowser",
          mappingStatus: "mapped",
          source: uipath("NApplicationCard", { target: "https://example.com", targetLanguage: "Literal" }),
        },
        Activity_2: { label: "Open page", concept: "BrowserOpenURL", mappingStatus: "mapped", source: uipath("NGoToUrl", { target: "https://example.com/a", targetLanguage: "Literal" }) },
      })
    );
    expect(lines).toEqual([
      `WebAutomation.LaunchEdge.LaunchEdge Url: ${text("https://example.com")} WindowState: WebAutomation.BrowserWindowState.Normal ClearCache: False ClearCookies: False WaitForPageToLoadTimeout: 60 Timeout: 60 BrowserInstance=> Browser`,
      `WebAutomation.GoToWebPage.GoToWebPage BrowserInstance: Browser Url: ${text("https://example.com/a")} WaitForPageToLoadTimeout: 60`,
      "WebAutomation.CloseWebBrowser BrowserInstance: Browser",
    ]);
  });

  it("flags expression values and UI elements with TODO comments", () => {
    const lines = body(
      tree(["Activity_1"], {
        Activity_1: {
          label: "Type name",
          concept: "BrowserInputText",
          mappingStatus: "mapped",
          source: uipath("NTypeInto", { expression: 'row("Name")', expressionLanguage: "VisualBasic" }),
        },
      })
    );
    expect(lines[0]).toBe(
      '# TODO "Type name": re-capture the UI element; translate the value; UiPath uses row("Name")'
    );
    expect(lines[1]).toBe(MISSING_BROWSER);
    expect(lines[2]).toContain(`Control: appmask['TODO']['TODO'] Text: ${text("TODO")}`);
  });

  it("points out the first use of an application instance that nothing opens", () => {
    const click: IProcessTreeNodeInfo = { label: "Click", concept: "BrowserClickButton", mappingStatus: "mapped" };
    const lines = body(
      tree(["Activity_1", { Gateway_1: ["Activity_1", "Activity_1"] }, { Activity_2: ["Activity_3"] }], {
        Activity_1: click,
        Gateway_1: { label: "Again?", concept: "BinaryDecision", mappingStatus: "mapped" },
        Activity_2: { label: "Excel", concept: "WithMicrosoftExcel" },
        Activity_3: { label: "Save", concept: "ExcelSaveWorkbook" },
      })
    );
    expect(lines.filter((line) => line.includes("nothing opens"))).toEqual([MISSING_BROWSER]);
    expect(lines.indexOf(MISSING_BROWSER)).toBe(1);
  });

  it("turns BinaryDecision into IF/ELSE with a declared placeholder condition", () => {
    const processTree = tree(
      [{ Gateway_1: ["Activity_1", { Flow: [] }] }, { Gateway_2: ["Activity_1", "Activity_1"] }],
      {
        Gateway_1: { label: "Has rows?", concept: "BinaryDecision", mappingStatus: "mapped", source: uipath("If", { expression: "rows.Count > 0" }) },
        Gateway_2: { label: "Valid?", concept: "BinaryDecision", mappingStatus: "mapped" },
        Activity_1: deleteStep,
      }
    );
    expect(placeholders(processTree)).toEqual([
      "# Placeholders for conditions and collections: replace them with real values",
      "SET Condition1 TO False",
      "SET Condition2 TO False",
    ]);
    expect(body(processTree)).toEqual([
      '# TODO "Has rows?": translate the condition; UiPath uses rows.Count > 0',
      "IF Condition1 = True THEN",
      `    ${deleteLine}`,
      "END",
      '# TODO "Valid?": set the condition',
      "IF Condition2 = True THEN",
      `    ${deleteLine}`,
      "ELSE",
      `    ${deleteLine}`,
      "END",
    ]);
  });

  it("turns CaseDecision into SWITCH and runs parallel branches one after another", () => {
    const processTree = tree(
      [{ Gateway_1: ["Activity_1", "Activity_1", "Activity_1"] }, { Gateway_2: ["Activity_1", "Activity_1"] }],
      {
        Gateway_1: { label: "Kind", concept: "CaseDecision", mappingStatus: "mapped", source: uipath("Switch", { expression: "kind" }) },
        Gateway_2: { label: "Both", concept: "ParallelSplit", mappingStatus: "mapped" },
        Activity_1: deleteStep,
      }
    );
    const close = deleteLine;
    expect(body(processTree)).toEqual([
      '# TODO "Kind": set the case values; UiPath switches on kind',
      "SWITCH CaseValue1",
      "    CASE = 1",
      `        ${close}`,
      "    CASE = 2",
      `        ${close}`,
      "    CASE = 3",
      `        ${close}`,
      "END",
      '# TODO "Both": Power Automate Desktop has no parallel branches; they run one after another',
      "# Branch 1",
      close,
      "# Branch 2",
      close,
    ]);
  });

  it("turns loops into LOOP FOREACH and LOOP WHILE", () => {
    const processTree = tree([{ Loop_1: [{ Loop_2: ["Activity_1"] }] }], {
      Loop_1: { label: "Each row", concept: "ForEachLoop", mappingStatus: "mapped", source: uipath("ForEach", { expression: "rows" }) },
      Loop_2: { label: "Retry", concept: "ConditionalLoop", mappingStatus: "mapped" },
      Activity_1: deleteStep,
    });
    expect(placeholders(processTree).slice(1)).toEqual([
      "Variables.CreateNewList List=> Collection1",
      "SET Condition1 TO False",
    ]);
    expect(body(processTree)).toEqual([
      '# TODO "Each row": set the list to loop over; UiPath loops over rows',
      "LOOP FOREACH CurrentItem IN Collection1",
      '    # TODO "Retry": set the loop condition',
      "    LOOP WHILE (Condition1) = (True)",
      `        ${deleteLine}`,
      "    END",
      "END",
    ]);
  });

  it("writes the text of a Write Text File step, and creates an empty file otherwise", () => {
    const lines = body(
      tree(["Activity_1", "Activity_2"], {
        Activity_1: {
          label: "Write",
          concept: "CreateTextFile",
          mappingStatus: "mapped",
          source: uipath("WriteTextFile", { target: "out.txt", targetLanguage: "Literal", expression: "done", expressionLanguage: "Literal" }),
        },
        Activity_2: { label: "Create", concept: "CreateTextFile", source: uipath("CreateFile", { target: "new.txt", targetLanguage: "Literal" }) },
      })
    );
    expect(lines[0]).toContain(`File.WriteText File: ${text("out.txt")} TextToWrite: ${text("done")} `);
    expect(lines[1]).toContain(`File.WriteText File: ${text("new.txt")} TextToWrite: ${text("")} `);
  });

  it("writes round 2 actions: desktop UI, folders, processes, queries and leaving a loop", () => {
    const step = (concept: string, source = {}): IProcessTreeNodeInfo => ({
      label: concept,
      concept,
      mappingStatus: "mapped",
      source: uipath(concept, source),
    });
    const lines = body(
      tree(["Activity_1", "Activity_2", "Activity_3", "Activity_4", { Loop_1: ["Activity_5"] }], {
        Activity_1: step("ClickElement", { context: "sap" }),
        Activity_2: step("CreateFolder", { target: "C:\\Out\\2026", targetLanguage: "Literal" }),
        Activity_3: step("KillProcess", { target: "chrome.exe", targetLanguage: "Literal" }),
        Activity_4: step("DatabaseRunQuery"),
        Loop_1: { label: "Each", concept: "ForEachLoop", mappingStatus: "mapped" },
        Activity_5: step("ExitLoop"),
      })
    );
    expect(lines).toEqual([
      '# TODO "ClickElement": re-capture the UI element',
      "UIAutomation.Click.Click Element: appmask['TODO']['TODO'] ClickType: UIAutomation.ClickType.LeftClick MousePositionRelativeToElement: UIAutomation.RectangleEdgePoint.MiddleCenter OffsetX: 0 OffsetY: 0",
      `Folder.Create FolderPath: ${text("C:\\Out")} FolderName: ${text("2026")} Folder=> NewFolder`,
      `System.TerminateProcess.TerminateProcessByName ProcessName: ${text("chrome.exe")}`,
      '# TODO "DatabaseRunQuery": set the SQL statement',
      "# TODO: nothing opens %SQLConnection% before this action; launch, attach to or connect to it first",
      `Database.ExecuteSqlStatement.Execute Connection: SQLConnection Statement: ${text("TODO")} Timeout: 30 Result=> QueryResult`,
      '# TODO "Each": set the list to loop over',
      "LOOP FOREACH CurrentItem IN Collection1",
      "    EXIT LOOP",
      "END",
    ]);
  });

  it("translates simple assignments and flags the rest", () => {
    const assign = (label: string, expression: string): IProcessTreeNodeInfo => ({
      label,
      concept: "SetVariable",
      mappingStatus: "mapped",
      source: uipath("Assign", { expression, expressionLanguage: "VisualBasic" }),
    });
    expect(
      body(
        tree(["Activity_1", "Activity_2", "Activity_3", "Activity_4"], {
          Activity_1: assign("Count", "count = 3"),
          Activity_2: assign("Name", 'name = "Ann"'),
          Activity_3: assign("Total", "total = a + b"),
          Activity_4: assign("Config", 'Config("x") = 1'),
        })
      )
    ).toEqual([
      "SET count TO 3",
      `SET name TO ${text("Ann")}`,
      '# TODO "Total": translate a + b',
      `SET total TO ${text("TODO")}`,
      '# TODO "Config": UiPath assigns Config("x") = 1',
    ]);
  });

  it("writes TODO comments for unmapped, manual and ontology-only steps, and never throws", () => {
    const lines = body(
      tree(["Activity_1", "Activity_2", "Activity_3", "Activity_404", { Activity_5: ["Activity_1"] }], {
        Activity_1: { label: "Kill app", concept: "", mappingStatus: "unmapped", source: uipath("KillProcess") },
        Activity_2: { label: "Script", concept: "", mappingStatus: "manual", source: uipath("InvokeCode", { reason: "Invoke Code: custom VB/C# code" }) },
        Activity_3: { label: "Table", concept: "ExcelFormatAsTable", mappingStatus: "mapped", source: uipath("CreateTableX") },
        Activity_5: { label: "Use SAP", concept: "", mappingStatus: "structural", source: uipath("NApplicationCard", { context: "sap" }) },
      })
    );
    expect(lines).toEqual([
      '# TODO "Kill app" (UiPath KillProcess): no ontology operation, rebuild by hand',
      '# TODO "Script" (UiPath InvokeCode): Invoke Code: custom VB/C# code',
      '# TODO "Table": no Power Automate Desktop action for ExcelFormatAsTable yet',
      "# TODO: unknown step Activity_404",
      '# TODO "Use SAP": attach to the sap application; UI actions need the UI element picker',
      '# TODO "Kill app" (UiPath KillProcess): no ontology operation, rebuild by hand',
    ]);
  });

  it("links modeled bots without UiPath source information", () => {
    const lines = body(
      tree([{ Activity_1: ["Activity_2"] }], {
        Activity_1: { label: "Excel", concept: "WithMicrosoftExcel" },
        Activity_2: { label: "Read", concept: "ExcelReadCellValue" },
      })
    );
    expect(lines[0]).toBe('# TODO "Excel": set the workbook path');
    expect(lines.at(-1)).toBe("Excel.CloseExcel.CloseAndSave Instance: ExcelInstance");
  });
});

describe("BotLinkerContext", () => {
  it("offers the PAD linker as 'pad' for stored bots", () => {
    const processTree = tree(["Activity_1"], { Activity_1: { label: "Close", concept: "BrowserClose" } });
    const output = new BotLinkerContext("pad").linkBot({
      name: "Stored bot",
      model: "",
      processTree: JSON.stringify(processTree),
    });
    expect(output).toContain('# Power Automate Desktop skeleton for "Stored bot"');
    expect(output).toContain("WebAutomation.CloseWebBrowser BrowserInstance: Browser");
  });
});

interface RobinAction {
  kind: string;
  inputs: Record<string, string[] | null>;
  outputs: string[];
}

/**
 * The action id, kind, arguments (Name: value) and outputs (Name=> Variable) of a Robin action
 * line, or undefined for comments and statements such as SET, LOOP or END. Strings, UI elements,
 * tables and lists are replaced first, so their contents are not read as arguments.
 */
function parseRobin(line: string) {
  const wrapped = /^(IF|WAIT) \((.*)\)(?: THEN)?$/.exec(line);
  const plain = (wrapped?.[2] ?? line)
    .replace(/\$'''(?:[^'\\]|\\.|'(?!''))*'''/g, "S")
    .replace(/appmask(?:\['(?:[^'\\]|\\.)*'\])+/g, "E")
    .replace(/\{[^}]*\}/g, "T")
    .replace(/\[[^\]]*\]/g, "L");
  const id = /^([A-Z][A-Za-z]+(?:\.[A-Za-z]+)+)(?:\s|$)/.exec(plain)?.[1];
  if (!id) {
    return undefined;
  }
  return {
    id,
    kind: wrapped?.[1] === "IF" ? "Condition" : wrapped?.[1] === "WAIT" ? "Wait" : "Action",
    args: [...plain.matchAll(/ (\w+): (\S+)/g)].map((m) => [m[1], m[2]] as [string, string]),
    outputs: [...plain.matchAll(/ (\w+)=> /g)].map((m) => m[1]),
  };
}

describe("padCatalogFlow", () => {
  const flow = padCatalogFlow();
  const actions = Array.from(padOperationIds()).filter((operation) => padActionFor(operation));

  it("has a step for every PAD action, each inside the application or connection it needs", () => {
    for (const operation of actions) {
      padActionFor(operation)!({ label: operation })
        .filter((line) => !line.startsWith("#"))
        .forEach((line) => expect(flow).toContain(line));
    }
    expect(flow).not.toContain("no Power Automate Desktop action");
    expect(flow).not.toContain("nothing opens");
  });

  it("uses only actions, arguments and enum values of the PAD Robin knowledge base", () => {
    const problems: string[] = [];
    for (const line of flow.split("\n").map((l) => l.trim())) {
      const parsed = parseRobin(line);
      if (!parsed) {
        continue;
      }
      const known = (robinActions.actions as Record<string, RobinAction>)[parsed.id];
      if (!known) {
        problems.push(`unknown action ${parsed.id}`);
        continue;
      }
      if (known.kind !== parsed.kind) {
        problems.push(`${parsed.id} is a ${known.kind}, written as ${parsed.kind}`);
      }
      for (const [name, value] of parsed.args) {
        const values = known.inputs[name];
        if (values === undefined) {
          problems.push(`${parsed.id}: unknown argument ${name}`);
        } else if (values && /^\w+\.\w+\.\w+$/.test(value) && !values.includes(value.split(".")[2])) {
          problems.push(`${parsed.id}: ${name} has no value ${value}`);
        }
      }
      parsed.outputs
        .filter((name) => !known.outputs.includes(name))
        .forEach((name) => problems.push(`${parsed.id}: unknown output ${name}`));
    }
    expect(problems).toEqual([]);
  });

  it("has balanced blocks", () => {
    const lines = flow.split("\n").map((l) => l.trim());
    const opened = lines.filter((l) => /^(IF .* THEN|LOOP |SWITCH )/.test(l)).length;
    expect(lines.filter((l) => l === "END").length).toBe(opened);
  });
});

describe("padMapping", () => {
  it("only maps ids that exist in the ontology", () => {
    expect(Array.from(padOperationIds()).filter((id) => !isOntologyOperation(id))).toEqual([]);
  });
});

describe("padStepLines", () => {
  it.each([
    ["a mapped step", { label: "Open page", concept: "BrowserOpenURL", mappingStatus: "mapped", source: uipath("NGoToUrl", { target: "https://example.com", targetLanguage: "Literal" }) }],
    ["an ontology-only step", { label: "Export", concept: "ExcelExportPDF", mappingStatus: "mapped", source: uipath("ExcelExportPdf") }],
    ["an unmapped step", { label: "Click", concept: "", mappingStatus: "unmapped", source: uipath("NClick", { context: "desktop" }) }],
    ["a manual step", { label: "Code", concept: "", mappingStatus: "manual", source: uipath("InvokeCode", { reason: "custom code" }) }],
    ["a modeled step", { label: "Trim", concept: "StringTrim" }],
  ] as [string, IProcessTreeNodeInfo][])("matches the flow's lines for %s", (_, info) => {
    const flow = body(tree(["Activity_1"], { Activity_1: info }));
    expect(padStepLines(info)).toEqual(flow.filter((line) => line !== MISSING_BROWSER));
  });
});

describe.skipIf(!hasSamples)("generatePadFlow on sample bots", () => {
  it.each(sampleProjects())("generates balanced blocks for %s", (project) => {
    const imported = importProject(sampleFiles(project));
    const lines = generatePadFlow(imported.name, imported.processTree).split("\n").map((l) => l.trim());
    const opened = lines.filter((l) => /^(IF .* THEN|LOOP |SWITCH )/.test(l)).length;
    const closed = lines.filter((l) => l === "END").length;
    expect(closed).toBe(opened);
  });
});
