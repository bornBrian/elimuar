import "dotenv/config";
import { resolve } from "node:path";
import cors from "cors";
import express from "express";
import { authRouter } from "./routes/auth.routes.js";
import { deliveryRouter } from "./routes/delivery.routes.js";
import { insightRouter } from "./routes/insight.routes.js";
import { orgRouter } from "./routes/org.routes.js";
import { consoleRouter } from "./routes/console.routes.js";
import { assertProductionConfig } from "./lib/config.js";
import { bucketDescription } from "./lib/assetBucket.js";
import { platformRouter } from "./routes/platform.routes.js";
import { activityRouter } from "./routes/activity.routes.js";
import { arActivityPublicRouter, arActivityRouter } from "./routes/arActivity.routes.js";
import { publicRouter } from "./routes/public.routes.js";
import { teachingRouter } from "./routes/teaching.routes.js";
import { assetStorageDir } from "./lib/storageUrls.js";
import {
  allowedOrigins,
  originAllowed,
  rateLimit,
  requireStorageSignature,
  securityHeaders,
} from "./middleware/security.js";
import { ERROR_CODES } from "@elimuar/shared";
import { HttpError, errorHandler, notFoundHandler, sendData } from "./lib/http.js";

const app = express();

app.disable("x-powered-by");

app.set("trust proxy", process.env.TRUST_PROXY !== "false");

app.use(securityHeaders);

const origins = allowedOrigins();
app.use(
  cors({
    origin: (origin, callback) => {
      if (originAllowed(origin, origins)) {
        callback(null, true);
        return;
      }
      callback(new HttpError(403, ERROR_CODES.FORBIDDEN, "This origin may not call the ElimuAR API"), false);
    },
    credentials: false,
    maxAge: 600,
  })
);
app.use("/api", rateLimit({ scope: "api", windowMs: 60_000, max: 600 }));

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

const credentialLimiter = rateLimit({
  scope: "credentials",
  windowMs: 15 * 60_000,
  max: 10,
  countOnlyFailures: true,
  message: "Too many failed attempts. Wait 15 minutes and try again.",
});

for (const path of [
  "/api/auth/login",
  "/api/auth/student/login",
  "/api/auth/password/request",
  "/api/auth/password/verify",
  "/api/auth/password/reset",
  "/api/auth/register/verify",
  "/api/auth/email/change/confirm",
]) {
  app.use(path, credentialLimiter);
}

app.use(
  "/storage",
  requireStorageSignature,
  express.static(resolve(process.env.STORAGE_DIR ?? "./storage"), {
    maxAge: "7d",
    immutable: false,
    setHeaders: (res, path) => {
      res.setHeader("X-Content-Type-Options", "nosniff");
      if (path.endsWith(".jpg") || path.endsWith(".jpeg")) res.setHeader("Content-Type", "image/jpeg");
      else if (path.endsWith(".png")) res.setHeader("Content-Type", "image/png");
      else if (path.endsWith(".glb")) res.setHeader("Content-Type", "model/gltf-binary");
      else if (path.endsWith(".gltf")) res.setHeader("Content-Type", "model/gltf+json");
      else if (path.endsWith(".svg")) res.setHeader("Content-Type", "image/svg+xml");
      else if (path.endsWith(".m4a") || path.endsWith(".mp4")) res.setHeader("Content-Type", "audio/mp4");
      else if (path.endsWith(".aac")) res.setHeader("Content-Type", "audio/aac");
      else if (path.endsWith(".mp3")) res.setHeader("Content-Type", "audio/mpeg");
      else if (path.endsWith(".wav")) res.setHeader("Content-Type", "audio/wav");
      else if (path.endsWith(".ogg") || path.endsWith(".opus")) res.setHeader("Content-Type", "audio/ogg");
      else if (path.endsWith(".webm")) res.setHeader("Content-Type", "audio/webm");
    },
  })
);

app.get("/api/health", (_req, res) => {
  sendData(res, {
    status: "ok",
    uptimeSeconds: Math.round(process.uptime()),
    commit: process.env.GIT_COMMIT ?? null,
    assetStorage: assetStorageDir,
    modelBucket: bucketDescription(),
  });
});

app.use("/api/auth", authRouter);

app.use("/api", publicRouter);
app.use("/api", arActivityPublicRouter);
app.use("/api", arActivityRouter);

app.use("/api", platformRouter);
app.use("/api", consoleRouter);
app.use("/api", orgRouter);
app.use("/api", teachingRouter);
app.use("/api", activityRouter);
app.use("/api", deliveryRouter);
app.use("/api", insightRouter);

app.use(notFoundHandler);
app.use(errorHandler);

const port = Number.parseInt(process.env.PORT ?? "4000", 10);
assertProductionConfig();

app.listen(port, () => {
  console.log(`ElimuAR API listening on http://localhost:${port}`);
  console.log(`  · health      GET  /api/health`);
  console.log(`  · auth        POST /api/auth/login`);
  console.log(`  · activities  GET  /api/ar-activities        (the content catalogue)`);
  console.log(`  · reports     GET  /api/reports/school       (head of school)`);
});
