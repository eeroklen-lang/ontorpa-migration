import axios from "axios";
import BotModel, {
  parseBotModel,
  stringifyBotModel,
} from "../interfaces/BotModel";
import { MigrationReport } from "../interfaces/MigrationReport";

export default {
  async getBotModels(): Promise<BotModel[]> {
    const res = await axios.get("http://localhost:3001/api/BotModels");

    const botModels: BotModel[] = (res.data as BotModel[]).map((botModel) =>
      parseBotModel(botModel)
    );
    return botModels;
  },
  async getBotModel(botModelId: string): Promise<BotModel> {
    const res = await axios.get(
      `http://localhost:3001/api/BotModels/${botModelId}`
    );

    return parseBotModel(res.data as BotModel);
  },
  async getLinkedBotModel(
    botModelId: string,
    targetRpaTool: string
  ): Promise<Blob> {
    const res = await axios.get(
      `http://localhost:3001/api/BotModels/${botModelId}`,
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
      "http://localhost:3001/api/BotModels",
      botModel
    );

    return parseBotModel(res.data as BotModel);
  },
  async updateBotModel(botModel: BotModel): Promise<BotModel> {
    botModel = stringifyBotModel(botModel);

    const res = await axios.patch(
      `http://localhost:3001/api/BotModels/${botModel._id}`,
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
      "http://localhost:3001/api/BotModels/import/uipath",
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
      `http://localhost:3001/api/BotModels/${botModelId}/migrationReport`,
      { params: { target } }
    );
    return res.data as MigrationReport;
  },
  async deleteBotModel(botModelId: string): Promise<void> {
    await axios.delete(`http://localhost:3001/api/BotModels/${botModelId}`);

    return;
  },
};
