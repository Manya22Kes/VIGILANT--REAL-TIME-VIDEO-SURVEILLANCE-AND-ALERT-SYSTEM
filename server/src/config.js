import path from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

const csv = (v) => (v || "").split(",").map((s) => s.trim()).filter(Boolean);
const numberOr = (v, fallback) => (v !== undefined && v !== "" && Number.isFinite(Number(v)) ? Number(v) : fallback);

export const config = {
  port: Number(process.env.PORT || 4000),
  inferenceServiceUrl: process.env.INFERENCE_SERVICE_URL || "http://localhost:8001",
  confidenceThreshold: Number(process.env.CONFIDENCE_THRESHOLD || 0.5),
  alertCooldownSeconds: Number(process.env.ALERT_COOLDOWN_SECONDS || 10),
  // Weapon alerts: own confidence cut-off and cooldown, and a weapon must be seen
  // in this many consecutive frames before an alert fires (set to 1 to disable).
  weaponConfidenceThreshold: Number(process.env.WEAPON_CONFIDENCE_THRESHOLD || 0.5),
  weaponCooldownSeconds: Number(process.env.WEAPON_COOLDOWN_SECONDS || 5),
  weaponMinConsecutiveFrames: Math.max(1, Number(process.env.WEAPON_MIN_CONSECUTIVE_FRAMES || 2)),
  // Crowd alerts: raised when this many people are in view (live-adjustable from the UI).
  // People are counted at a lower confidence than zone alerts use, because partly hidden
  // and distant people in a crowd score lower. Must be seen in N consecutive frames.
  crowdThreshold: Number(process.env.CROWD_THRESHOLD || 4),
  crowdConfidence: Number(process.env.CROWD_CONFIDENCE || 0.35),
  crowdMinConsecutiveFrames: Math.max(1, Number(process.env.CROWD_MIN_CONSECUTIVE_FRAMES || 2)),
  // Image size the models run at. Larger finds smaller/farther people but is slower.
  detectionSize: Number(process.env.INFERENCE_IMGSZ || 640),
  // 1 = when a scene already has several people, re-scan it in tiles to find more of them
  // in a crowd (slower on those frames). Live-adjustable from the UI.
  denseCounting: Number(process.env.DENSE_COUNTING ?? 1),
  dwellGapSeconds: Number(process.env.DWELL_GAP_SECONDS || 3),
  dbPath: process.env.DB_PATH || path.join(ROOT, "data", "vigilant.db"),
  snapshotsDir: process.env.SNAPSHOTS_DIR || path.join(ROOT, "snapshots"),
  corsOrigin: process.env.CORS_ORIGIN || "http://localhost:5173",
  adminPassword: process.env.ADMIN_PASSWORD || "",
  jwtSecret: process.env.ADMIN_JWT_SECRET || "dev-insecure-secret-change-me",
  // SMS alerts through textbee.dev (an Android phone with the TextBee app is the gateway).
  // Off unless both TEXTBEE_API_KEY and SMS_RECIPIENTS are set. The free plan allows
  // 50 SMS a day / 300 a month and every recipient counts as one, hence the limits below.
  sms: {
    apiKey: process.env.TEXTBEE_API_KEY || "",
    baseUrl: (process.env.TEXTBEE_BASE_URL || "https://api.textbee.dev/api/v1").replace(/\/+$/, ""),
    deviceId: process.env.TEXTBEE_DEVICE_ID || "",
    recipients: csv(process.env.SMS_RECIPIENTS),
    minSeverity: (process.env.SMS_MIN_SEVERITY || "HIGH").toUpperCase(),
    alertTypes: csv(process.env.SMS_ALERT_TYPES || "weapon,zone_intrusion,crowd").map((t) => t.toLowerCase()),
    cooldownSeconds: numberOr(process.env.SMS_COOLDOWN_SECONDS, 300),
    dailyLimit: numberOr(process.env.SMS_DAILY_LIMIT, 40),
  },
};

if (!process.env.ADMIN_JWT_SECRET) {
  console.warn("ADMIN_JWT_SECRET is not set - using a built-in insecure secret. Set a long random value before deploying.");
}

if (!config.adminPassword) {
  console.warn("ADMIN_PASSWORD is not set - admin login will be disabled until it is configured.");
}

export const DEFAULT_ZONE = [
  { x: 0.2, y: 0.2 },
  { x: 0.8, y: 0.2 },
  { x: 0.8, y: 0.8 },
  { x: 0.2, y: 0.8 },
];
