import { IProcessTree } from "../../src/interfaces/BotModelInterface";

/** A tree with every construct the importer emits; labels are the ids. */
export const SAMPLE_TREE: IProcessTree = {
  tree: {
    Process: [
      {
        Flow: [
          "Activity_1",
          // Nested split of the same type, with empty branches
          { Gateway_1: [{ Gateway_2: ["Activity_2", { Flow: [] }] }, { Flow: [] }] },
          // Container with a for-each loop inside
          { Activity_3: [{ Flow: ["Activity_4", { Loop_1: ["Activity_5"] }] }] },
          { Gateway_3: ["Activity_6", { Flow: ["Activity_7", "Activity_8"] }, "Activity_9"] },
          // Imported loop without an operation, with an empty body
          { Loop_2: [{ Flow: [] }] },
          // Scope without a container operation, and an unmapped step
          { Activity_10: ["Activity_11"] },
        ],
      },
    ],
  },
  nodeInfo: Object.fromEntries(
    Object.entries({
      Activity_1: "BrowserOpenURL",
      Gateway_1: "BinaryDecision",
      Gateway_2: "BinaryDecision",
      Activity_2: "BrowserClickButton",
      Activity_3: "WithMicrosoftExcel",
      Activity_4: "ExcelReadRange",
      Loop_1: "ForEachLoop",
      Activity_5: "ExcelWriteCellValue",
      Gateway_3: "ParallelSplit",
      Activity_6: "DeleteFile",
      Activity_7: "StringTrim",
      Activity_8: "SetVariable",
      Activity_9: "",
      Loop_2: "",
      Activity_10: "",
      Activity_11: "",
    }).map(([id, concept]) => [id, { label: id, concept }])
  ),
};
