const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:4000";

export interface SystemStatus {
  server: "ok" | "error";
  inference: { reachable: boolean; model_source: string | null; weapon_model?: string | null };
}

export interface Alert {
  id: number;
  timestamp: string;
  severity: "LOW" | "MEDIUM" | "HIGH";
  type: "zone_intrusion" | "weapon" | "crowd";
  confidence: number;
  num_detections: number;
  time_in_zone: number;
  snapshot_path: string | null;
}

export interface Stats {
  total: number;
  bySeverity: { LOW: number; MEDIUM: number; HIGH: number };
  byType?: { zone_intrusion: number; weapon: number; crowd: number };
}

export interface LiveSettings {
  confidenceThreshold: number;
  weaponConfidenceThreshold: number;
  crowdConfidence: number;
  cooldownSeconds: number;
  crowdThreshold: number;
  detectionSize: number;
  denseCounting: number;
}

export interface SmsStatus {
  configured: boolean;
  enabled: boolean;
  recipients: number;
  minSeverity: string;
  alertTypes: string[];
  cooldownSeconds: number;
  sentToday: number;
  dailyLimit: number;
}

export type SettingLimits = Record<keyof LiveSettings, { min: number; max: number } | { choices: number[] }>;

export interface ZonePoint {
  x: number;
  y: number;
}

export class ApiError extends Error {
  status: number;
  constructor(path: string, status: number) {
    super(`${path} failed: ${status}`);
    this.status = status;
  }
}

let authToken: string | null = null;
export function setAuthToken(token: string | null) {
  authToken = token;
}

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (authToken) headers.set("Authorization", `Bearer ${authToken}`);
  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  if (!res.ok) throw new ApiError(path, res.status);
  return res.json() as Promise<T>;
}

export const api = {
  login: (password: string) =>
    json<{ token: string }>("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    }),
  systemStatus: () => json<SystemStatus>("/api/system"),
  alerts: (limit = 50) => json<{ alerts: Alert[]; total: number }>(`/api/alerts?limit=${limit}`),
  stats: () => json<Stats>("/api/stats"),
  settings: () => json<{ settings: LiveSettings; limits: SettingLimits }>("/api/settings"),
  setSettings: (patch: Partial<LiveSettings>) =>
    json<{ settings: LiveSettings; limits: SettingLimits }>("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }),
  smsStatus: () => json<SmsStatus>("/api/sms"),
  smsSetEnabled: (enabled: boolean) =>
    json<SmsStatus>("/api/sms/enabled", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    }),
  smsTest: () => json<{ ok: boolean; recipients: number; detail: string }>("/api/sms/test", { method: "POST" }),
  snapshotDownloadUrl: (alertId: number) => `${API_BASE}/api/alerts/${alertId}/snapshot`,
  exportAlertsUrl: () => `${API_BASE}/api/alerts/export.csv`,
  zone: () => json<{ zone: ZonePoint[] }>("/api/zone"),
  setZone: (zone: ZonePoint[]) =>
    json<{ zone: ZonePoint[] }>("/api/zone", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ zone }),
    }),
  detectFrame: (blob: Blob) => {
    const form = new FormData();
    form.append("frame", blob, "frame.jpg");
    return json<{
      detections: Array<{ label: "person" | "weapon"; confidence: number; bbox: number[]; in_zone: boolean; strong: boolean }>;
      zone: ZonePoint[];
      image_width: number;
      image_height: number;
      time_in_zone: number;
      person_count: number;
      crowd_threshold: number;
      dense_pass: boolean;
      alert: Alert | null;
      alerts: Alert[];
    }>("/api/detect-frame", { method: "POST", body: form });
  },
  snapshotUrl: (path: string) => `${API_BASE}${path}`,
};
