import app from "./app";
import { logger } from "./lib/logger";
import { ensureEcotrackStorage, startEcotrackLiveSync } from "./lib/ecotrackSync";
import { ensureChargesStorage } from "./lib/chargesStorage";
import { ensurePayoutOtpStorage } from "./lib/payoutOtp";

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

const server = app.listen(port, host, async () => {
  logger.info({ port, host }, "Server listening");
  try {
    await ensureEcotrackStorage();
    startEcotrackLiveSync();
  } catch (err) {
    logger.error({ err }, "Ecotrack storage initialization failed");
  }
  try {
    await ensureChargesStorage();
  } catch (err) {
    logger.error({ err }, "Charges audit storage initialization failed");
  }
  try { await ensurePayoutOtpStorage(); }
  catch (err) { logger.error({ err }, "Payout OTP storage initialization failed"); }
});

server.on("error", (err) => {
  logger.error({ err }, "Server failed to start");
  process.exit(1);
});
