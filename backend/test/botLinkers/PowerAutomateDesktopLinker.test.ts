import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import BotLinkerContext from "../../src/botLinkers/BotLinkerContext";
import { generatePadFlow } from "../../src/botLinkers/powerAutomateDesktopLinker/PowerAutomateDesktopLinker";
import { padOperationIds, text } from "../../src/botLinkers/powerAutomateDesktopLinker/padMapping";
import {
  IProcessTree,
  IProcessTreeNodeInfo,
  IProcessTreeStructure,
} from "../../src/interfaces/BotModelInterface";
import { importProject } from "../../src/importers/uipath/UiPathImporter";
import { isOntologyOperation } from "../../src/utils/ontologyIndex";

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
    expect(lines[1]).toContain(`Control: appmask['TODO']['TODO'] Text: ${text("TODO")}`);
  });

  it("turns BinaryDecision into IF/ELSE with a declared placeholder condition", () => {
    const processTree = tree(
      [{ Gateway_1: ["Activity_1", { Flow: [] }] }, { Gateway_2: ["Activity_1", "Activity_1"] }],
      {
        Gateway_1: { label: "Has rows?", concept: "BinaryDecision", mappingStatus: "mapped", source: uipath("If", { expression: "rows.Count > 0" }) },
        Gateway_2: { label: "Valid?", concept: "BinaryDecision", mappingStatus: "mapped" },
        Activity_1: { label: "Close", concept: "BrowserClose", mappingStatus: "mapped" },
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
      "    WebAutomation.CloseWebBrowser BrowserInstance: Browser",
      "END",
      '# TODO "Valid?": set the condition',
      "IF Condition2 = True THEN",
      "    WebAutomation.CloseWebBrowser BrowserInstance: Browser",
      "ELSE",
      "    WebAutomation.CloseWebBrowser BrowserInstance: Browser",
      "END",
    ]);
  });

  it("turns CaseDecision into SWITCH and runs parallel branches one after another", () => {
    const processTree = tree(
      [{ Gateway_1: ["Activity_1", "Activity_1", "Activity_1"] }, { Gateway_2: ["Activity_1", "Activity_1"] }],
      {
        Gateway_1: { label: "Kind", concept: "CaseDecision", mappingStatus: "mapped", source: uipath("Switch", { expression: "kind" }) },
        Gateway_2: { label: "Both", concept: "ParallelSplit", mappingStatus: "mapped" },
        Activity_1: { label: "Close", concept: "BrowserClose", mappingStatus: "mapped" },
      }
    );
    const close = "WebAutomation.CloseWebBrowser BrowserInstance: Browser";
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
      Activity_1: { label: "Close", concept: "BrowserClose", mappingStatus: "mapped" },
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
      "        WebAutomation.CloseWebBrowser BrowserInstance: Browser",
      "    END",
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
        Activity_3: { label: "Filter", concept: "ExcelFilterRange", mappingStatus: "mapped", source: uipath("FilterX") },
        Activity_5: { label: "Use SAP", concept: "", mappingStatus: "structural", source: uipath("NApplicationCard", { context: "sap" }) },
      })
    );
    expect(lines).toEqual([
      '# TODO "Kill app" (UiPath KillProcess): no ontology operation, rebuild by hand',
      '# TODO "Script" (UiPath InvokeCode): Invoke Code: custom VB/C# code',
      '# TODO "Filter": no Power Automate Desktop action for ExcelFilterRange yet',
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

describe("padMapping", () => {
  it("only maps ids that exist in the ontology", () => {
    expect(Array.from(padOperationIds()).filter((id) => !isOntologyOperation(id))).toEqual([]);
  });
});

// Real UiPath Studio templates, downloaded to the git-ignored samples/ folder.
const templatesDir = path.resolve(__dirname, "../../../samples/uipath-studio-templates");

function projectRoots(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  if (entries.some((e) => e.name === "project.json" || e.name === "Main.xaml")) {
    return [dir];
  }
  return entries
    .filter((e) => e.isDirectory() && !e.name.startsWith("."))
    .flatMap((e) => projectRoots(path.join(dir, e.name)));
}

describe.skipIf(!fs.existsSync(templatesDir))("generatePadFlow on UiPath Studio templates", () => {
  const roots = fs.existsSync(templatesDir) ? projectRoots(templatesDir) : [];

  it.each(roots.map((root) => path.relative(templatesDir, root)))("generates balanced blocks for %s", (relative) => {
    const root = path.join(templatesDir, relative);
    const files: Record<string, string> = {};
    for (const file of fs.readdirSync(root, { recursive: true, encoding: "utf8" })) {
      const full = path.join(root, file);
      if (fs.statSync(full).isFile() && /\.(xaml|json)$/i.test(file)) {
        files[file] = fs.readFileSync(full, "utf8");
      }
    }
    const imported = importProject(files);
    const lines = generatePadFlow(imported.name, imported.processTree).split("\n").map((l) => l.trim());
    const opened = lines.filter((l) => /^(IF .* THEN|LOOP |SWITCH )/.test(l)).length;
    const closed = lines.filter((l) => l === "END").length;
    expect(closed).toBe(opened);
  });
});
