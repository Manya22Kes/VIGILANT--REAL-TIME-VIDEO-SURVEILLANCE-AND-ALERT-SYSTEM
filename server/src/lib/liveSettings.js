import { config } from "../config.js";
import { statements } from "../db.js";

// Settings that can be changed at runtime from the UI without restarting the server.
// Defaults come from config.js (.env); values changed from the UI are saved in the
// SQLite settings table and win over the defaults, including after a restart.
export const SETTING_DEFS = {
  confidenceThreshold: { type: "number", min: 0.05, max: 0.95, default: config.confidenceThreshold },
  weaponConfidenceThreshold: { type: "number", min: 0.05, max: 0.95, default: config.weaponConfidenceThreshold },
  crowdConfidence: { type: "number", min: 0.05, max: 0.95, default: config.crowdConfidence },
  cooldownSeconds: { type: "integer", min: 1, max: 120, default: config.alertCooldownSeconds },
  crowdThreshold: { type: "integer", min: 2, max: 100, default: config.crowdThreshold },
  detectionSize: { type: "choice", choices: [640, 960, 1280], default: config.detectionSize },
  denseCounting: { type: "choice", choices: [0, 1], default: config.denseCounting },
};

const STORAGE_KEY = "live_settings";

function validateValue(key, value) {
  const def = SETTING_DEFS[key];
  if (typeof value !== "number" || !Number.isFinite(value)) return `${key} must be a number`;
  if (def.type === "choice") {
    if (!def.choices.includes(value)) return `${key} must be one of ${def.choices.join(", ")}`;
    return null;
  }
  if (def.type === "integer" && !Number.isInteger(value)) return `${key} must be a whole number`;
  if (value < def.min || value > def.max) return `${key} must be between ${def.min} and ${def.max}`;
  return null;
}

function defaults() {
  const out = {};
  for (const [key, def] of Object.entries(SETTING_DEFS)) {
    // A bad value in .env falls back to a safe default rather than breaking detection.
    out[key] = validateValue(key, def.default) === null ? def.default : fallbackDefault(key);
  }
  return out;
}

const SAFE_DEFAULTS = {
  confidenceThreshold: 0.5,
  weaponConfidenceThreshold: 0.5,
  crowdConfidence: 0.35,
  cooldownSeconds: 10,
  crowdThreshold: 4,
  detectionSize: 640,
  denseCounting: 1,
};
const fallbackDefault = (key) => SAFE_DEFAULTS[key];

function load() {
  const current = defaults();
  const row = statements.getSetting.get(STORAGE_KEY);
  if (row) {
    try {
      const saved = JSON.parse(row.value);
      for (const key of Object.keys(SETTING_DEFS)) {
        if (key in saved && validateValue(key, saved[key]) === null) current[key] = saved[key];
      }
    } catch {
      // corrupt saved value: keep defaults
    }
  }
  return current;
}

let current = load();

export function getSettings() {
  return { ...current };
}

// Returns { settings } on success or { error } if any field is unknown or out of range.
// Nothing is changed unless every field in the patch is valid.
export function updateSettings(patch) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
    return { error: "body must be a JSON object of settings" };
  }
  const keys = Object.keys(patch);
  if (keys.length === 0) return { error: "no settings provided" };
  for (const key of keys) {
    if (!(key in SETTING_DEFS)) return { error: `unknown setting: ${key}` };
    const err = validateValue(key, patch[key]);
    if (err) return { error: err };
  }
  current = { ...current, ...patch };
  statements.setSetting.run({ key: STORAGE_KEY, value: JSON.stringify(current) });
  return { settings: { ...current } };
}

// Ranges the UI needs to draw its sliders.
export function settingLimits() {
  const out = {};
  for (const [key, def] of Object.entries(SETTING_DEFS)) {
    out[key] = def.type === "choice" ? { choices: def.choices } : { min: def.min, max: def.max };
  }
  return out;
}
