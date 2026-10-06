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
app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true, limit: "20mb" }));

app.use("/api", router);
app.use("/api", (req, res) => {
  res.status(404).json({
    ok: false,
    error: "api_route_not_found",
    path: req.path,
  });
});

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
        if (filePath.endsWith("index.html") || filePath.endsWith("/sw.js")) res.setHeader("Cache-Control", "no-cache, must-revalidate");
        else if (filePath.includes(`${path.sep}assets${path.sep}`)) res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      },
    }),
  );

  const indexHtml = path.join(staticDir, "index.html");
  app.get(/^(?!\/api\/).*/, (req, res, next) => {
    // A missing JS/CSS/image must be a 404, not HTML with a misleading 200.
    if (req.path.startsWith("/assets/") || /\.(?:js|mjs|css|map|png|jpe?g|webp|gif|svg|ico|woff2?|json|webmanifest)$/i.test(req.path)) return res.status(404).end();
    if (!fs.existsSync(indexHtml)) return next();
    res.setHeader("Cache-Control", "no-cache, must-revalidate");
    res.sendFile(indexHtml);
  });
}

export default app;
