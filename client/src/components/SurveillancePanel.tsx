import type { CSSProperties } from "react";

const CORNERS: CSSProperties[] = [
  { top: -1, left: -1, borderTop: "2px solid #4de8f5", borderLeft: "2px solid #4de8f5" },
  { top: -1, right: -1, borderTop: "2px solid #4de8f5", borderRight: "2px solid #4de8f5" },
  { bottom: -1, right: -1, borderBottom: "2px solid #4de8f5", borderRight: "2px solid #4de8f5" },
  { bottom: -1, left: -1, borderBottom: "2px solid #4de8f5", borderLeft: "2px solid #4de8f5" },
];

interface SurveillancePanelProps {
  channel?: string;
  trackId?: string;
  confidence?: string;
  mode?: string;
}

export default function SurveillancePanel({
  channel = "CH.01",
  trackId = "VG-0417",
  confidence = "91.4%",
  mode = "LIVE + UPLOAD",
}: SurveillancePanelProps) {
  return (
    <div className="relative" style={{ width: 340, border: "1px solid #1f4952", background: "#0a1216", padding: "28px 20px 16px" }}>
      {CORNERS.map((style, i) => (
        <div key={i} className="absolute pointer-events-none" style={{ width: 18, height: 18, ...style }} />
      ))}

      <div
        className="absolute top-3 left-4 flex items-center gap-2 font-mono text-[10px] tracking-wide"
        style={{ color: "#4de8f5" }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: "#ff6b5e",
            boxShadow: "0 0 8px #ff6b5e",
            animation: "rec-blink 1.4s infinite",
          }}
        />
        REC // {channel}
      </div>

      <div className="relative mt-5 mb-5 overflow-hidden" style={{ height: 172 }}>
        <img src="/camera-wall.jpg" alt="wall of security cameras" className="block w-full h-full" style={{ objectFit: "cover" }} />
        <div
          className="pointer-events-none absolute left-0 right-0"
          style={{
            height: 3,
            background: "linear-gradient(90deg, transparent, #4de8f5, transparent)",
            boxShadow: "0 0 14px 3px rgba(77,232,245,0.85)",
            animation: "scan-sweep 3s ease-in-out infinite",
          }}
        />
      </div>

      <div
        className="font-mono text-[10px] tracking-wide flex flex-wrap gap-x-5 gap-y-1"
        style={{ color: "#7c9098", borderTop: "1px solid #1f4952", paddingTop: 10 }}
      >
        <span>TRACK ID: {trackId}</span>
        <span>CONFIDENCE {confidence}</span>
        <span>MODE: {mode}</span>
      </div>
    </div>
  );
}
