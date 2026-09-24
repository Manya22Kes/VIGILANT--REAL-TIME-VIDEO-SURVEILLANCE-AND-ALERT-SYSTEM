import path from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

export const config = {
  port: Number(process.env.PORT || 4000),
  inferenceServiceUrl: process.env.INFERENCE_SERVICE_URL || "http://localhost:8001",
  confidenceThreshold: Number(process.env.CONFIDENCE_THRESHOLD || 0.5),
  alertCooldownSeconds: Number(process.env.ALERT_COOLDOWN_SECONDS || 10),
  dwellGapSeconds: Number(process.env.DWELL_GAP_SECONDS || 3),
  dbPath: process.env.DB_PATH || path.join(ROOT, "data", "vigilant.db"),
  snapshotsDir: process.env.SNAPSHOTS_DIR || path.join(ROOT, "snapshots"),
  corsOrigin: process.env.CORS_ORIGIN || "http://localhost:5173",
  adminPassword: process.env.ADMIN_PASSWORD || "",
  jwtSecret: process.env.ADMIN_JWT_SECRET || "dev-insecure-secret-change-me",
};

if (!config.adminPassword) {
  console.warn("ADMIN_PASSWORD is not set - admin login will be disabled until it is configured.");
}

export const DEFAULT_ZONE = [
  { x: 0.2, y: 0.2 },
  { x: 0.8, y: 0.2 },
  { x: 0.8, y: 0.8 },
  { x: 0.2, y: 0.8 },
];
