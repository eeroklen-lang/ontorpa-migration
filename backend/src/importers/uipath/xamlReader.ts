import { create } from "xmlbuilder2";

/**
 * A vendor-neutral view of one element in a Windows Workflow (UiPath) XAML file.
 *
 * Property elements such as `<If.Then>` or `<NClick.Target>` are not nodes of their own:
 * their content is stored in the `slots` of the owning node under the property name.
 * Design-time noise (view state, hint sizes, imported namespaces) is dropped.
 */
export interface XamlNode {
  /** Namespace URI of the element, e.g. "http://schemas.uipath.com/workflow/activities". */
  namespace: string;
  /** Local element name, e.g. "Sequence", "NClick", "ExcelApplicationCard". */
  name: string;
  /** Value of the DisplayName attribute, if any. */
  displayName?: string;
  /** Designer annotation (sap2010:Annotation.AnnotationText), if any. */
  annotation?: string;
  /**
   * Plain attributes by local name. Attributes in the XAML language namespace keep an
   * "x:" prefix ("x:Name", "x:Key", "x:TypeArguments") so they cannot clash with plain ones.
   */
  attributes: Record<string, string>;
  /** Trimmed text content, e.g. the expression inside a <CSharpValue>. */
  text?: string;
  /** Element children that are not property elements, in document order. */
  children: XamlNode[];
  /** Property element content by property name, e.g. slots.Then for <If.Then>. */
  slots: Record<string, XamlNode[]>;
}

export interface XamlExpression {
  text: string;
  language: "VisualBasic" | "CSharp" | "Literal";
}

export const XAML_NAMESPACE = "http://schemas.microsoft.com/winfx/2006/xaml";
export const ACTIVITIES_NAMESPACE =
  "http://schemas.microsoft.com/netfx/2009/xaml/activities";

const DESIGNER_NAMESPACES = new Set([
  "http://schemas.microsoft.com/netfx/2009/xaml/activities/presentation",
  "http://schemas.microsoft.com/netfx/2010/xaml/activities/presentation",
  "http://schemas.openxmlformats.org/markup-compatibility/2006",
  "http://schemas.microsoft.com/winfx/2006/xaml/presentation",
]);

// Property elements that carry metadata, not workflow content. "*.Variables" is skipped too.
const IGNORED_PROPERTY_ELEMENTS = new Set([
  "TextExpression.NamespacesForImplementation",
  "TextExpression.ReferencesForImplementation",
  "VisualBasic.Settings",
]);

const IGNORED_ELEMENTS = new Set([`${XAML_NAMESPACE}#Members`]);

const ELEMENT_NODE = 1;
const TEXT_NODE = 3;
const CDATA_NODE = 4;

/**
 * Parses the content of a .xaml file into a tree of XamlNodes.
 *
 * @returns the root <Activity> element
 */
export function readXaml(content: string): XamlNode {
  const xml = content.replace(/^﻿/, "");
  const root = create(xml).root().node as unknown as Element;
  return convertElement(root);
}

function convertElement(element: Element): XamlNode {
  const node: XamlNode = {
    namespace: element.namespaceURI || "",
    name: element.localName,
    attributes: {},
    children: [],
    slots: {},
  };

  for (const attribute of Array.from(element.attributes)) {
    const namespace = attribute.namespaceURI;
    if (namespace === "http://www.w3.org/2000/xmlns/") {
      continue;
    }
    if (attribute.localName === "Annotation.AnnotationText") {
      node.annotation = attribute.value;
    } else if (namespace === XAML_NAMESPACE) {
      node.attributes["x:" + attribute.localName] = attribute.value;
    } else if (!namespace) {
      node.attributes[attribute.localName] = attribute.value;
    }
  }
  if (node.attributes.DisplayName !== undefined) {
    node.displayName = node.attributes.DisplayName;
  }

  let text = "";
  for (const child of Array.from(element.childNodes)) {
    if (child.nodeType === TEXT_NODE || child.nodeType === CDATA_NODE) {
      text += child.nodeValue;
      continue;
    }
    if (child.nodeType !== ELEMENT_NODE) {
      continue;
    }

    const childElement = child as Element;
    const namespace = childElement.namespaceURI || "";
    const localName = childElement.localName;
    if (
      DESIGNER_NAMESPACES.has(namespace) ||
      IGNORED_ELEMENTS.has(`${namespace}#${localName}`)
    ) {
      continue;
    }

    const dot = localName.lastIndexOf(".");
    if (dot === -1) {
      node.children.push(convertElement(childElement));
      continue;
    }

    // Property element: <Owner.Property>
    const property = localName.slice(dot + 1);
    if (IGNORED_PROPERTY_ELEMENTS.has(localName) || property === "Variables") {
      continue;
    }
    const content = Array.from(childElement.childNodes)
      .filter((grandChild) => grandChild.nodeType === ELEMENT_NODE)
      .map((grandChild) => grandChild as Element)
      .filter((grandChild) => !DESIGNER_NAMESPACES.has(grandChild.namespaceURI || ""))
      .map(convertElement);
    const propertyText = textContent(childElement);
    if (content.length === 0 && propertyText) {
      // e.g. <InvokeWorkflowFile.WorkflowFileName>Main.xaml</...> written as element
      content.push({
        namespace: XAML_NAMESPACE,
        name: "String",
        attributes: {},
        text: propertyText,
        children: [],
        slots: {},
      });
    }
    node.slots[property] = (node.slots[property] || []).concat(content);
  }

  const trimmed = text.trim();
  if (trimmed) {
    node.text = trimmed;
  }
  return node;
}

function textContent(element: Element): string {
  return Array.from(element.childNodes)
    .filter((n) => n.nodeType === TEXT_NODE || n.nodeType === CDATA_NODE)
    .map((n) => n.nodeValue)
    .join("")
    .trim();
}

/**
 * Reads an activity argument that may be written either as an attribute
 * (VB: Condition="[x > 1]", or a literal: Url="https://...") or as a property element
 * (C#: <If.Condition><InArgument><CSharpValue>x &gt; 1</CSharpValue></InArgument></If.Condition>).
 */
export function getArgument(
  node: XamlNode,
  property: string
): XamlExpression | undefined {
  const attribute = node.attributes[property];
  if (attribute !== undefined) {
    if (attribute === "{x:Null}") {
      return undefined;
    }
    const vb = /^\[([\s\S]*)\]$/.exec(attribute);
    return vb
      ? { text: vb[1], language: "VisualBasic" }
      : { text: attribute, language: "Literal" };
  }

  const slot = node.slots[property];
  if (!slot || slot.length === 0) {
    return undefined;
  }
  return expressionOf(slot[0]);
}

function expressionOf(node: XamlNode): XamlExpression | undefined {
  if (/^CSharp(Value|Reference)$/.test(node.name)) {
    return { text: node.text || "", language: "CSharp" };
  }
  if (/^VisualBasic(Value|Reference)$/.test(node.name)) {
    return {
      text: node.attributes.ExpressionText ?? node.text ?? "",
      language: "VisualBasic",
    };
  }
  if (/^(In|Out|InOut)Argument$/.test(node.name)) {
    if (node.children.length > 0) {
      return expressionOf(node.children[0]);
    }
    if (node.text !== undefined) {
      const vb = /^\[([\s\S]*)\]$/.exec(node.text);
      return vb
        ? { text: vb[1], language: "VisualBasic" }
        : { text: node.text, language: "Literal" };
    }
    return undefined;
  }
  if (node.text !== undefined) {
    return { text: node.text, language: "Literal" };
  }
  return undefined;
}

/** "clr-namespace:UiPath.Excel.Activities.Business;assembly=UiPath.Excel.Activities" → "UiPath.Excel.Activities" */
export function assemblyOf(node: XamlNode): string | undefined {
  const match = /;assembly=([^;]+)/.exec(node.namespace);
  return match ? match[1] : undefined;
}
