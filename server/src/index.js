import express from "express";
import multer from "multer";
import cors from "cors";
import { config } from "./config.js";
import "./db.js"; // ensures schema exists before routes touch it
import { authRouter } from "./routes/auth.js";
import { detectRouter } from "./routes/detect.js";
import { alertsRouter } from "./routes/alerts.js";
import { zoneRouter } from "./routes/zone.js";
import { statsRouter } from "./routes/stats.js";
import { systemRouter } from "./routes/system.js";
import { settingsRouter } from "./routes/settings.js";
import { smsRouter } from "./routes/sms.js";

const app = express();

app.use(cors({ origin: config.corsOrigin }));
app.use(express.json());
app.use("/snapshots", express.static(config.snapshotsDir));

app.get("/health", (req, res) => res.json({ status: "ok" }));
app.use("/api/auth", authRouter);
app.use("/api/detect-frame", detectRouter);
app.use("/api/alerts", alertsRouter);
app.use("/api/zone", zoneRouter);
app.use("/api/stats", statsRouter);
app.use("/api/system", systemRouter);
app.use("/api/settings", settingsRouter);
app.use("/api/sms", smsRouter);

// Client mistakes (oversized upload, wrong form field, malformed JSON) are 4xx, not 500.
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(err.code === "LIMIT_FILE_SIZE" ? 413 : 400).json({ error: err.message });
  }
  if (err.status && err.status >= 400 && err.status < 500) {
    return res.status(err.status).json({ error: err.message });
  }
  console.error(err);
  res.status(500).json({ error: "internal server error" });
});

app.listen(config.port, () => {
  console.log(`VIGILANT server listening on http://localhost:${config.port}`);
  console.log(`Forwarding detection requests to ${config.inferenceServiceUrl}`);
});
