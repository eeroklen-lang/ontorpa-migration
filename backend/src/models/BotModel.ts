import { Schema, model } from "mongoose";
import IBotModel from "../interfaces/BotModelInterface";

const schema = new Schema<IBotModel>({
  name: { type: String, required: true },
  description: String,
  model: String,
  processTree: { type: String, required: true },
  source: String,
  importReport: String,
});

const BotModel = model<IBotModel>("BotModel", schema);

export default BotModel;
