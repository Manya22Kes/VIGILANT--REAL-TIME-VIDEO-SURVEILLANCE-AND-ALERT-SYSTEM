import { Router } from "express";
import fs from "node:fs";
import path from "node:path";
import { statements } from "../db.js";
import { config } from "../config.js";

export const alertsRouter = Router();

alertsRouter.get("/", (req, res) => {
  // Clamp: a negative LIMIT would mean "no limit" in SQLite.
  const limit = Math.max(1, Math.min(Math.floor(Number(req.query.limit)) || 50, 200));
  const offset = Math.max(0, Math.floor(Number(req.query.offset)) || 0);
  const alerts = statements.listAlerts.all({ limit, offset });
  res.json({ alerts, total: statements.countAll.get().count });
});

// CSV download of the whole alert log. Must be registered before "/:id".
const CSV_COLUMNS = ["id", "timestamp", "type", "severity", "confidence", "num_detections", "time_in_zone", "snapshot_path"];
const csvCell = (v) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

alertsRouter.get("/export.csv", (req, res) => {
  const lines = [CSV_COLUMNS.join(",")];
  for (const row of statements.listAllAlerts.all()) {
    lines.push(CSV_COLUMNS.map((c) => csvCell(row[c])).join(","));
  }
  const day = new Date().toISOString().slice(0, 10);
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="vigilant-alerts-${day}.csv"`);
  res.send(lines.join("\r\n") + "\r\n");
});

// Download one alert's snapshot as a file (the browser would just open it otherwise).
alertsRouter.get("/:id/snapshot", (req, res) => {
  const alert = statements.getAlert.get(req.params.id);
  if (!alert || !alert.snapshot_path) return res.status(404).json({ error: "no snapshot for this alert" });
  const file = path.join(config.snapshotsDir, path.basename(alert.snapshot_path));
  if (!fs.existsSync(file)) return res.status(404).json({ error: "snapshot file is missing" });
  // Keep the file's real extension (png/webp/jpg) so the downloaded file opens in any app.
  const ext = path.extname(file).toLowerCase() || ".jpg";
  res.download(file, `vigilant-alert-${alert.id}${ext}`);
});

alertsRouter.get("/:id", (req, res) => {
  const alert = statements.getAlert.get(req.params.id);
  if (!alert) return res.status(404).json({ error: "not found" });
  res.json({ alert });
});
