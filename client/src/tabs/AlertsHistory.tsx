import { useEffect, useState } from "react";
import { api, type Alert } from "../lib/api";

const severityColor: Record<Alert["severity"], string> = {
  LOW: "#4de8f5",
  MEDIUM: "#f2b94d",
  HIGH: "#ff6b5e",
};

const typeStyle: Record<Alert["type"], { label: string; color: string; border: string }> = {
  weapon: { label: "weapon", color: "#ff2e63", border: "#ff2e63" },
  crowd: { label: "crowd", color: "#f2b94d", border: "#f2b94d" },
  zone_intrusion: { label: "zone", color: "#93a2a8", border: "#2a3a40" },
};

export default function AlertsHistory() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      api
        .alerts(100)
        .then((r) => {
          if (!cancelled) {
            setAlerts(r.alerts);
            setLoading(false);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setError("could not reach backend");
            setLoading(false);
          }
        });
    };
    load();
    const id = setInterval(load, 8000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return (
    <div className="flex-1 p-6 bg-[#050608] font-mono text-[#93a2a8] overflow-auto">
      <div className="flex items-center justify-between mb-4">
        <div className="text-sm tracking-wide text-[#4de8f5]">{alerts.length} alert{alerts.length !== 1 ? "s" : ""} logged</div>
        <a
          href={api.exportAlertsUrl()}
          download
          className="px-4 py-2 text-xs tracking-wide border border-[#2a3a40] text-[#93a2a8] hover:bg-[#0f1a1d] rounded"
        >
          export csv
        </a>
      </div>

      {loading && <div className="text-xs">loading…</div>}
      {error && <div className="text-xs text-[#ff6b5e]">{error}</div>}
      {!loading && !error && alerts.length === 0 && <div className="text-xs">no alerts yet — trigger one from the live feed tab</div>}

      <div className="flex flex-col gap-2">
        {alerts.map((a) => (
          <div key={a.id} className="flex items-center gap-4 border border-[#132227] px-4 py-3 text-xs">
            <span
              className="px-2 py-0.5 rounded text-[10px] font-bold"
              style={{ color: severityColor[a.severity], border: `1px solid ${severityColor[a.severity]}` }}
            >
              {a.severity}
            </span>
            <span
              className="px-2 py-0.5 rounded text-[10px] tracking-wide"
              style={{ color: (typeStyle[a.type] ?? typeStyle.zone_intrusion).color, border: `1px solid ${(typeStyle[a.type] ?? typeStyle.zone_intrusion).border}` }}
            >
              {(typeStyle[a.type] ?? typeStyle.zone_intrusion).label}
            </span>
            <span className="text-[#f5f8f9]">{new Date(a.timestamp).toLocaleString()}</span>
            <span>conf {(a.confidence * 100).toFixed(1)}%</span>
            <span>{a.type === "crowd" ? `${a.num_detections} people` : `${a.num_detections} detection(s)`}</span>
            {a.type === "zone_intrusion" && <span>{a.time_in_zone.toFixed(1)}s in zone</span>}
            {a.snapshot_path && (
              <span className="ml-auto flex gap-4">
                <a href={api.snapshotUrl(a.snapshot_path)} target="_blank" rel="noreferrer" className="text-[#4de8f5] hover:underline">
                  view snapshot
                </a>
                <a href={api.snapshotDownloadUrl(a.id)} className="text-[#93a2a8] hover:underline">
                  download
                </a>
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
