import app from "./app";
import { logger } from "./lib/logger";
import { startEcotrackLiveSync } from "./lib/ecotrackSync";

const rawPort = process.env["PORT"];
const parsed = rawPort ? Number(rawPort) : NaN;
const port = Number.isFinite(parsed) && parsed > 0 ? parsed : 3000;

const host = process.env["HOST"] ?? "0.0.0.0";

process.on("uncaughtException", (err) => {
  logger.error({ err }, "uncaughtException");
});
process.on("unhandledRejection", (err) => {
  logger.error({ err }, "unhandledRejection");
});

const server = app.listen(port, host, () => {
  logger.info({ port, host }, "Server listening");
  startEcotrackLiveSync();
});

server.on("error", (err) => {
  logger.error({ err }, "Server failed to start");
  process.exit(1);
});
