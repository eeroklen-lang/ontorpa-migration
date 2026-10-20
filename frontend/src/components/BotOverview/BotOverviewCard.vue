<template>
  <div
    class="relative m-6 rounded-lg h-20 w-44 shadow-md text-center flex flex-col justify-center"
    :class="[
      botModel
        ? 'border-sky-700 bg-primary text-white text-lg hover:bg-sky-700/70'
        : 'border-solid border-2 border-action hover:bg-action hover:text-white',
    ]"
    @mouseover="cardHovered = true"
    @mouseleave="cardHovered = false"
  >
    <div v-if="botModel">
      <div>
        <router-link
          :to="{
            name: diagram ? 'Modeler' : 'MigrationReport',
            params: { modelId: botModel._id },
          }"
          >{{ botModel.name }}</router-link
        >
      </div>
      <div
        v-if="cardHovered || hoverLock"
        class="absolute bottom-0 w-full h-8 flex justify-center gap-2"
      >
        <div v-if="diagram" class="tooltip tooltip-bottom" data-tip="Explore abstraction">
          <router-link
            :to="{
              name: 'ModelAbstractor',
              params: { modelId: botModel._id },
            }"
          >
            <div class="m-1">
              <FontAwesomeIcon :icon="faBinoculars" />
            </div>
          </router-link>
        </div>

        <div class="tooltip tooltip-bottom" data-tip="Inspect Metrics">
          <router-link
            :to="{
              name: 'ModelMetrics',
              params: { modelId: botModel._id },
            }"
          >
            <div class="m-1">
              <FontAwesomeIcon :icon="faRuler" />
            </div>
          </router-link>
        </div>

        <div class="tooltip tooltip-bottom" data-tip="Migration report">
          <router-link
            :to="{
              name: 'MigrationReport',
              params: { modelId: botModel._id },
            }"
          >
            <div class="m-1">
              <FontAwesomeIcon :icon="faClipboardCheck" />
            </div>
          </router-link>
        </div>

        <div class="tooltip tooltip-bottom" data-tip="Export script">
          <div class="dropdown">
            <div tabindex="0" role="button" class="m-1">
              <FontAwesomeIcon :icon="faDownload" />
            </div>
            <div
              tabindex="0"
              class="dropdown-content z-[1] menu p-2 shadow bg-base-100 rounded-box w-52"
            >
              <div class="join join-vertical">
                <button
                  class="btn join-item"
                  @click="downloadBot('robotframework')"
                >
                  RobotFramework
                </button>
                <button class="btn join-item" @click="downloadBot('taskt')">
                  taskt
                </button>
                <button class="btn join-item" @click="downloadBot('pad')">
                  Power Automate Desktop
                </button>
              </div>
            </div>
          </div>
        </div>

        <div class="tooltip tooltip-bottom" data-tip="Delete bot">
          <div class="m-1 cursor-pointer" @click="deleteBot">
            <FontAwesomeIcon :icon="faTrash" />
          </div>
        </div>
      </div>
    </div>
    <div v-else>
      <FontAwesomeIcon :icon="faPlus" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import BotModel, { hasDiagram } from "../../interfaces/BotModel";
import { downloadLinkedBot } from "../../utils/utils";
import { useToast } from "vue-toastification";
import { FontAwesomeIcon } from "@fortawesome/vue-fontawesome";
import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { faBinoculars } from "@fortawesome/free-solid-svg-icons";
import { faDownload } from "@fortawesome/free-solid-svg-icons";
import { faRuler } from "@fortawesome/free-solid-svg-icons";
import { faClipboardCheck } from "@fortawesome/free-solid-svg-icons";
import { faTrash } from "@fortawesome/free-solid-svg-icons";
import botModelApi from "../../api/botModelApi";

// interface BotOverviewCardProps {
//   botModel: Object as PropType<BotModel>;
// }

const props = defineProps<{ botModel: BotModel }>();
const emit = defineEmits<{ (e: "deleted", botModelId: string): void }>();

// Bots imported before diagrams were generated open in the migration report instead of the modeler
const diagram = computed(() => !!props.botModel && hasDiagram(props.botModel));

const cardHovered = ref(false);
const hoverLock = ref(false);

const toast = useToast();

async function downloadBot(targetRpaTool: string) {
  if (!props.botModel || !props.botModel._id) {
    return;
  }
  try {
    await downloadLinkedBot(props.botModel, targetRpaTool);
  } catch (e) {
    toast.error("Bot could not be linked to " + targetRpaTool + ".\n" + e);
  }
}

async function deleteBot() {
  const botModel = props.botModel;
  if (!botModel?._id || !window.confirm(`Delete "${botModel.name}"? This cannot be undone.`)) {
    return;
  }
  try {
    await botModelApi.deleteBotModel(botModel._id);
    toast.success(`Deleted "${botModel.name}".`);
    emit("deleted", botModel._id);
  } catch (e) {
    toast.error("Bot could not be deleted.\n" + e);
  }
}
</script>
