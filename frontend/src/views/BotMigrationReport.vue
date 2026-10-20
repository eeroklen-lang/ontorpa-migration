<template>
  <div class="min-h-screen flex flex-col">
    <div
      class="bg-sky-700 text-center text-slate-100 py-12 flex-initial flex justify-around items-center"
    >
      <div class="flex-1">
        <router-link :to="{ name: 'Overview' }" title="Back to Overview">
          <FontAwesomeIcon class="cursor-pointer" :icon="faChevronLeft" size="2xl" />
        </router-link>
      </div>
      <div class="w-4/5">
        <h1 class="text-4xl">{{ botModel.name }}</h1>
        <div class="text-sm mt-2 opacity-80">Migration report</div>
      </div>
      <div class="flex-1 flex justify-center gap-8">
        <div v-if="botModel.model" class="tooltip tooltip-left" data-tip="Open in the modeler">
          <router-link :to="{ name: 'Modeler', params: { modelId: botModel._id } }">
            <FontAwesomeIcon class="cursor-pointer" :icon="faDiagramProject" size="2xl" />
          </router-link>
        </div>
        <div class="tooltip tooltip-left" data-tip="Download Power Automate Desktop skeleton">
          <FontAwesomeIcon
            class="cursor-pointer"
            :icon="faDownload"
            size="2xl"
            @click="downloadPad"
          />
        </div>
      </div>
    </div>

    <div v-if="report" class="max-w-6xl w-full mx-auto p-6 flex flex-col gap-6">
      <div class="stats stats-vertical md:stats-horizontal shadow">
        <div class="stat">
          <div class="stat-title">Steps</div>
          <div class="stat-value">{{ report.totals.steps }}</div>
          <div class="stat-desc">
            {{ report.totals.mapped }} mapped · {{ report.totals.unmapped }} unmapped ·
            {{ report.totals.manual }} manual
          </div>
        </div>
        <div class="stat">
          <div class="stat-title">Ontology coverage</div>
          <div class="stat-value text-sky-700">{{ percent(report.coverage.ontology) }}</div>
          <div class="stat-desc">steps mapped to an ontology operation</div>
          <div v-if="report.review" class="stat-desc">
            at import {{ percent(report.review.atImport.coverage.ontology) }}
          </div>
        </div>
        <div v-if="report.target" class="stat">
          <div class="stat-title">{{ report.target }}</div>
          <div class="stat-value text-sky-700">{{ percent(report.coverage.target) }}</div>
          <div class="stat-desc">
            generated automatically<span v-if="report.totals.ontologyOnly">
              · {{ report.totals.ontologyOnly }} ontology-only</span
            >
          </div>
          <div v-if="report.review" class="stat-desc">
            at import {{ percent(report.review.atImport.coverage.target) }}
          </div>
        </div>
        <div class="stat">
          <div class="stat-title">Selectors</div>
          <div class="stat-value">{{ report.manualWork.selectors }}</div>
          <div class="stat-desc">UI elements to re-capture</div>
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div class="lg:col-span-3 flex flex-col gap-6">
          <section class="card bg-base-100 shadow">
            <div class="card-body">
              <h2 class="card-title">Process tree</h2>
              <div class="text-xs flex flex-wrap gap-4 opacity-70">
                <span><span :class="statusClass('mapped')">✓</span> mapped</span>
                <span><span :class="statusClass('unmapped')">✗</span> unmapped</span>
                <span><span :class="statusClass('manual')">!</span> manual redesign</span>
                <span><span :class="statusClass('structural')">·</span> structural scope</span>
              </div>
              <div class="font-mono text-sm overflow-x-auto">
                <div
                  v-for="(row, index) in rows"
                  :key="index"
                  class="whitespace-nowrap leading-7"
                  :style="{ paddingLeft: row.depth * 1.25 + 'rem' }"
                >
                  <span v-if="row.kind === 'branch'" class="opacity-50">{{ row.name }}</span>
                  <template v-else>
                    <span class="inline-block w-4 font-bold" :class="statusClass(row.status)">{{
                      statusMark(row.status)
                    }}</span>
                    <span class="font-semibold">{{ row.name }}</span>
                    <span v-if="row.isLoop" class="opacity-60"> (loop)</span>
                    <span class="ml-2 opacity-70">"{{ row.label }}"</span>
                    <span v-if="row.details.length" class="ml-2 text-xs opacity-60"
                      >[{{ row.details.join("; ") }}]</span
                    >
                  </template>
                </div>
              </div>
            </div>
          </section>

          <section v-if="changes" class="card bg-base-100 shadow">
            <div class="card-body">
              <h2 class="card-title">Resolved in the modeler</h2>
              <p class="text-sm opacity-70">
                Changes since the import:
                {{ changes.resolved.length }} {{ changes.resolved.length === 1 ? "step" : "steps" }} changed,
                {{ changes.removedSteps }} removed, {{ changes.addedSteps }} added.
              </p>
              <table v-if="changes.resolved.length" class="table table-sm">
                <thead>
                  <tr><th>Step</th><th>UiPath activity</th><th>Change</th><th>Operation</th></tr>
                </thead>
                <tbody>
                  <tr v-for="step in changes.resolved" :key="step.id">
                    <td>{{ step.label }}</td>
                    <td class="font-mono">{{ step.activityType || "–" }}</td>
                    <td>
                      <span :class="step.kind === 'unmapped' ? 'text-red-600' : 'text-green-700'">{{ step.kind }}</span>
                    </td>
                    <td class="font-mono text-xs">
                      {{ step.from.concept || step.from.status }} → {{ step.to.concept || step.to.status }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <div class="lg:col-span-2 flex flex-col gap-6">
          <section class="card bg-base-100 shadow">
            <div class="card-body">
              <h2 class="card-title">Unmapped activities</h2>
              <p v-if="report.unmappedActivities.length === 0" class="text-sm opacity-70">
                Every step maps to an ontology operation.
              </p>
              <table v-else class="table table-sm">
                <thead>
                  <tr><th>Activity</th><th>Context</th><th class="text-right">Count</th></tr>
                </thead>
                <tbody>
                  <tr v-for="activity in report.unmappedActivities" :key="activity.activityType + activity.context">
                    <td class="font-mono">{{ activity.activityType }}</td>
                    <td>{{ activity.context || "–" }}</td>
                    <td class="text-right">{{ activity.count }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section class="card bg-base-100 shadow">
            <div class="card-body">
              <h2 class="card-title">Applications</h2>
              <p v-if="report.applications.length === 0" class="text-sm opacity-70">None found.</p>
              <div class="flex flex-wrap gap-2">
                <div
                  v-for="application in report.applications"
                  :key="application.name"
                  class="badge badge-outline gap-1 py-3"
                  :title="'Evidence: ' + application.evidence.join(', ')"
                >
                  {{ application.name }}
                  <span class="opacity-50 text-xs">{{ application.evidence.join(", ") }}</span>
                </div>
              </div>
            </div>
          </section>

          <section class="card bg-base-100 shadow">
            <div class="card-body">
              <h2 class="card-title">Manual work</h2>
              <ul class="text-sm list-disc pl-5 flex flex-col gap-1">
                <li v-for="(item, index) in report.manualWork.items" :key="'item' + index">
                  <span class="font-semibold">{{ item.label }}</span>
                  <span class="opacity-70"> ({{ item.activityType }}, {{ item.file }})</span>: {{ item.reason }}
                </li>
                <li v-for="(tryCatch, index) in report.manualWork.catches" :key="'catch' + index">
                  Error handling in <span class="font-semibold">{{ tryCatch.tryCatch }}</span>
                  <span class="opacity-70"> ({{ tryCatch.file }})</span>: catches
                  {{ tryCatch.exceptionTypes.join(", ") }}
                </li>
                <li v-for="(note, index) in report.manualWork.notes" :key="'note' + index">
                  <span class="font-semibold">{{ note.displayName || note.activityType }}</span>
                  <span class="opacity-70"> ({{ note.file }})</span>: {{ note.reason }}
                </li>
                <li v-if="report.manualWork.selectors > 0">
                  Re-capture {{ report.manualWork.selectors }} UI
                  {{ report.manualWork.selectors === 1 ? "element" : "elements" }} in the target tool
                </li>
                <li v-if="report.bot.reframework">
                  REFramework: recreate the settings in
                  {{ report.manualWork.configFiles.join(", ") || "the config file" }} as Power
                  Automate variables or environment values;
                  {{ report.manualWork.frameworkFiles.length }} framework workflows map to the work
                  queue pattern
                </li>
              </ul>
              <p v-if="!hasManualWork" class="text-sm opacity-70">Nothing found.</p>
            </div>
          </section>

          <section v-if="botModel.source" class="card bg-base-100 shadow">
            <div class="card-body text-sm">
              <h2 class="card-title">Source project</h2>
              <div>Entry point: <span class="font-mono">{{ report.bot.main || "–" }}</span></div>
              <div v-if="report.bot.expressionLanguage">
                Expressions: {{ report.bot.expressionLanguage }}
              </div>
              <div v-if="report.bot.targetFramework">Project type: {{ report.bot.targetFramework }}</div>
              <div>
                Workflows: {{ report.bot.importedFiles }} of {{ report.bot.workflowFiles }} imported
              </div>
              <div v-if="report.bot.missingFiles.length" class="text-red-600">
                Missing: {{ report.bot.missingFiles.join(", ") }}
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useToast } from "vue-toastification";
import { FontAwesomeIcon } from "@fortawesome/vue-fontawesome";
import { faChevronLeft, faDiagramProject, faDownload } from "@fortawesome/free-solid-svg-icons";
import botModelApi from "../api/botModelApi";
import BotModel, { MappingStatus } from "../interfaces/BotModel";
import { MigrationReport } from "../interfaces/MigrationReport";
import { processTreeRows } from "../utils/processTreeRows";
import { downloadLinkedBot } from "../utils/utils";

const route = useRoute();
const router = useRouter();
const toast = useToast();

const botModel = ref({} as BotModel);
const report = ref<MigrationReport | null>(null);

const rows = computed(() =>
  botModel.value.processTree?.tree
    ? processTreeRows(botModel.value.processTree.tree, botModel.value.processTree.nodeInfo)
    : []
);

// The review of an imported bot that changed since the import, e.g. in the modeler
const changes = computed(() => {
  const review = report.value?.review;
  return review && (review.resolved.length > 0 || review.removedSteps > 0 || review.addedSteps > 0)
    ? review
    : undefined;
});

const hasManualWork = computed(() => {
  const work = report.value?.manualWork;
  return (
    !!work &&
    (work.items.length > 0 ||
      work.catches.length > 0 ||
      work.notes.length > 0 ||
      work.selectors > 0 ||
      !!report.value?.bot.reframework)
  );
});

onMounted(async () => {
  const modelId = route.params.modelId as string;
  try {
    [botModel.value, report.value] = await Promise.all([
      botModelApi.getBotModel(modelId),
      botModelApi.getMigrationReport(modelId),
    ]);
  } catch (e) {
    toast.error("Could not load the migration report.");
    router.push({ name: "Overview" });
  }
});

function percent(share: number | null | undefined): string {
  return share === null || share === undefined ? "–" : `${Math.round(share * 100)} %`;
}

function statusMark(status?: MappingStatus): string {
  return { mapped: "✓", unmapped: "✗", manual: "!", structural: "·" }[status || "mapped"];
}

function statusClass(status?: MappingStatus): string {
  return {
    mapped: "text-green-700",
    unmapped: "text-red-600",
    manual: "text-amber-600",
    structural: "text-slate-400",
  }[status || "mapped"];
}

async function downloadPad() {
  try {
    await downloadLinkedBot(botModel.value, "pad");
  } catch (e) {
    toast.error("Could not create the Power Automate Desktop skeleton.\n" + e);
  }
}
</script>
