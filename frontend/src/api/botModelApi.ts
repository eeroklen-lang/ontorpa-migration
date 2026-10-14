import axios from "axios";
import BotModel, {
  parseBotModel,
  stringifyBotModel,
} from "../interfaces/BotModel";
import { MigrationReport } from "../interfaces/MigrationReport";

// The back end runs on port 3001 of the same machine that serves the page, so the app also
// works when opened from another computer (e.g. http://192.168.1.101:5173)
const API_URL = `${window.location.protocol}//${window.location.hostname}:3001/api/BotModels`;

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
  async deleteBotModel(botModelId: string): Promise<void> {
    await axios.delete(`${API_URL}/${botModelId}`);

    return;
  },
};
