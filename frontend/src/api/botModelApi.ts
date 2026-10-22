import axios from "axios";
import BotModel, {
  parseBotModel,
  ProcessTreeNodeInfo,
  stringifyBotModel,
} from "../interfaces/BotModel";
import { MigrationReport } from "../interfaces/MigrationReport";

// The back end runs on port 3001 of the same machine that serves the page. Both only listen on
// that machine by default; to open the app from another computer (e.g. http://192.168.1.101:5173),
// start the back end with HOST=0.0.0.0 and the front end with `npm run dev -- --host`
const API_BASE = `${window.location.protocol}//${window.location.hostname}:3001/api`;
const API_URL = `${API_BASE}/BotModels`;

/** A target RPA tool and the ontology operations it can generate. */
export interface MigrationTarget {
  name: string;
  operations: string[];
}

export default {
  async getBotModels(): Promise<BotModel[]> {
    const res = await axios.get(API_URL);

    const botModels: BotModel[] = (res.data as BotModel[]).map((botModel) =>
      parseBotModel(botModel)
    );
    return botModels;
  },
  async getBotModel(botModelId: string): Promise<BotModel> {
    const res = await axios.get(
      `${API_URL}/${botModelId}`
    );

    return parseBotModel(res.data as BotModel);
  },
  async getLinkedBotModel(
    botModelId: string,
    targetRpaTool: string
  ): Promise<Blob> {
    const res = await axios.get(
      `${API_URL}/${botModelId}`,
      {
        params: {
          type: targetRpaTool,
        },
        responseType: "blob",
      }
    );
    return res.data;
  },
  async addBotModel(botModel: BotModel): Promise<BotModel> {
    botModel = stringifyBotModel(botModel);

    const res = await axios.post(
      API_URL,
      botModel
    );

    return parseBotModel(res.data as BotModel);
  },
  async updateBotModel(botModel: BotModel): Promise<BotModel> {
    botModel = stringifyBotModel(botModel);

    const res = await axios.patch(
      `${API_URL}/${botModel._id}`,
      botModel
    );

    return res.data;
  },
  /**
   * Imports a UiPath project as a new bot.
   *
   * @param files - file contents by path relative to the uploaded folder
   */
  async importUiPath(
    files: Record<string, string>,
    name?: string
  ): Promise<{ botModel: BotModel; report: MigrationReport }> {
    const res = await axios.post(
      `${API_URL}/import/uipath`,
      { files, name }
    );
    return {
      botModel: parseBotModel(res.data.botModel as BotModel),
      report: res.data.report as MigrationReport,
    };
  },
  async getMigrationReport(
    botModelId: string,
    target = "pad"
  ): Promise<MigrationReport> {
    const res = await axios.get(
      `${API_URL}/${botModelId}/migrationReport`,
      { params: { target } }
    );
    return res.data as MigrationReport;
  },
  /** The migration targets by name in the API, e.g. "pad". */
  async getMigrationTargets(): Promise<Record<string, MigrationTarget>> {
    const res = await axios.get(`${API_BASE}/migrationTargets`);
    return res.data as Record<string, MigrationTarget>;
  },
  /** The Power Automate Desktop lines a single step exports as. */
  async previewPadStep(step: ProcessTreeNodeInfo): Promise<string[]> {
    const res = await axios.post(`${API_BASE}/migrationTargets/pad/preview`, { step });
    return res.data.lines as string[];
  },
  async deleteBotModel(botModelId: string): Promise<void> {
    await axios.delete(`${API_URL}/${botModelId}`);

    return;
  },
};
