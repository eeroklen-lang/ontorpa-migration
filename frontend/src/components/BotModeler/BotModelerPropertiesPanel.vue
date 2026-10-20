<template>
  <div class="m-3">
    <div v-if="element && element.businessObject">
      <div class="mb-6">
        <div class="text-center">
          {{ element.businessObject.$type }}
          - {{ element.businessObject.id }}
        </div>
        <hr />
        <label class="form-control w-full max-w-xs">
          <div class="label">
            <span class="label-text">Label</span>
          </div>
          <input
            type="text"
            class="input input-bordered w-full max-w-xs"
            v-model="currentLabel"
            placeholder="Label"
          />
        </label>
        <label class="form-control w-full max-w-xs">
          <div class="label">
            <span class="label-text">RPA Operation</span>
          </div>
          <select
            class="select select-bordered w-full max-w-xs"
            v-model="currentOperation"
          >
            <option disabled selected>Select an operation</option>
            <template v-if="contextOperations.length">
              <!-- Imported steps: operations for the step's application first -->
              <optgroup :label="`${contextName} operations`">
                <option v-for="operation in contextOperations" :value="operation.id">
                  {{ optionLabel(operation) }}
                </option>
              </optgroup>
              <optgroup label="Other operations">
                <option v-for="operation in otherOperations" :value="operation.id">
                  {{ optionLabel(operation) }}
                </option>
              </optgroup>
            </template>
            <template v-else>
              <option
                v-for="operation in operationsAvailableForShape"
                :value="operation.id"
              >
                {{ optionLabel(operation) }}
              </option>
            </template>
          </select>
        </label>
      </div>
      <div
        v-if="currentOperation && currentOperation in operations"
        class="operation-description drop-shadow-md bg-slate-100 flex items-start p-2"
      >
        <FontAwesomeIcon :icon="faInfo" class="flex-initial mt-1 mr-2 ml-1" />

        <div class="flex-auto">
          <RpaElementExplainer
            :rpa-element="operations[currentOperation]"
            :position="explanationPosition"
          ></RpaElementExplainer>
          realizes the concept of
          <RpaElementExplainer
            :rpa-element="operations[currentOperation].concept"
            :position="explanationPosition"
          ></RpaElementExplainer>
          .<br />
          <span v-if="operations[currentOperation].automates">
            It automates the application
            <RpaElementExplainer
              :rpa-element="operations[currentOperation].automates"
              :position="explanationPosition"
            ></RpaElementExplainer>
            <span v-if="operations[currentOperation].accesses">
              and accesses
              <RpaElementExplainer
                :rpa-element="operations[currentOperation].accesses"
                :position="explanationPosition"
              ></RpaElementExplainer>
            </span>
            .
          </span>
        </div>
      </div>
      <div v-if="source" class="mt-4 text-sm text-left">
        <h3 class="font-semibold mb-1">UiPath source</h3>
        <dl class="grid grid-cols-[auto,1fr] gap-x-2 gap-y-1">
          <dt class="opacity-70">Activity</dt>
          <dd class="font-mono break-all">{{ source.activityType }}</dd>
          <template v-if="source.displayName">
            <dt class="opacity-70">Name</dt>
            <dd>{{ source.displayName }}</dd>
          </template>
          <dt class="opacity-70">File</dt>
          <dd class="font-mono break-all">{{ source.file }}</dd>
          <template v-if="source.context">
            <dt class="opacity-70">Application</dt>
            <dd>{{ source.context }}</dd>
          </template>
          <template v-if="source.expression">
            <dt class="opacity-70">Expression</dt>
            <dd class="font-mono break-all">
              {{ source.expression }}
              <span v-if="source.expressionLanguage" class="font-sans text-xs opacity-60">
                ({{ source.expressionLanguage }})</span
              >
            </dd>
          </template>
          <template v-if="source.target">
            <dt class="opacity-70">Target</dt>
            <dd class="font-mono break-all">
              {{ source.target }}
              <span v-if="source.targetLanguage" class="font-sans text-xs opacity-60">
                ({{ source.targetLanguage }})</span
              >
            </dd>
          </template>
          <template v-if="source.reason">
            <dt class="opacity-70">Manual work</dt>
            <dd>{{ source.reason }}</dd>
          </template>
          <template v-if="nodeInfo?.imported">
            <dt class="opacity-70">Status</dt>
            <dd>{{ statusSummary }}</dd>
          </template>
        </dl>
      </div>
      <div v-if="isTask" class="mt-4 text-sm text-left">
        <h3 class="font-semibold mb-1">{{ targetName || "Power Automate Desktop" }}</h3>
        <pre
          class="bg-slate-100 rounded p-2 text-xs whitespace-pre-wrap break-all"
        >{{ padPreview === undefined ? "Preview unavailable" : padPreview.join("\n") }}</pre>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, markRaw, PropType, toRaw } from "vue";
import { ModelerElement } from "../../interfaces/ModelerEvents";
import RpaElementExplainer from "../RpaElementExplainer.vue";
import {
  rpaOperations,
  rpaSoftware,
  rpaData,
  rpaContextContainers,
} from "../../utils/ontologyParser";
import { bpmnMapping } from "../../utils/bpmnMapping";
import {
  RpaContextContainer,
  RpaOperation,
} from "../../interfaces/RpaOperation";
import { BpmoConcept } from "../../interfaces/BpmoConcepts";
import { ProcessTreeNodeInfo } from "../../interfaces/BotModel";
import botModelApi from "../../api/botModelApi";
import { resolveStatus } from "../../utils/migrationStatus";

/** Ontology software that an imported step's application context stands for. */
const CONTEXT_SOFTWARE: Record<string, { id: string; name: string }> = {
  browser: { id: "Browser", name: "Browser" },
  excel: { id: "MicrosoftExcel", name: "Excel" },
  outlook: { id: "MicrosoftOutlook", name: "Outlook" },
  word: { id: "MicrosoftWord", name: "Word" },
};

export default defineComponent({
  name: "bot-modeler-properties-panel",
  props: {
    modeler: {
      type: Object,
      required: true,
    },
    element: {
      type: Object as PropType<ModelerElement>,
      required: false,
    },
    /** The selected step as last saved; for imported steps it has their UiPath source. */
    nodeInfo: {
      type: Object as PropType<ProcessTreeNodeInfo>,
      required: false,
    },
    /** Operations the migration target generates, marked in the operation list. */
    targetOperations: {
      type: Object as PropType<Set<string>>,
      required: false,
    },
    targetName: {
      type: String,
      required: false,
    },
  },
  data() {
    return {
      // Lines the selected task exports as; undefined if the back end could not be asked
      padPreview: [] as string[] | undefined,
      previewTimer: undefined as ReturnType<typeof setTimeout> | undefined,
      operations: rpaOperations.individuals,
      currentOperation: "" as string | undefined,
      currentLabel: "" as string | undefined,
      explanationPosition: "left",
    };
  },
  methods: {
    getLabel(): string | undefined {
      if (!this.element || !this.element.id) {
        return;
      }
      const elementRegistry = this.modeler.get("elementRegistry");
      return elementRegistry.get(this.element.id).businessObject.name;
    },
    setLabel(newLabel: string): void {
      const modeling = this.modeler.get("modeling");
      modeling.updateLabel(toRaw(this.element), newLabel);
    },
    getRPAOperation(): string | undefined {
      const elementBO = this.getCurrentBusinessObject();
      if (elementBO && "rpa:operation" in elementBO.$attrs) {
        return elementBO.$attrs["rpa:operation"];
      }
    },
    setRPAOperation(newOperation: string) {
      const modeling = this.modeler.get("modeling");
      modeling.updateProperties(toRaw(this.element), {
        "rpa:operation": newOperation,
      });
    },
    getCurrentBusinessObject() {
      if (!this.element || !this.element.id) {
        return;
      }
      const elementRegistry = this.modeler.get("elementRegistry");
      return elementRegistry.get(this.element.id).businessObject;
    },
    optionLabel(operation: RpaOperation | RpaContextContainer): string {
      return this.targetOperations?.has(operation.id)
        ? `${operation.id} · PAD`
        : operation.id;
    },
    /** Asks the back end what the selected task exports as, once edits pause. */
    schedulePreview() {
      clearTimeout(this.previewTimer);
      if (!this.isTask) {
        return;
      }
      this.previewTimer = setTimeout(async () => {
        try {
          this.padPreview = await botModelApi.previewPadStep({
            label: this.currentLabel || this.element?.businessObject?.id || "",
            concept: this.currentOperation || "",
            mappingStatus: this.currentStatus,
            source: this.source,
          });
        } catch (e) {
          this.padPreview = undefined;
        }
      }, 300);
    },
  },
  watch: {
    element: function () {
      this.currentOperation = this.getRPAOperation();
      this.currentLabel = this.getLabel();
      this.schedulePreview();
    },
    currentOperation: function (newOperation, oldOperation) {
      this.schedulePreview();
      if (newOperation === this.getRPAOperation()) {
        return;
      }
      this.setRPAOperation(newOperation);
      if (this.currentLabel === oldOperation || !this.currentLabel) {
        this.currentLabel = newOperation;
      }
    },
    currentLabel: function (newLabel, oldLabel) {
      this.schedulePreview();
      if (newLabel === this.getLabel()) {
        return;
      }
      this.setLabel(newLabel);
    },
  },
  computed: {
    source() {
      return this.nodeInfo?.source;
    },
    isTask(): boolean {
      return this.element?.businessObject?.$type === "bpmn:Task";
    },
    /** The step's status with its current, possibly unsaved, operation. */
    currentStatus() {
      return resolveStatus(this.nodeInfo, this.currentOperation || "");
    },
    statusSummary(): string {
      const imported = this.nodeInfo?.imported;
      if (!imported) {
        return "";
      }
      const before = imported.concept || imported.mappingStatus;
      const now = this.currentOperation || this.currentStatus;
      return before === now ? `${before}, as imported` : `imported as ${before}, now ${now}`;
    },
    /** The application of an imported step, if the ontology has software for it. */
    contextSoftware() {
      const context = this.nodeInfo?.source?.context;
      return context ? CONTEXT_SOFTWARE[context] : undefined;
    },
    contextName(): string {
      return this.contextSoftware?.name || "";
    },
    contextOperations(): (RpaOperation | RpaContextContainer)[] {
      const software = this.contextSoftware;
      if (!software) {
        return [];
      }
      return this.operationsAvailableForShape.filter(
        (operation) => (operation as RpaOperation).automates?.id === software.id
      );
    },
    otherOperations(): (RpaOperation | RpaContextContainer)[] {
      return this.operationsAvailableForShape.filter(
        (operation) => !this.contextOperations.includes(operation)
      );
    },
    operationsAvailableForShape(): (RpaOperation | RpaContextContainer)[] {
      let bpmoConceptForCurrentShape: BpmoConcept | undefined = undefined;
      const currentBO = this.getCurrentBusinessObject();
      for (const bpmoConcept in bpmnMapping) {
        if (bpmnMapping[bpmoConcept as BpmoConcept] === currentBO["$type"]) {
          bpmoConceptForCurrentShape = bpmoConcept as BpmoConcept;
        }
      }
      if (!bpmoConceptForCurrentShape) {
        return [];
      } else if (bpmoConceptForCurrentShape === BpmoConcept.CompoundActivity) {
        // Sub-processes are context containers or compound operations such as loops
        return [
          ...Object.values(rpaContextContainers),
          ...Object.values(this.operations).filter(
            (operation) => operation.bpmoConcept === BpmoConcept.CompoundActivity
          ),
        ];
      } else {
        return Object.values(this.operations).filter(
          (operation) => operation.bpmoConcept === bpmoConceptForCurrentShape
        );
      }
    },
  },
  components: { RpaElementExplainer },
});
</script>

<script setup lang="ts">
import { FontAwesomeIcon } from "@fortawesome/vue-fontawesome";
import { faInfo } from "@fortawesome/free-solid-svg-icons";
</script>

<style scoped>
.operation-description:deep() .rpa-element-name {
  @apply italic;
}
hr {
  @apply my-2;
}
</style>
