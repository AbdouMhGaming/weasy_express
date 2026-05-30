import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "node:path";
import fs from "node:fs";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

// In production, optionally serve a built SPA from STATIC_DIR (or ./public next to the bundle).
const staticDirEnv = process.env["STATIC_DIR"];
const defaultStaticDir = path.resolve(process.cwd(), "public");
const staticDir = staticDirEnv
  ? path.resolve(staticDirEnv)
  : fs.existsSync(defaultStaticDir)
    ? defaultStaticDir
    : null;

if (staticDir && fs.existsSync(staticDir)) {
  logger.info({ staticDir }, "Serving static SPA");
  app.use(
    express.static(staticDir, {
      index: false,
      maxAge: "1h",
      setHeaders: (res, filePath) => {
        if (filePath.endsWith("index.html")) {
          res.setHeader("Cache-Control", "no-cache");
        }
      },
    }),
  );

  const indexHtml = path.join(staticDir, "index.html");
  app.get(/^(?!\/api\/).*/, (_req, res, next) => {
    if (!fs.existsSync(indexHtml)) return next();
    res.setHeader("Cache-Control", "no-cache");
    res.sendFile(indexHtml);
  });
}

export default app;
