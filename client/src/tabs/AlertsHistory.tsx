import { useEffect, useState } from "react";
import { api, type Alert } from "../lib/api";

const severityColor: Record<Alert["severity"], string> = {
  LOW: "#4de8f5",
  MEDIUM: "#f2b94d",
  HIGH: "#ff6b5e",
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
      <div className="text-sm tracking-wide text-[#4de8f5] mb-4">{alerts.length} alert{alerts.length !== 1 ? "s" : ""} logged</div>

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
            <span className="text-[#f5f8f9]">{new Date(a.timestamp).toLocaleString()}</span>
            <span>conf {(a.confidence * 100).toFixed(1)}%</span>
            <span>{a.num_detections} detection(s)</span>
            <span>{a.time_in_zone.toFixed(1)}s in zone</span>
            {a.snapshot_path && (
              <a href={api.snapshotUrl(a.snapshot_path)} target="_blank" rel="noreferrer" className="text-[#4de8f5] ml-auto hover:underline">
                view snapshot
              </a>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
