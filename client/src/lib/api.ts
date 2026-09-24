const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:4000";

export interface SystemStatus {
  server: "ok" | "error";
  inference: { reachable: boolean; model_source: string | null };
}

export interface Alert {
  id: number;
  timestamp: string;
  severity: "LOW" | "MEDIUM" | "HIGH";
  confidence: number;
  num_detections: number;
  time_in_zone: number;
  snapshot_path: string | null;
}

export interface Stats {
  total: number;
  bySeverity: { LOW: number; MEDIUM: number; HIGH: number };
}

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
      detections: Array<{ confidence: number; bbox: number[]; in_zone: boolean }>;
      zone: ZonePoint[];
      image_width: number;
      image_height: number;
      time_in_zone: number;
      alert: Alert | null;
    }>("/api/detect-frame", { method: "POST", body: form });
  },
  snapshotUrl: (path: string) => `${API_BASE}${path}`,
};
