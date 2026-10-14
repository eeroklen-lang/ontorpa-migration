import { describe, expect, it } from "vitest";
import { IProcessTree } from "../src/interfaces/BotModelInterface";
import { flattenContextContainersInProcessTree } from "../src/utils/processTreeUtils";

describe("flattenContextContainersInProcessTree", () => {
  it("replaces a context container with its setup and cleanup steps", () => {
    const processTree: IProcessTree = {
      tree: {
        Flow: [{ Activity_Browser: ["Activity_GetText"] }],
      },
      nodeInfo: {
        Activity_Browser: { label: "Browser", concept: "WithBrowser" },
        Activity_GetText: { label: "Get price", concept: "BrowserGetText" },
      },
    };

    const flattened = flattenContextContainersInProcessTree(processTree);

    expect(flattened.tree).toEqual({
      Flow: [
        {
          Flow: [
            "Activity_Browser_BrowserOpen",
            "Activity_Browser_BrowserOpenURL",
            "Activity_GetText",
            "Activity_Browser_BrowserClose",
          ],
        },
      ],
    });
    expect(flattened.nodeInfo).not.toHaveProperty("Activity_Browser");
    expect(flattened.nodeInfo["Activity_Browser_BrowserOpen"]).toEqual({
      label: "BrowserOpen",
      concept: "BrowserOpen",
    });
  });

  it("leaves plain operations and gateways untouched", () => {
    const processTree: IProcessTree = {
      tree: {
        Flow: ["Activity_A", { Gateway_1: ["Activity_B", "Activity_C"] }],
      },
      nodeInfo: {
        Activity_A: { label: "A", concept: "CreateTextFile" },
        Gateway_1: { label: "Is it?", concept: "BinaryDecision" },
        Activity_B: { label: "B", concept: "AppendPlainText" },
        Activity_C: { label: "C", concept: "AppendPlainText" },
      },
    };

    const flattened = flattenContextContainersInProcessTree(processTree);

    expect(flattened.tree).toEqual(processTree.tree);
  });
});
