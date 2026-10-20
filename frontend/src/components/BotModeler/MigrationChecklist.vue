<template>
  <div class="m-3 text-sm text-left">
    <h2 class="font-semibold text-base mb-2">Migration checklist</h2>
    <div class="flex flex-wrap gap-x-3 gap-y-1 text-xs mb-3">
      <span v-for="entry in legend" :key="entry.kind" class="flex items-center gap-1">
        <span class="inline-block w-3 h-3 rounded-sm border" :class="entry.swatch"></span>
        {{ entry.label }}
      </span>
    </div>
    <div v-if="counts" class="mb-3">
      <div>{{ counts.totals.steps }} {{ counts.totals.steps === 1 ? "step" : "steps" }}</div>
      <div>
        Ontology coverage:
        <span class="font-semibold">{{ percent(counts.coverage.ontology) }}</span>
      </div>
      <div v-if="counts.coverage.target !== undefined">
        {{ targetName }}: <span class="font-semibold">{{ percent(counts.coverage.target) }}</span>
      </div>
    </div>
    <p v-if="items.length === 0" class="opacity-70">
      Nothing open: every step exports to {{ targetName }}.
    </p>
    <ul v-else class="flex flex-col gap-1">
      <li v-for="(item, index) in items" :key="index">
        <button
          class="text-left w-full rounded px-2 py-1 hover:bg-slate-100"
          :class="{ 'cursor-default': !item.elementId }"
          @click="item.elementId && emit('show-element', item.elementId)"
        >
          <span class="font-bold mr-1" :class="KINDS[item.kind].text">{{ KINDS[item.kind].mark }}</span>
          <span v-if="item.label" class="font-semibold">{{ item.label }}</span>
          <div class="text-xs opacity-70">{{ item.detail }}</div>
        </button>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { ChecklistItem } from "../../utils/migrationChecklist";
import { StepCounts } from "../../utils/migrationStatus";

const props = withDefaults(
  defineProps<{
    items: ChecklistItem[];
    counts?: StepCounts;
    targetName?: string;
  }>(),
  { targetName: "the target tool" }
);

const emit = defineEmits<{ (e: "show-element", elementId: string): void }>();

// The swatches match the step markers in the diagram (BotModelerCanvas.vue)
const KINDS: Record<ChecklistItem["kind"], { mark: string; text: string; swatch: string }> = {
  structure: { mark: "⚠", text: "text-red-700", swatch: "" },
  unmapped: { mark: "✗", text: "text-red-600", swatch: "bg-red-100 border-red-600" },
  manual: { mark: "!", text: "text-amber-600", swatch: "bg-amber-100 border-amber-600" },
  ontologyOnly: { mark: "◇", text: "text-sky-600", swatch: "bg-sky-100 border-sky-600" },
};

const legend = computed(() => [
  { kind: "unmapped", label: "no operation", swatch: KINDS.unmapped.swatch },
  { kind: "manual", label: "manual redesign", swatch: KINDS.manual.swatch },
  { kind: "ontologyOnly", label: `no ${props.targetName} action`, swatch: KINDS.ontologyOnly.swatch },
]);

function percent(share: number | null | undefined): string {
  return share === null || share === undefined ? "–" : `${Math.round(share * 100)} %`;
}
</script>
