import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { config, DEFAULT_ZONE } from "./config.js";

fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });

export const db = new Database(config.dbPath);
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL,
    severity TEXT NOT NULL,
    confidence REAL NOT NULL,
    num_detections INTEGER NOT NULL,
    time_in_zone REAL NOT NULL DEFAULT 0,
    snapshot_path TEXT
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

// Seed a default restricted zone if none has been configured yet.
const existingZone = db.prepare("SELECT value FROM settings WHERE key = 'restricted_zone'").get();
if (!existingZone) {
  db.prepare("INSERT INTO settings (key, value) VALUES ('restricted_zone', ?)").run(
    JSON.stringify(DEFAULT_ZONE)
  );
}

export const statements = {
  insertAlert: db.prepare(`
    INSERT INTO alerts (timestamp, severity, confidence, num_detections, time_in_zone, snapshot_path)
    VALUES (@timestamp, @severity, @confidence, @num_detections, @time_in_zone, @snapshot_path)
  `),
  listAlerts: db.prepare(`
    SELECT * FROM alerts ORDER BY id DESC LIMIT @limit OFFSET @offset
  `),
  getAlert: db.prepare(`SELECT * FROM alerts WHERE id = ?`),
  countAll: db.prepare(`SELECT COUNT(*) AS count FROM alerts`),
  countBySeverity: db.prepare(`SELECT severity, COUNT(*) AS count FROM alerts GROUP BY severity`),
  getSetting: db.prepare(`SELECT value FROM settings WHERE key = ?`),
  setSetting: db.prepare(`
    INSERT INTO settings (key, value) VALUES (@key, @value)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `),
};
