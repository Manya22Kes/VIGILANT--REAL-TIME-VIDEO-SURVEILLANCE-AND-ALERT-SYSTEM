import express from "express";
import cors from "cors";
import { config } from "./config.js";
import "./db.js"; // ensures schema exists before routes touch it
import { authRouter } from "./routes/auth.js";
import { detectRouter } from "./routes/detect.js";
import { alertsRouter } from "./routes/alerts.js";
import { zoneRouter } from "./routes/zone.js";
import { statsRouter } from "./routes/stats.js";
import { systemRouter } from "./routes/system.js";

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

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "internal server error" });
});

app.listen(config.port, () => {
  console.log(`VIGILANT server listening on http://localhost:${config.port}`);
  console.log(`Forwarding detection requests to ${config.inferenceServiceUrl}`);
});
