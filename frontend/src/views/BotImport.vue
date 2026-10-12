<template>
  <div class="min-h-screen flex flex-col">
    <div
      class="bg-sky-700 text-center text-slate-100 py-12 flex-initial flex justify-around"
    >
      <div class="flex-1">
        <router-link :to="{ name: 'Overview' }" title="Back to Overview">
          <FontAwesomeIcon class="cursor-pointer" :icon="faChevronLeft" size="2xl" />
        </router-link>
      </div>
      <h1 class="text-4xl w-4/5">Import UiPath bot</h1>
      <div class="flex-1"></div>
    </div>

    <div class="max-w-2xl w-full mx-auto p-6 flex flex-col gap-6">
      <p>
        Choose the folder of a UiPath Studio project (the folder with
        <code>project.json</code> or <code>Main.xaml</code>). Its workflows are
        imported into a process tree of ontology operations, and you get a
        migration report for Power Automate Desktop. Only workflow and JSON
        files are read; other files are sent by name only.
      </p>

      <label class="form-control w-full">
        <div class="label">
          <span class="label-text font-semibold">Project folder</span>
        </div>
        <input
          type="file"
          class="file-input file-input-bordered w-full"
          webkitdirectory
          multiple
          :disabled="importing"
          @change="folderChosen"
        />
      </label>

      <div v-if="files" class="flex flex-col gap-4">
        <div class="text-sm">
          {{ workflowCount }} workflow {{ workflowCount === 1 ? "file" : "files" }}
          in {{ folderName }}{{ hasProjectJson ? ", with project.json" : ", no project.json" }}
        </div>

        <label class="form-control w-full">
          <div class="label">
            <span class="label-text font-semibold">Bot name</span>
            <span class="label-text-alt">Leave empty to use the name in project.json</span>
          </div>
          <input
            v-model="botName"
            type="text"
            class="input input-bordered w-full"
            :placeholder="projectName || folderName"
          />
        </label>

        <button
          class="btn bg-action text-white hover:bg-sky-700"
          :disabled="importing || workflowCount === 0"
          @click="importBot"
        >
          <span v-if="importing" class="loading loading-spinner"></span>
          Import
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import { useToast } from "vue-toastification";
import { FontAwesomeIcon } from "@fortawesome/vue-fontawesome";
import { faChevronLeft } from "@fortawesome/free-solid-svg-icons";
import botModelApi from "../api/botModelApi";

// Studio metadata and dependency folders never hold workflows
const SKIPPED_FOLDER = /(^|\/)(\.[^/]*|node_modules)\//;
const TEXT_FILE = /\.(xaml|json)$/i;

const router = useRouter();
const toast = useToast();

const files = ref<Record<string, string> | null>(null);
const folderName = ref("");
const botName = ref("");
const importing = ref(false);

const workflowCount = computed(
  () => Object.keys(files.value || {}).filter((path) => /\.xaml$/i.test(path)).length
);
const projectJsonPath = computed(() =>
  Object.keys(files.value || {})
    .filter((path) => path.endsWith("/project.json") || path === "project.json")
    .sort((a, b) => a.split("/").length - b.split("/").length)[0]
);
const hasProjectJson = computed(() => !!projectJsonPath.value);
const projectName = computed(() => {
  if (!projectJsonPath.value) {
    return "";
  }
  try {
    return JSON.parse(files.value![projectJsonPath.value].replace(/^﻿/, "")).name || "";
  } catch {
    return "";
  }
});

async function folderChosen(event: Event) {
  const chosen = Array.from((event.target as HTMLInputElement).files || []);
  if (chosen.length === 0) {
    files.value = null;
    return;
  }
  folderName.value = chosen[0].webkitRelativePath.split("/")[0];

  const read: Record<string, string> = {};
  for (const file of chosen) {
    const path = file.webkitRelativePath || file.name;
    if (SKIPPED_FOLDER.test(path)) {
      continue;
    }
    read[path] = TEXT_FILE.test(path) ? await file.text() : "";
  }
  files.value = read;
  if (workflowCount.value === 0) {
    toast.warning("This folder has no UiPath workflow (.xaml) files.");
  }
}

async function importBot() {
  if (!files.value) {
    return;
  }
  importing.value = true;
  try {
    const name = botName.value.trim() || projectName.value || folderName.value;
    const { botModel } = await botModelApi.importUiPath(files.value, name);
    toast.success(`Imported ${botModel.name}.`);
    router.push({ name: "MigrationReport", params: { modelId: botModel._id } });
  } catch (e: any) {
    toast.error("Import failed: " + (e.response?.data || e.message || e));
  } finally {
    importing.value = false;
  }
}
</script>
