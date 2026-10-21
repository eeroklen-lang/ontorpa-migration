import express from "express";
import mongoose from "mongoose";
import botModelRoutes from "./routes/botModelRoutes";
import migrationTargetRoutes from "./routes/migrationTargetRoutes";
import cors from "cors";

class App {
  private static get port(): string {
    return process.env.PORT || "3001";
  }

  // The API has no login and stores imported bots, so by default only this machine can reach it.
  // HOST=0.0.0.0 opens it to the network on purpose, e.g. to demo it from another computer.
  private static get host(): string {
    return process.env.HOST || "127.0.0.1";
  }

  private static get isLocalOnly(): boolean {
    return ["127.0.0.1", "localhost", "::1"].includes(App.host);
  }

  private static async startApiServer() {
    const app = express();

    // Only pages served from this machine may call the API, so a web page from another site can't
    // read or change bots through the browser. When the API is opened with HOST, any page may.
    const localOrigin = /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;
    app.use(cors({ origin: App.isLocalOnly ? localOrigin : true }));

    app.use(express.static("public"));

    // UiPath projects are uploaded as JSON, file by file, and easily exceed the 100 kB default
    app.use(express.json({ limit: "50mb" }));

    app.use("/api/botModels", botModelRoutes);
    app.use("/api/migrationTargets", migrationTargetRoutes);

    app.listen(Number(App.port), App.host, () => {
      console.log(`Server listening on http://${App.host}:${App.port} ...`);
    });
  }

  constructor() {
    const db = mongoose.connection;
    // tslint:disable-next-line: no-console
    db.on("error", console.error.bind(console, "connection error:"));
    db.once("open", App.startApiServer);

    mongoose.connect(
      `mongodb://${process.env.MONGO_HOST || "127.0.0.1:27017"}`
    );
    mongoose.set("returnOriginal", false);
  }
}

new App();
