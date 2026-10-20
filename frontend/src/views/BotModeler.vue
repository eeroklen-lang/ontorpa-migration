<template>
  <div class="h-screen max-h-screen flex flex-col">
    <div
      class="bg-sky-700 text-center text-slate-100 py-12 flex-initial flex justify-around"
    >
      <div class="flex-1">
        <router-link :to="{ name: 'Overview' }" title="Back to Overview">
          <FontAwesomeIcon
            class="cursor-pointer"
            :icon="faChevronLeft"
            size="2xl"
          />
        </router-link>
        <FontAwesomeIcon
          class="ml-8 cursor-pointer"
          :icon="faSave"
          size="2xl"
          @click="saveBot"
        />
      </div>

      <input
        class="text-center text-white bg-transparent text-4xl border-0 border-b-2 w-4/5 shadow-none"
        placeholder="Name your new Bot"
        v-model="botModel.name"
      />
      <div class="flex-1">
        <FontAwesomeIcon
          class="ml-4 cursor-pointer"
          :icon="faTrash"
          size="2xl"
          @click="deleteBot"
        />
      </div>
    </div>
    <div class="flex-auto grid grid-cols-6 min-h-0">
      <BotOperationSidebar
        @drag-operation="dragOperation"
        @click-operation="clickOperation"
        class="col-span-1 drop-shadow-lg bg-white"
      >
      </BotOperationSidebar>
      <BotModelerCanvas
        v-if="botModel.model"
        :diagram="botModel.model"
        @modeler-shown="modelerLoaded"
        @modeler-selection-changed="selectionChanged"
        @modeler-element-changed="elementChanged"
        class="col-span-4"
      ></BotModelerCanvas>
      <div class="col-span-1 drop-shadow-lg bg-white overflow-y-auto">
        <BotModelerPropertiesPanel
          v-if="modelerShown"
          :modeler="modeler"
          :element="element"
          :node-info="selectedNodeInfo"
          :target-operations="targetOperations"
          :target-name="target?.name"
        ></BotModelerPropertiesPanel>
        <MigrationChecklist
          v-if="modelerShown"
          :items="checklist"
          :counts="counts"
          :target-name="target?.name"
          @show-element="showElement"
        ></MigrationChecklist>
        <details class="m-4 text-left">
          <summary class="cursor-pointer text-sm opacity-70">Process tree</summary>
          <pre>{{ stringifiedProcessTree }}</pre>
        </details>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import BotModelerCanvas from "../components/BotModeler/BotModelerCanvas.vue";
import BotModelerPropertiesPanel from "../components/BotModeler/BotModelerPropertiesPanel.vue";
import {
  ModelerElement,
  ModelerEvent,
  ModelerSelectionChange,
} from "../interfaces/ModelerEvents";
import BotOperationSidebar from "../components/BotModeler/BotOperationSidebar.vue";
import { bpmnMapping } from "../utils/bpmnMapping";
import { BpmoConcept } from "../interfaces/bpmoConcepts";
import MigrationChecklist from "../components/BotModeler/MigrationChecklist.vue";
import BpmnModdleParser, {
  findStructureProblems,
  ProcessStructureError,
  ProcessStructureProblem,
} from "../utils/BpmnModdleParser";
import {
  countSteps,
  mergeProcessTree,
  StepClass,
  StepCounts,
} from "../utils/migrationStatus";
import {
  checklistItems,
  ChecklistItem,
  diagramSteps,
  DiagramStep,
} from "../utils/migrationChecklist";
import BotModel, {
  createDefaultBotModel,
  ProcessTree,
} from "../interfaces/BotModel";
import botModelApi, { MigrationTarget } from "../api/botModelApi";
import YAML from "yaml";
import { FontAwesomeIcon } from "@fortawesome/vue-fontawesome";
import { faChevronLeft } from "@fortawesome/free-solid-svg-icons";
import { faTrash } from "@fortawesome/free-solid-svg-icons";
import { faSave } from "@fortawesome/free-solid-svg-icons";
import { useRoute, useRouter } from "vue-router";
import { useToast } from "vue-toastification";

const toast = useToast();
const router = useRouter();
const route = useRoute();

const modelerShown = ref(false);
const modeler = ref({} as any);
const selectedElements = ref([] as ModelerElement[]);
const element = ref({} as ModelerElement | null);
const botModel = ref({} as BotModel);

// Migration status of the diagram as it is being edited, for the checklist and step markers
const target = ref<MigrationTarget>();
const targetOperations = computed(() =>
  target.value ? new Set(target.value.operations) : undefined
);
const counts = ref<StepCounts>();
const checklist = ref<ChecklistItem[]>([]);
const selectedNodeInfo = computed(() => {
  const id = element.value?.businessObject?.id;
  return id ? botModel.value.processTree?.nodeInfo?.[id] : undefined;
});
let migrationStateTimer: ReturnType<typeof setTimeout> | undefined;

onMounted(async () => {
  if (route.params.modelId as string) {
    try {
      botModel.value = await botModelApi.getBotModel(
        route.params.modelId as string
      );
    } catch (e) {
      toast.error("Could not load the requested bot model.");
    }
  } else {
    botModel.value = createDefaultBotModel();
  }
});

onMounted(async () => {
  try {
    target.value = (await botModelApi.getMigrationTargets()).pad;
    updateMigrationState();
  } catch (e) {
    // The checklist works without target coverage
  }
});

function selectionChanged(e: ModelerSelectionChange) {
  selectedElements.value = e.newSelection;
  if (e.newSelection.length > 0) {
    element.value = e.newSelection[0];
  } else {
    element.value = null;
  }
}

function elementChanged(e: ModelerEvent) {
  // this.saveDiagram();

  if (!element.value || !element.value.businessObject) {
    return;
  }
  if (element.value.businessObject.id === e.element.businessObject.id) {
    element.value = e.element;
  }
}

function modelerLoaded(loadedModeler): void {
  modeler.value = loadedModeler;
  modelerShown.value = true;
  modeler.value.on("commandStack.changed", () => {
    clearTimeout(migrationStateTimer);
    migrationStateTimer = setTimeout(updateMigrationState, 300);
  });
  updateMigrationState();
}

const MARKERS: Partial<Record<StepClass, string>> = {
  unmapped: "migration-unmapped",
  manual: "migration-manual",
  ontologyOnly: "migration-ontology-only",
};

/** Marks steps by migration status and updates the checklist from the current diagram. */
function updateMigrationState() {
  if (!modelerShown.value) {
    return;
  }
  const elementRegistry = modeler.value.get("elementRegistry");
  const steps = diagramSteps(
    elementRegistry.getAll(),
    botModel.value.processTree?.nodeInfo || {},
    targetOperations.value
  );
  markSteps(steps);

  let problems: ProcessStructureProblem[];
  try {
    const processTree = mergeProcessTree(
      botModel.value.processTree,
      new BpmnModdleParser().parseBpmnModdle(modeler.value._definitions)
    );
    counts.value = countSteps(processTree.nodeInfo, targetOperations.value);
    problems = findStructureProblems(modeler.value._definitions, processTree);
  } catch (e) {
    problems = [
      e instanceof ProcessStructureError
        ? e
        : { message: `The diagram cannot be read as a bot: ${e}` },
    ];
  }
  checklist.value = checklistItems(steps, problems, target.value?.name);
}

function markSteps(steps: DiagramStep[]) {
  const canvas = modeler.value.get("canvas");
  const elementRegistry = modeler.value.get("elementRegistry");
  for (const element of elementRegistry.getAll()) {
    Object.values(MARKERS).forEach((marker) => canvas.removeMarker(element, marker));
  }
  for (const step of steps) {
    const marker = MARKERS[step.stepClass];
    if (marker) {
      canvas.addMarker(step.id, marker);
    }
  }
}

async function saveBot() {
  if (!botModel.value.name) {
    toast.warning("Please name your new bot before saving.");
    return;
  }
  let processTree: ProcessTree;
  try {
    // Imported steps keep their UiPath source and import result
    processTree = mergeProcessTree(
      botModel.value.processTree,
      new BpmnModdleParser().parseBpmnModdle(modeler.value._definitions)
    );
  } catch (e) {
    if (e instanceof ProcessStructureError) {
      toast.error("Bot could not be saved.\n" + e.message);
      if (e.elementId) {
        showElement(e.elementId);
      }
    } else {
      toast.error("Bot could not be saved.\n" + e);
    }
    return;
  }
  // Saving still works, but these parts of the diagram are not in the bot
  const leftOut = findStructureProblems(modeler.value._definitions, processTree);
  if (leftOut.length > 0) {
    toast.warning(leftOut.map((problem) => problem.message).join("\n"));
  }
  try {
    const diagramXML = await modeler.value.saveXML();
    botModel.value.model = diagramXML.xml;
    botModel.value.processTree = processTree;

    if (botModel.value._id) {
      await botModelApi.updateBotModel(botModel.value);
    } else {
      const newBotModel = await botModelApi.addBotModel(botModel.value);
      botModel.value = newBotModel;
      router.replace({
        name: "Modeler",
        params: { modelId: newBotModel._id },
      });
    }
    toast.success("Model successfully saved.");
    updateMigrationState();
  } catch (e) {
    toast.error("Bot could not be saved.\n" + e);
  }
}

/** Selects a diagram element and scrolls it into view. */
function showElement(elementId: string) {
  const element = modeler.value.get("elementRegistry").get(elementId);
  if (!element) {
    return;
  }
  modeler.value.get("selection").select(element);
  modeler.value.get("canvas").scrollToElement(element);
}

async function deleteBot() {
  if (!botModel.value._id) {
    botModel.value = createDefaultBotModel();
  } else {
    try {
      await botModelApi.deleteBotModel(botModel.value._id);
    } catch (e) {
      toast.error("Bot could not be deleted.\n" + e);
      return;
    }
  }
  toast.success("Bot deleted");
  router.push({ name: "Overview" });
}

function newOperationShape(e) {
  const bpmnFactory = modeler.value.get("bpmnFactory");
  const elementFactory = modeler.value.get("elementFactory");
  const operation = e.target.dataset["operation"];
  let bpmnType = bpmnMapping[e.target.dataset["nodetype"] as BpmoConcept];

  const shapeOptions: any = {
    type: bpmnType,
  };

  if (bpmnType.includes("EventDefinition")) {
    shapeOptions["eventDefinitionType"] = bpmnType;
    shapeOptions["type"] = "bpmn:IntermediateCatchEvent";
    bpmnType = "bpmn:IntermediateCatchEvent";
  }
  if (bpmnType.includes("SubProcess")) {
    shapeOptions["isExpanded"] = true;
  }

  shapeOptions["businessObject"] = bpmnFactory.create(bpmnType, {
    name: operation,
    "rpa:operation": operation,
  });

  const shape = elementFactory.createShape(shapeOptions);

  if (bpmnType.includes("SubProcess")) {
    const startEvent = elementFactory.createShape({
      type: "bpmn:StartEvent",
      x: 40,
      y: 82,
      parent: shape,
    });
    return [shape, startEvent];
  }

  return shape;
}

function clickOperation(e) {
  return;
  console.log(e);
  const elementRegistry = modeler.value.get("elementRegistry");
  const modeling = modeler.value.get("modeling");
  const process = elementRegistry.get("Process_1");
  const shape = newOperationShape(e);
  modeling.createShape(shape, { x: 400, y: 100 }, process);
}

function dragOperation(e) {
  // console.log(modeler.value);
  e.dataTransfer.effectAllowed = "move";

  e.preventDefault();

  const create = modeler.value.get("create");
  const shape = newOperationShape(e);
  create.start(e, shape);
}

const stringifiedProcessTree = computed(() => {
  if (!botModel.value.processTree || !botModel.value.processTree.tree) {
    return "";
  }
  return YAML.stringify(botModel.value.processTree.tree);
});
</script>
