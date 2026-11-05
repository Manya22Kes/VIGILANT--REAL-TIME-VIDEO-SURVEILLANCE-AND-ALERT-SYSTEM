import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";

fs.mkdirSync(config.snapshotsDir, { recursive: true });

// The saved file's extension must match what is really inside it. The live camera always
// sends JPEG, but an uploaded image can be PNG/WebP/GIF; saving those as ".jpg" gives a file
// that browsers happen to display but that other apps (and "download") refuse to open.
export function detectImageExtension(buf) {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpg";
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (buf.length >= 12 && buf.toString("latin1", 0, 4) === "RIFF" && buf.toString("latin1", 8, 12) === "WEBP") return "webp";
  if (buf.length >= 6 && buf.toString("latin1", 0, 3) === "GIF") return "gif";
  return "jpg";
}

export function saveSnapshot(buffer) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `alert_${stamp}.${detectImageExtension(buffer)}`;
  fs.writeFileSync(path.join(config.snapshotsDir, filename), buffer);
  // Served statically by index.js at /snapshots/<filename>
  return `/snapshots/${filename}`;
}
