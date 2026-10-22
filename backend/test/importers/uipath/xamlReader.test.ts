import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import {
  ACTIVITIES_NAMESPACE,
  assemblyOf,
  getArgument,
  readXaml,
  XamlNode,
} from "../../../src/importers/uipath/xamlReader";
import { hasSamples, sampleFiles, samplesDir, sampleProjects } from "../../samples";

const HEADER = `<Activity mc:Ignorable="sap sap2010" x:Class="Main"
  xmlns="http://schemas.microsoft.com/netfx/2009/xaml/activities"
  xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"
  xmlns:sap="http://schemas.microsoft.com/netfx/2009/xaml/activities/presentation"
  xmlns:sap2010="http://schemas.microsoft.com/netfx/2010/xaml/activities/presentation"
  xmlns:ui="http://schemas.uipath.com/workflow/activities"
  xmlns:uix="http://schemas.uipath.com/workflow/activities/uix"
  xmlns:ueab="clr-namespace:UiPath.Excel.Activities.Business;assembly=UiPath.Excel.Activities"
  xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml">`;

function workflow(body: string): XamlNode {
  return readXaml(`${HEADER}${body}</Activity>`);
}

describe("readXaml", () => {
  it("keeps activities in document order and drops designer noise", () => {
    const root = workflow(`
      <TextExpression.NamespacesForImplementation><x:String>System</x:String></TextExpression.NamespacesForImplementation>
      <Sequence DisplayName="Main" sap:VirtualizedContainerService.HintSize="1,1" sap2010:WorkflowViewState.IdRef="Sequence_1">
        <Sequence.Variables><Variable x:TypeArguments="x:String" Name="a" /></Sequence.Variables>
        <sap:WorkflowViewStateService.ViewState><x:Boolean x:Key="IsExpanded">True</x:Boolean></sap:WorkflowViewStateService.ViewState>
        <ui:LogMessage DisplayName="Log start" Level="Info" />
        <ui:Comment DisplayName="Note" Text="// todo" />
      </Sequence>`);

    expect(root.name).toBe("Activity");
    expect(root.slots).toEqual({});
    expect(root.children).toHaveLength(1);

    const sequence = root.children[0];
    expect(sequence.name).toBe("Sequence");
    expect(sequence.namespace).toBe(ACTIVITIES_NAMESPACE);
    expect(sequence.displayName).toBe("Main");
    expect(sequence.attributes).toEqual({ DisplayName: "Main" });
    expect(sequence.slots).toEqual({});
    expect(sequence.children.map((c) => c.name)).toEqual(["LogMessage", "Comment"]);
    expect(sequence.children[0].namespace).toBe("http://schemas.uipath.com/workflow/activities");
  });

  it("stores property elements as slots of their owner", () => {
    const root = workflow(`
      <If DisplayName="Check" Condition="[x &gt; 1]">
        <If.Then><Sequence DisplayName="Yes" /></If.Then>
        <If.Else><Sequence DisplayName="No" /></If.Else>
      </If>`);

    const ifNode = root.children[0];
    expect(ifNode.children).toEqual([]);
    expect(ifNode.slots.Then.map((n) => n.displayName)).toEqual(["Yes"]);
    expect(ifNode.slots.Else.map((n) => n.displayName)).toEqual(["No"]);
  });

  it("keeps selector targets and delegate bodies reachable through slots", () => {
    const root = workflow(`
      <uix:NApplicationCard DisplayName="Use Browser">
        <uix:NApplicationCard.Body>
          <ActivityAction x:TypeArguments="x:Object">
            <ActivityAction.Argument><DelegateInArgument x:TypeArguments="x:Object" Name="WSSessionData" /></ActivityAction.Argument>
            <Sequence DisplayName="Do">
              <uix:NClick DisplayName="Click Save">
                <uix:NClick.Target><uix:TargetAnchorable Selector="&lt;webctrl tag='BUTTON' /&gt;" /></uix:NClick.Target>
              </uix:NClick>
            </Sequence>
          </ActivityAction>
        </uix:NApplicationCard.Body>
        <uix:NApplicationCard.TargetApp><uix:TargetApp Url="https://example.com" /></uix:NApplicationCard.TargetApp>
      </uix:NApplicationCard>`);

    const card = root.children[0];
    expect(card.slots.TargetApp[0].attributes.Url).toBe("https://example.com");

    const action = card.slots.Body[0];
    expect(action.name).toBe("ActivityAction");
    expect(action.slots.Argument[0].name).toBe("DelegateInArgument");
    expect(action.children.map((c) => c.displayName)).toEqual(["Do"]);

    const click = action.children[0].children[0];
    expect(click.name).toBe("NClick");
    expect(click.slots.Target[0].attributes.Selector).toBe("<webctrl tag='BUTTON' />");
  });

  it("keeps XAML-language attributes prefixed, text content and annotations", () => {
    const root = workflow(`
      <Flowchart DisplayName="Main">
        <Flowchart.StartNode><x:Reference>__ReferenceID0</x:Reference></Flowchart.StartNode>
        <FlowStep x:Name="__ReferenceID0">
          <ui:LogMessage DisplayName="Log" sap2010:Annotation.AnnotationText="Explains the step" />
        </FlowStep>
      </Flowchart>`);

    const flowchart = root.children[0];
    expect(flowchart.slots.StartNode[0]).toMatchObject({ name: "Reference", text: "__ReferenceID0" });
    expect(flowchart.children[0].attributes).toEqual({ "x:Name": "__ReferenceID0" });
    expect(flowchart.children[0].children[0].annotation).toBe("Explains the step");
  });

  it("strips a byte-order mark", () => {
    const root = readXaml(`﻿<?xml version="1.0" encoding="utf-8"?>${HEADER}<Sequence /></Activity>`);
    expect(root.children[0].name).toBe("Sequence");
  });
});

describe("getArgument", () => {
  it("reads VB expressions written as attributes", () => {
    const ifNode = workflow(`<If Condition="[Config Is Nothing]" />`).children[0];
    expect(getArgument(ifNode, "Condition")).toEqual({ text: "Config Is Nothing", language: "VisualBasic" });
  });

  it("reads literal attributes", () => {
    const step = workflow(`<uix:NGoToUrl Url="https://example.com" />`).children[0];
    expect(getArgument(step, "Url")).toEqual({ text: "https://example.com", language: "Literal" });
  });

  it("reads C# expressions written as property elements", () => {
    const ifNode = workflow(`
      <If>
        <If.Condition>
          <InArgument x:TypeArguments="x:Boolean"><CSharpValue x:TypeArguments="x:Boolean">Config == null &amp;&amp; x &gt; 1</CSharpValue></InArgument>
        </If.Condition>
      </If>`).children[0];
    expect(getArgument(ifNode, "Condition")).toEqual({ text: "Config == null && x > 1", language: "CSharp" });
  });

  it("reads literal and VB values inside argument elements", () => {
    const invoke = workflow(`
      <ui:InvokeWorkflowFile>
        <ui:InvokeWorkflowFile.WorkflowFileName><InArgument x:TypeArguments="x:String">Framework\\Process.xaml</InArgument></ui:InvokeWorkflowFile.WorkflowFileName>
        <ui:InvokeWorkflowFile.Timeout><InArgument x:TypeArguments="x:Int32">[timeout * 2]</InArgument></ui:InvokeWorkflowFile.Timeout>
      </ui:InvokeWorkflowFile>`).children[0];
    expect(getArgument(invoke, "WorkflowFileName")).toEqual({ text: "Framework\\Process.xaml", language: "Literal" });
    expect(getArgument(invoke, "Timeout")).toEqual({ text: "timeout * 2", language: "VisualBasic" });
  });

  it("treats {x:Null} and missing arguments as absent", () => {
    const step = workflow(`<ui:InvokeWorkflowFile ArgumentsVariable="{x:Null}" />`).children[0];
    expect(getArgument(step, "ArgumentsVariable")).toBeUndefined();
    expect(getArgument(step, "WorkflowFileName")).toBeUndefined();
  });
});

describe("assemblyOf", () => {
  it("extracts the assembly from clr-namespace URIs", () => {
    const root = workflow(`<ueab:ExcelApplicationCard /><Sequence />`);
    expect(assemblyOf(root.children[0])).toBe("UiPath.Excel.Activities");
    expect(assemblyOf(root.children[1])).toBeUndefined();
  });
});

describe.skipIf(!hasSamples)("readXaml on sample bots", () => {
  const xamlFiles = sampleProjects().flatMap((project) =>
    Object.keys(sampleFiles(project))
      .filter((file) => /\.xaml$/i.test(file))
      .map((file) => path.join(project, file))
  );

  it.each(xamlFiles)("parses %s", (file) => {
    const root = readXaml(fs.readFileSync(path.join(samplesDir, file), "utf8"));
    expect(root.name).toBe("Activity");
    expect(root.children.length).toBeGreaterThan(0);
  });
});
