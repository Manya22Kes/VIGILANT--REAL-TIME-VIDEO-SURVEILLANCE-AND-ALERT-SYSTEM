import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";

fs.mkdirSync(config.snapshotsDir, { recursive: true });

export function saveSnapshot(buffer) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `alert_${stamp}.jpg`;
  fs.writeFileSync(path.join(config.snapshotsDir, filename), buffer);
  // Served statically by index.js at /snapshots/<filename>
  return `/snapshots/${filename}`;
}
