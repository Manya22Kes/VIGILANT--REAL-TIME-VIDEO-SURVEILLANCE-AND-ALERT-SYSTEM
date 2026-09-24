import { Router } from "express";
import multer from "multer";
import { config } from "../config.js";
import { statements } from "../db.js";
import { isPointInPolygon, boxCenter, zoneToAbsolute } from "../lib/pointInPolygon.js";
import { calculateSeverity } from "../lib/severity.js";
import { updateDwell } from "../lib/dwellTracker.js";
import { saveSnapshot } from "../lib/snapshotStore.js";

export const detectRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

let lastAlertTime = 0;

detectRouter.post("/", upload.single("frame"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "multipart field 'frame' (image) is required" });
  }

  // 1. Forward the frame to the Python inference service.
  let inferenceResult;
  try {
    const form = new FormData();
    form.append("file", new Blob([req.file.buffer], { type: req.file.mimetype || "image/jpeg" }), "frame.jpg");

    const url = `${config.inferenceServiceUrl}/detect?confidence=${config.confidenceThreshold}`;
    const response = await fetch(url, { method: "POST", body: form });
    if (!response.ok) {
      const detail = await response.text();
      return res.status(502).json({ error: "inference service error", detail });
    }
    inferenceResult = await response.json();
  } catch (err) {
    return res.status(502).json({ error: "could not reach inference service", detail: err.message });
  }

  const { detections, image_width: width, image_height: height } = inferenceResult;

  // 2. Zone check against every detection.
  const zoneRow = statements.getSetting.get("restricted_zone");
  const fractionalZone = JSON.parse(zoneRow.value);
  const absoluteZone = zoneToAbsolute(fractionalZone, width, height);

  const detectionsWithZone = detections.map((d) => ({
    ...d,
    in_zone: isPointInPolygon(boxCenter(d.bbox), absoluteZone),
  }));
  const inZoneDetections = detectionsWithZone.filter((d) => d.in_zone);
  const personInZone = inZoneDetections.length > 0;

  // 3. Dwell time + alert (cooldown-gated).
  const timeInZone = updateDwell(personInZone);

  let alert = null;
  if (personInZone) {
    const secondsSinceLastAlert = (Date.now() - lastAlertTime) / 1000;
    if (secondsSinceLastAlert > config.alertCooldownSeconds) {
      const maxConfidence = Math.max(...inZoneDetections.map((d) => d.confidence));
      const severity = calculateSeverity(maxConfidence, inZoneDetections.length, timeInZone);
      const snapshotPath = saveSnapshot(req.file.buffer);

      const record = {
        timestamp: new Date().toISOString(),
        severity,
        confidence: maxConfidence,
        num_detections: inZoneDetections.length,
        time_in_zone: timeInZone,
        snapshot_path: snapshotPath,
      };
      const info = statements.insertAlert.run(record);
      alert = { id: info.lastInsertRowid, ...record };
      lastAlertTime = Date.now();
    }
  }

  res.json({
    detections: detectionsWithZone,
    zone: absoluteZone,
    image_width: width,
    image_height: height,
    time_in_zone: timeInZone,
    alert,
  });
});
