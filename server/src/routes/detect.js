import { Router } from "express";
import multer from "multer";
import { config } from "../config.js";
import { statements } from "../db.js";
import { isPointInPolygon, boxCenter, zoneToAbsolute } from "../lib/pointInPolygon.js";
import { calculateSeverity } from "../lib/severity.js";
import { updateDwell } from "../lib/dwellTracker.js";
import { saveSnapshot } from "../lib/snapshotStore.js";
import { getSettings } from "../lib/liveSettings.js";
import { notifyAlert } from "../lib/smsNotifier.js";

export const detectRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

let lastZoneAlertTime = 0;
let lastWeaponAlertTime = 0;
let lastCrowdAlertTime = 0;
let weaponStreak = 0; // consecutive frames in which a weapon was detected
let crowdStreak = 0; // consecutive frames in which the crowd threshold was reached

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

detectRouter.post("/", upload.single("frame"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "multipart field 'frame' (image) is required" });
  }

  if (!req.file.mimetype || !req.file.mimetype.startsWith("image/")) {
    return res.status(400).json({ error: "the uploaded frame must be an image" });
  }

  // Read the live settings once per frame so a slider change applies on the next frame.
  const settings = getSettings();

  // 1. Forward the frame to the Python inference service. People are requested at the
  // lower of the zone and crowd confidences; the zone check below filters back up.
  let inferenceResult;
  try {
    const form = new FormData();
    form.append("file", new Blob([req.file.buffer], { type: req.file.mimetype || "image/jpeg" }), "frame.jpg");

    const personConf = Math.min(settings.confidenceThreshold, settings.crowdConfidence);
    const url =
      `${config.inferenceServiceUrl}/detect?confidence=${personConf}` +
      `&weapon_confidence=${settings.weaponConfidenceThreshold}` +
      `&imgsz=${settings.detectionSize}` +
      `&dense=${settings.denseCounting}`;
    // Timeout so a stuck inference service can't freeze the live feed forever.
    const response = await fetch(url, { method: "POST", body: form, signal: AbortSignal.timeout(30000) });
    if (!response.ok) {
      const detail = await response.text();
      return res.status(502).json({ error: "inference service error", detail });
    }
    inferenceResult = await response.json();
  } catch (err) {
    const detail = err.name === "TimeoutError" ? "inference service took too long" : err.message;
    return res.status(502).json({ error: "could not reach inference service", detail });
  }

  const { detections, image_width: width, image_height: height } = inferenceResult;

  // 2. Zone check against every detection. Detections from an older inference
  // service carry no label; those are people. `strong` marks people confident enough
  // for zone alerts (weaker ones only count towards the crowd).
  const zoneRow = statements.getSetting.get("restricted_zone");
  const fractionalZone = JSON.parse(zoneRow.value);
  const absoluteZone = zoneToAbsolute(fractionalZone, width, height);

  const detectionsWithZone = detections.map((d) => {
    const label = d.label ?? "person";
    return {
      ...d,
      label,
      in_zone: isPointInPolygon(boxCenter(d.bbox), absoluteZone),
      strong: label === "weapon" ? true : d.confidence >= settings.confidenceThreshold,
    };
  });
  const people = detectionsWithZone.filter((d) => d.label === "person");
  const weapons = detectionsWithZone.filter((d) => d.label === "weapon");

  const inZoneDetections = people.filter((d) => d.in_zone && d.strong);
  const personInZone = inZoneDetections.length > 0;

  // Snapshot is written lazily and shared if several alert types fire on one frame.
  let snapshotPath = null;
  const snapshot = () => (snapshotPath ??= saveSnapshot(req.file.buffer));
  const alerts = [];

  // 3a. Weapon alert: a weapon anywhere in view is always HIGH. It must be seen
  // in several consecutive frames (WEAPON_MIN_CONSECUTIVE_FRAMES) to cut down on
  // one-frame false positives, and has its own cooldown.
  weaponStreak = weapons.length > 0 ? weaponStreak + 1 : 0;
  if (weaponStreak >= config.weaponMinConsecutiveFrames) {
    const secondsSinceLast = (Date.now() - lastWeaponAlertTime) / 1000;
    if (secondsSinceLast > config.weaponCooldownSeconds) {
      const record = {
        timestamp: new Date().toISOString(),
        severity: "HIGH",
        confidence: Math.max(...weapons.map((d) => d.confidence)),
        num_detections: weapons.length,
        time_in_zone: 0,
        snapshot_path: snapshot(),
        type: "weapon",
      };
      const info = statements.insertAlert.run(record);
      alerts.push({ id: info.lastInsertRowid, ...record });
      lastWeaponAlertTime = Date.now();
    }
  }

  // 3b. Zone-intrusion alert: dwell time + severity, cooldown-gated (people only).
  const timeInZone = updateDwell(personInZone);
  if (personInZone) {
    const secondsSinceLast = (Date.now() - lastZoneAlertTime) / 1000;
    if (secondsSinceLast > settings.cooldownSeconds) {
      const maxConfidence = Math.max(...inZoneDetections.map((d) => d.confidence));
      const record = {
        timestamp: new Date().toISOString(),
        severity: calculateSeverity(maxConfidence, inZoneDetections.length, timeInZone),
        confidence: maxConfidence,
        num_detections: inZoneDetections.length,
        time_in_zone: timeInZone,
        snapshot_path: snapshot(),
        type: "zone_intrusion",
      };
      const info = statements.insertAlert.run(record);
      alerts.push({ id: info.lastInsertRowid, ...record });
      lastZoneAlertTime = Date.now();
    }
  }

  // 3c. Crowd alert: N or more people in view (anywhere, not only the zone) for
  // several frames in a row. MEDIUM at the threshold, HIGH at double the threshold.
  const personCount = people.length;
  crowdStreak = personCount >= settings.crowdThreshold ? crowdStreak + 1 : 0;
  if (crowdStreak >= config.crowdMinConsecutiveFrames) {
    const secondsSinceLast = (Date.now() - lastCrowdAlertTime) / 1000;
    if (secondsSinceLast > settings.cooldownSeconds) {
      const record = {
        timestamp: new Date().toISOString(),
        severity: personCount >= settings.crowdThreshold * 2 ? "HIGH" : "MEDIUM",
        confidence: mean(people.map((d) => d.confidence)),
        num_detections: personCount,
        time_in_zone: 0,
        snapshot_path: snapshot(),
        type: "crowd",
      };
      const info = statements.insertAlert.run(record);
      alerts.push({ id: info.lastInsertRowid, ...record });
      lastCrowdAlertTime = Date.now();
    }
  }

  // Text the alerts that qualify (fire-and-forget: never delays or fails the detection response).
  alerts.forEach(notifyAlert);

  // `alert` stays a single object for existing clients; weapon wins, then zone, then
  // crowd. `alerts` has everything that fired on this frame.
  const alert =
    alerts.find((a) => a.type === "weapon") ??
    alerts.find((a) => a.type === "zone_intrusion") ??
    alerts[0] ??
    null;

  res.json({
    detections: detectionsWithZone,
    zone: absoluteZone,
    image_width: width,
    image_height: height,
    time_in_zone: timeInZone,
    person_count: personCount,
    crowd_threshold: settings.crowdThreshold,
    dense_pass: Boolean(inferenceResult.dense_pass),
    alert,
    alerts,
  });
});
