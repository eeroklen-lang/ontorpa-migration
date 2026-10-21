import { describe, expect, it } from "vitest";
import {
  IProcessTreeNodeInfo,
  IProcessTreeStructure,
} from "../../../src/interfaces/BotModelInterface";
import { importProject } from "../../../src/importers/uipath/UiPathImporter";
import { mappedOperationIds } from "../../../src/importers/uipath/uipathActivityMapping";
import { isOntologyOperation } from "../../../src/utils/ontologyIndex";
import { hasSamples, hasTemplates, sampleFiles, sampleProjects, templateFiles } from "../../samples";

const NAMESPACES = `
  xmlns="http://schemas.microsoft.com/netfx/2009/xaml/activities"
  xmlns:ui="http://schemas.uipath.com/workflow/activities"
  xmlns:uix="http://schemas.uipath.com/workflow/activities/uix"
  xmlns:ueab="clr-namespace:UiPath.Excel.Activities.Business;assembly=UiPath.Excel.Activities"
  xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"`;

function xaml(body: string): string {
  return `<Activity x:Class="Main" ${NAMESPACES}>${body}</Activity>`;
}

/** Renders a tree as "key(children)" so assertions stay readable; leaves show their concept or activity type. */
function render(
  item: string | IProcessTreeStructure,
  nodeInfo: Record<string, IProcessTreeNodeInfo>
): string {
  const describeNode = (id: string) => {
    const info = nodeInfo[id];
    return info ? info.concept || `?${info.source?.activityType}` : id;
  };
  if (typeof item === "string") {
    return describeNode(item);
  }
  return Object.entries(item)
    .map(([key, children]) => {
      const name = key === "Flow" || key === "Process" ? key : describeNode(key);
      return `${name}(${children.map((child) => render(child, nodeInfo)).join(", ")})`;
    })
    .join(", ");
}

function importMain(body: string, extraFiles: Record<string, string> = {}) {
  const result = importProject({ "Main.xaml": xaml(body), ...extraFiles });
  return {
    result,
    tree: render(result.processTree.tree, result.processTree.nodeInfo),
    nodes: Object.values(result.processTree.nodeInfo),
  };
}

describe("importProject: control flow", () => {
  it("flattens sequences and drops logging", () => {
    const { tree } = importMain(`
      <Sequence DisplayName="Main">
        <ui:LogMessage DisplayName="Start" />
        <Sequence DisplayName="Group"><uix:NGoToUrl DisplayName="Open site" Url="https://example.com" /></Sequence>
        <Assign DisplayName="Set x"><Assign.To><OutArgument x:TypeArguments="x:Int32">[x]</OutArgument></Assign.To><Assign.Value><InArgument x:TypeArguments="x:Int32">[1]</InArgument></Assign.Value></Assign>
      </Sequence>`);
    expect(tree).toBe("Process(Flow(BrowserOpenURL, SetVariable))");
  });

  it("turns If into a BinaryDecision with then and else branches", () => {
    const { tree, nodes } = importMain(`
      <If DisplayName="Has rows?" Condition="[rows.Count &gt; 0]">
        <If.Then><Sequence><Assign /><Assign /></Sequence></If.Then>
      </If>`);
    expect(tree).toBe("Process(BinaryDecision(Flow(SetVariable, SetVariable), Flow()))");
    expect(nodes[0]).toMatchObject({
      label: "Has rows?",
      concept: "BinaryDecision",
      mappingStatus: "mapped",
      source: { activityType: "If", expression: "rows.Count > 0", file: "Main.xaml" },
    });
  });

  it("turns Switch into a CaseDecision and Parallel into a ParallelSplit", () => {
    const { tree } = importMain(`
      <Sequence>
        <Switch x:TypeArguments="x:String" Expression="[kind]">
          <Switch.Default><Assign /></Switch.Default>
          <Assign x:Key="a" />
          <Sequence x:Key="b"><Assign /><Assign /></Sequence>
        </Switch>
        <Parallel><Assign /><Assign /></Parallel>
      </Sequence>`);
    expect(tree).toBe(
      "Process(Flow(CaseDecision(SetVariable, Flow(SetVariable, SetVariable), SetVariable), ParallelSplit(SetVariable, SetVariable)))"
    );
  });

  it("turns loops into Loop nodes with their body as the only child", () => {
    const { result, tree } = importMain(`
      <Sequence>
        <While Condition="[i &lt; 3]"><Assign /></While>
        <ui:ForEach x:TypeArguments="x:String" Values="[names]">
          <ui:ForEach.Body>
            <ActivityAction x:TypeArguments="x:String">
              <ActivityAction.Argument><DelegateInArgument x:TypeArguments="x:String" Name="name" /></ActivityAction.Argument>
              <Sequence><Assign /><Assign /></Sequence>
            </ActivityAction>
          </ui:ForEach.Body>
        </ui:ForEach>
      </Sequence>`);
    expect(tree).toBe("Process(Flow(ConditionalLoop(SetVariable), ForEachLoop(Flow(SetVariable, SetVariable))))");
    expect(Object.keys(result.processTree.nodeInfo).filter((id) => id.startsWith("Loop_"))).toEqual([
      "Loop_1",
      "Loop_2",
    ]);
    expect(result.processTree.nodeInfo.Loop_2.source?.expression).toBe("names");
  });

  it("inlines the Try and Finally parts of TryCatch and records the catches", () => {
    const { result, tree } = importMain(`
      <TryCatch DisplayName="Try login">
        <TryCatch.Try><Assign DisplayName="try" /></TryCatch.Try>
        <TryCatch.Catches>
          <Catch x:TypeArguments="ui:BusinessRuleException"><ActivityAction><Assign DisplayName="catch" /></ActivityAction></Catch>
        </TryCatch.Catches>
        <TryCatch.Finally><Assign DisplayName="finally" /></TryCatch.Finally>
      </TryCatch>`);
    expect(tree).toBe("Process(Flow(SetVariable, SetVariable))");
    expect(Object.values(result.processTree.nodeInfo).map((n) => n.label)).toEqual(["try", "finally"]);
    expect(result.source.catches).toEqual([
      { file: "Main.xaml", tryCatch: "Try login", exceptionTypes: ["ui:BusinessRuleException"] },
    ]);
  });

  it("numbers gateways in document order", () => {
    const { result } = importMain(`
      <If Condition="[a]"><If.Then><If Condition="[b]" /></If.Then></If>`);
    expect(result.processTree.tree).toEqual({
      Process: [{ Gateway_1: [{ Gateway_2: [{ Flow: [] }, { Flow: [] }] }, { Flow: [] }] }],
    });
  });
});

describe("importProject: flowcharts", () => {
  it("structures decisions, joins branches and flags loops", () => {
    const { tree, nodes } = importMain(`
      <Flowchart DisplayName="Main">
        <Flowchart.StartNode><x:Reference>__ReferenceID0</x:Reference></Flowchart.StartNode>
        <FlowStep x:Name="__ReferenceID0">
          <Assign DisplayName="Read input" />
          <FlowStep.Next>
            <FlowDecision x:Name="__ReferenceID1" DisplayName="Have input?" Condition="[hasInput]">
              <FlowDecision.True>
                <FlowStep x:Name="__ReferenceID2">
                  <Assign DisplayName="Handle" />
                  <FlowStep.Next><x:Reference>__ReferenceID0</x:Reference></FlowStep.Next>
                </FlowStep>
              </FlowDecision.True>
              <FlowDecision.False>
                <FlowStep x:Name="__ReferenceID3"><Assign DisplayName="Finish" /></FlowStep>
              </FlowDecision.False>
            </FlowDecision>
          </FlowStep.Next>
        </FlowStep>
      </Flowchart>`);
    expect(tree).toBe("Process(Flow(SetVariable, BinaryDecision(Flow(SetVariable, ?Flowchart), SetVariable)))");
    expect(nodes.find((n) => n.mappingStatus === "manual")?.label).toBe(
      "Flowchart loop back to Read input"
    );
  });

  it("continues after the node where both branches meet", () => {
    const { tree } = importMain(`
      <Flowchart>
        <Flowchart.StartNode>
          <FlowDecision Condition="[a]">
            <FlowDecision.True><FlowStep><Assign DisplayName="yes" /><FlowStep.Next><x:Reference>__ReferenceID9</x:Reference></FlowStep.Next></FlowStep></FlowDecision.True>
            <FlowDecision.False><x:Reference>__ReferenceID9</x:Reference></FlowDecision.False>
          </FlowDecision>
        </Flowchart.StartNode>
        <FlowStep x:Name="__ReferenceID9"><Assign DisplayName="after" /></FlowStep>
      </Flowchart>`);
    expect(tree).toBe("Process(Flow(BinaryDecision(SetVariable, Flow()), SetVariable))");
  });
});

describe("importProject: invoked workflows", () => {
  it("inlines invoked files relative to the project root, keeping their file in the source", () => {
    const { result, tree } = importMain(
      `<Sequence><ui:InvokeWorkflowFile WorkflowFileName="Steps\\Login.xaml" /></Sequence>`,
      { "Steps/Login.xaml": xaml(`<Sequence><Assign DisplayName="login" /></Sequence>`) }
    );
    expect(tree).toBe("Process(SetVariable)");
    expect(result.processTree.nodeInfo.Activity_1.source?.file).toBe("Steps/Login.xaml");
    expect(result.source.importedFiles).toEqual(["Main.xaml", "Steps/Login.xaml"]);
  });

  it("guards against recursive invokes and reports missing files", () => {
    const { result, nodes } = importMain(
      `<Sequence>
         <ui:InvokeWorkflowFile WorkflowFileName="A.xaml" />
         <ui:InvokeWorkflowFile WorkflowFileName="Missing.xaml" />
       </Sequence>`,
      { "A.xaml": xaml(`<ui:InvokeWorkflowFile WorkflowFileName="Main.xaml" />`) }
    );
    expect(nodes.map((n) => [n.mappingStatus, n.source?.reason])).toEqual([
      ["manual", "Recursive invoke of Main.xaml"],
      ["manual", "Invoked workflow not found: Missing.xaml"],
    ]);
    expect(result.source.missingFiles).toEqual(["Missing.xaml"]);
  });

  it("flags invokes whose path is an expression", () => {
    const { nodes } = importMain(`<ui:InvokeWorkflowFile WorkflowFileName="[folder + &quot;\\Step.xaml&quot;]" />`);
    expect(nodes[0]).toMatchObject({
      mappingStatus: "manual",
      source: { reason: "Invoked workflow path is an expression", expression: 'folder + "\\Step.xaml"' },
    });
  });
});

describe("importProject: application context", () => {
  const browserCard = (body: string) => `
    <uix:NApplicationCard DisplayName="Use Browser">
      <uix:NApplicationCard.Body><ActivityAction x:TypeArguments="x:Object"><Sequence>${body}</Sequence></ActivityAction></uix:NApplicationCard.Body>
      <uix:NApplicationCard.TargetApp><uix:TargetApp Url="https://example.com" Selector="&lt;html app='msedge.exe' /&gt;" /></uix:NApplicationCard.TargetApp>
    </uix:NApplicationCard>`;
  const click = `<uix:NClick DisplayName="Click Save"><uix:NClick.Target><uix:TargetAnchorable /></uix:NClick.Target></uix:NClick>`;

  it("maps UI activities in a browser scope to browser operations inside a WithBrowser container", () => {
    const { result, tree } = importMain(browserCard(click));
    expect(tree).toBe("Process(WithBrowser(BrowserClickButton))");
    expect(result.processTree.nodeInfo.Activity_1.source).toMatchObject({
      activityType: "NApplicationCard",
      context: "browser",
      target: "https://example.com",
    });
    expect(result.processTree.nodeInfo.Activity_2.source?.context).toBe("browser");
    expect(result.source.selectorCount).toBe(1);
  });

  it("keeps the browser context for UI activities inside an Excel scope", () => {
    const { tree } = importMain(
      browserCard(`
        <ueab:ExcelApplicationCard DisplayName="Use Excel File" WorkbookPath="Suppliers.xlsx">
          <ueab:ExcelApplicationCard.Body><ActivityAction x:TypeArguments="x:Object">${click}</ActivityAction></ueab:ExcelApplicationCard.Body>
        </ueab:ExcelApplicationCard>`)
    );
    expect(tree).toBe("Process(WithBrowser(WithMicrosoftExcel(BrowserClickButton)))");
  });

  it("leaves UI activities in desktop and SAP scopes unmapped but records the context", () => {
    const sap = `
      <uix:NApplicationCard DisplayName="Use SAP">
        <uix:NApplicationCard.Body><ActivityAction x:TypeArguments="x:Object">${click}</ActivityAction></uix:NApplicationCard.Body>
        <uix:NApplicationCard.TargetApp><uix:TargetApp FilePath="C:\\SAP\\saplogon.exe" /></uix:NApplicationCard.TargetApp>
      </uix:NApplicationCard>`;
    const { result, tree } = importMain(`<Sequence>${sap}${click}</Sequence>`);
    expect(tree).toBe("Process(Flow(?NApplicationCard(?NClick), ?NClick))");
    const info = result.processTree.nodeInfo;
    expect([info.Activity_1.mappingStatus, info.Activity_1.source?.context]).toEqual(["structural", "sap"]);
    expect([info.Activity_2.mappingStatus, info.Activity_2.source?.context]).toEqual(["unmapped", "sap"]);
    expect(info.Activity_3.source?.context).toBeUndefined();
  });

  it("marks custom code and orchestration activities as manual", () => {
    const { nodes } = importMain(`<Sequence><ui:InvokeCode /><ui:GetRobotAsset /></Sequence>`);
    expect(nodes.map((n) => [n.mappingStatus, n.source?.reason])).toEqual([
      ["manual", "Invoke Code: custom VB/C# code"],
      ["manual", "Config and secrets: Orchestrator asset"],
    ]);
  });
});

describe("importProject: REFramework", () => {
  const invoke = (file: string) => `<ui:InvokeWorkflowFile WorkflowFileName="${file}" />`;
  const state = (name: string, entry: string, transitionAction = "") => `
    <State DisplayName="${name}">
      <State.Entry><Sequence>${entry}</Sequence></State.Entry>
      <State.Transitions><Transition><Transition.Action>${transitionAction}</Transition.Action></Transition></State.Transitions>
    </State>`;

  it("imports what the states invoke besides the framework's own workflows, also when renamed", () => {
    const { result, tree } = importMain(
      `<StateMachine DisplayName="General Business Process">
        ${state("Initialization", invoke("10. Framework\\10.a InitAllSettings.xaml") + invoke("AddQueue.xaml") + invoke("Framework\\InitAllApplications.xaml"))}
        ${state("Get Transaction Data", invoke("10. Framework\\10.d GetTransactionData.xaml"))}
        ${state(
          "Process Transaction",
          `<TryCatch><TryCatch.Try>${invoke("10. Framework\\10.e Process.xaml")}</TryCatch.Try></TryCatch>`,
          invoke("10. Framework\\10.f SetTransactionStatus.xaml")
        )}
        ${state("End Process", invoke("Framework\\KillAllProcesses.xaml"))}
      </StateMachine>`,
      {
        "AddQueue.xaml": xaml(`<ui:AddQueueItem DisplayName="Add item" />`),
        "Framework/InitAllApplications.xaml": xaml(`<ui:NavigateTo DisplayName="Open portal" />`),
        "10. Framework/10.a InitAllSettings.xaml": xaml(`<Assign DisplayName="Read config" />`),
        "10. Framework/10.d GetTransactionData.xaml": xaml(`<ui:GetQueueItem />`),
        "10. Framework/10.e Process.xaml": xaml(`<Assign DisplayName="Business logic" />`),
        "10. Framework/10.f SetTransactionStatus.xaml": xaml(`<ui:SetTransactionStatus />`),
        "Framework/KillAllProcesses.xaml": xaml(`<ui:KillProcess />`),
      }
    );
    expect(result.source.reframework).toMatchObject({
      initFiles: ["AddQueue.xaml", "Framework/InitAllApplications.xaml"],
      processFiles: ["10. Framework/10.e Process.xaml"],
      closeFiles: [],
      frameworkFiles: [
        "10. Framework/10.a InitAllSettings.xaml",
        "10. Framework/10.d GetTransactionData.xaml",
        "10. Framework/10.f SetTransactionStatus.xaml",
        "Framework/KillAllProcesses.xaml",
      ],
    });
    expect(tree).toBe("Process(Flow(?AddQueueItem, BrowserOpenURL, ?REFramework.TransactionLoop(SetVariable)))");
  });
});

describe("importProject: project files", () => {
  it("reads project.json and strips a top-level folder from paths", () => {
    const result = importProject({
      "MyBot/project.json": JSON.stringify({
        name: "Invoice bot",
        description: "Books invoices",
        main: "Start.xaml",
        expressionLanguage: "CSharp",
        dependencies: { "UiPath.Excel.Activities": "[3.2.1]" },
      }),
      "MyBot/Start.xaml": xaml(`<Assign />`),
    });
    expect(result.name).toBe("Invoice bot");
    expect(result.description).toBe("Books invoices");
    expect(result.source).toMatchObject({
      main: "Start.xaml",
      expressionLanguage: "CSharp",
      dependencies: { "UiPath.Excel.Activities": "[3.2.1]" },
      workflowFiles: ["Start.xaml"],
    });
  });

  it("works without project.json", () => {
    const result = importProject({ "Bot/Main.xaml": xaml(`<Assign />`) }, { name: "Bot" });
    expect(result.name).toBe("Bot");
    expect(result.source.main).toBe("Main.xaml");
  });
});

describe("uipathActivityMapping", () => {
  it("only produces ids that exist in the ontology", () => {
    const unknown = mappedOperationIds().filter((id) => !isOntologyOperation(id));
    expect(unknown).toEqual([]);
  });
});

describe.skipIf(!hasTemplates)("importProject on UiPath Studio templates", () => {
  it.each([
    "REFramework/contentFiles/any/any/pt0/VisualBasic",
    "REFramework/contentFiles/any/any/pt3/CSharp",
    "REFramework/contentFiles/any/any/pt5/CSharp",
  ])("recognises REFramework in %s", (dir) => {
    const result = importProject(templateFiles(dir));
    expect(result.source.reframework).toMatchObject({
      processFiles: ["Framework/Process.xaml"],
      initFiles: ["Framework/InitAllApplications.xaml"],
      closeFiles: ["Framework/CloseAllApplications.xaml"],
    });
    expect(result.source.reframework?.frameworkFiles).toContain("Framework/GetTransactionData.xaml");
    expect(result.source.reframework?.configFiles.length).toBeGreaterThan(0);
    // The template's Process.xaml only logs and comments, so the transaction loop is empty.
    expect(result.processTree.tree).toEqual({ Process: [{ Loop_1: [{ Flow: [] }] }] });
  });

  it("maps the Excel-to-website template's clicks to browser operations", () => {
    const result = importProject(templateFiles("EnterExcelDataIntoWebsite/contentFiles/any/any/pt0/VisualBasic"));
    const tree = render(result.processTree.tree, result.processTree.nodeInfo);
    expect(tree).toBe(
      "Process(WithBrowser(Flow(BrowserOpenURL, BrowserNavigate, WithMicrosoftExcel(ForEachLoop(Flow(" +
        "BrowserClickButton, BrowserInputText, BrowserInputText, BrowserClickButton, BrowserClickButton, BrowserClickButton))))))"
    );
    expect(result.source.selectorCount).toBe(6);
  });

  it("imports the Flowchart template with its loop back flagged", () => {
    const result = importProject(templateFiles("TransactionalProcess/contentFiles/any/any/pt0/VisualBasic"));
    const manual = Object.values(result.processTree.nodeInfo).filter((n) => n.mappingStatus === "manual");
    expect(manual.map((n) => n.label)).toEqual(["Flowchart loop back to Data Input"]);
  });
});

describe.skipIf(!hasSamples)("importProject on sample bots", () => {
  it.each(sampleProjects())("gives every node of %s a mapping status", (project) => {
    const { processTree } = importProject(sampleFiles(project));
    for (const info of Object.values(processTree.nodeInfo)) {
      expect(["mapped", "unmapped", "manual", "structural"]).toContain(info.mappingStatus);
    }
  });
});
