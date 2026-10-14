import botModelApi from "../api/botModelApi";
import BotModel from "../interfaces/BotModel";

/** Translates a stored bot for the target tool on the back end and saves the result as a file. */
export async function downloadLinkedBot(botModel: BotModel, targetRpaTool: string) {
  if (!botModel._id) {
    return;
  }
  const botFileBlob = await botModelApi.getLinkedBotModel(botModel._id, targetRpaTool);
  const url = window.URL.createObjectURL(botFileBlob);
  const a = document.createElement("a");
  a.href = url;
  a.download = getFilenameForBot(botModel, targetRpaTool);
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
}

export function getFilenameForBot(botModel: BotModel, targetRpaTool: string) {
  const fileEnding = getFileEndingForTool(targetRpaTool);
  return `${botModel.name}-${targetRpaTool}.${fileEnding}`;
}

function getFileEndingForTool(targetRpaTool: string): string {
  switch (targetRpaTool.toLowerCase()) {
    case "robotframework":
    case "rf":
      return "robot";
    case "taskt":
      return "xml";
    case "pad":
      return "txt";
    default:
      return "txt";
  }
}
