import { useEffect, useState } from "react";
import { api, type Stats } from "../lib/api";
import { MODEL_METRICS, MODEL_VALIDATION_NOTE } from "../lib/modelMetrics";

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-[#132227] px-5 py-4">
      <div className="text-[11px] tracking-wide text-[#6b8890] mb-2">{label}</div>
      <div className="text-2xl text-[#f5f8f9]">{value}</div>
    </div>
  );
}

export default function ModelStats() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () => api.stats().then((s) => !cancelled && setStats(s)).catch(() => {});
    load();
    const id = setInterval(load, 8000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return (
    <div className="flex-1 p-10 bg-[#050608] font-mono text-[#93a2a8] overflow-auto">
      <div className="mx-auto" style={{ maxWidth: 900 }}>
        <div className="text-sm tracking-wide text-[#4de8f5] mb-4">
          <span style={{ color: "#2f5a62" }}>—— </span>live intelligence
        </div>
        <div style={{ fontFamily: "Arial, sans-serif", fontWeight: 800, fontSize: 42, color: "#f5f8f9", lineHeight: 1, marginBottom: 44 }}>
          THE MESH NEVER SLEEPS.
        </div>

        <div className="text-sm tracking-wide text-[#4de8f5] mb-4">live alert breakdown</div>
        <div className="grid grid-cols-4 gap-4 mb-12" style={{ maxWidth: 760 }}>
          <StatCard label="total alerts" value={stats ? String(stats.total) : "—"} />
          <StatCard label="low" value={stats ? String(stats.bySeverity.LOW) : "—"} />
          <StatCard label="medium" value={stats ? String(stats.bySeverity.MEDIUM) : "—"} />
          <StatCard label="high" value={stats ? String(stats.bySeverity.HIGH) : "—"} />
        </div>

        <div className="text-sm tracking-wide text-[#4de8f5] mb-4">trained model — yolov8s, 50 epochs</div>
        <div className="grid grid-cols-4 gap-4 mb-3" style={{ maxWidth: 760 }}>
          <StatCard label="mAP50" value={MODEL_METRICS.map50} />
          <StatCard label="mAP50-95" value={MODEL_METRICS.map50_95} />
          <StatCard label="precision" value={MODEL_METRICS.precision} />
          <StatCard label="recall" value={MODEL_METRICS.recall} />
        </div>
        <div className="text-xs text-[#4a5a63] max-w-md">{MODEL_VALIDATION_NOTE}</div>
      </div>
    </div>
  );
}
