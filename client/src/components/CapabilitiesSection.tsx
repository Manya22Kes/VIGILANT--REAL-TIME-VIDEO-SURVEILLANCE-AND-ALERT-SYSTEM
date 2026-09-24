import { useState } from "react";
import { MODEL_METRICS } from "../lib/modelMetrics";
import SurveillancePanel from "./SurveillancePanel";

const SYSTEMS = [
  {
    title: "detection pipeline",
    body: "Every frame from a live camera or an uploaded image/video is sent to our own YOLOv8s inference service, then checked against the restricted zone polygon you define.",
  },
  {
    title: "severity & dwell scoring",
    body: "A person passing near the edge scores low. The longer someone stays inside the zone, the higher the severity climbs — low, medium, high.",
  },
  {
    title: "alert log & snapshots",
    body: "Every flagged event is written to the database with a timestamp, confidence score, and a saved snapshot image — browsable in Alerts History.",
  },
  {
    title: "live feed + upload fallback",
    body: "Run detection from a live webcam stream, or fall back to an uploaded image or short video clip when a camera isn't available — same pipeline either way.",
  },
];

function MetricTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-[#132227] px-4 py-3">
      <div className="text-[10px] tracking-wide text-[#6b8890] mb-1">{label}</div>
      <div className="text-lg text-[#f5f8f9]">{value}</div>
    </div>
  );
}

export default function CapabilitiesSection() {
  const [active, setActive] = useState(0);

  return (
    <div className="relative px-16 py-20 font-mono" style={{ background: "#050608" }}>
      <div className="text-sm tracking-wide text-[#4de8f5] mb-4">
        <span style={{ color: "#2f5a62" }}>—— </span>capabilities manifesto
      </div>
      <div style={{ fontFamily: "Arial, sans-serif", fontWeight: 800, lineHeight: 1.05, marginBottom: 56, maxWidth: 920 }}>
        <span style={{ fontSize: 44, color: "#f5f8f9" }}>FOUR STAGES. </span>
        <span style={{ fontSize: 44, color: "transparent", WebkitTextStroke: "1.5px #4de8f5" }}>ONE RESTRICTED ZONE.</span>
      </div>

      <div className="flex flex-wrap gap-16" style={{ maxWidth: 1160 }}>
        <div style={{ flex: "1 1 460px" }}>
          {SYSTEMS.map((s, i) => {
            const isActive = i === active;
            return (
              <button
                key={s.title}
                onClick={() => setActive(i)}
                className="block w-full text-left"
                style={{
                  padding: isActive ? "20px 24px" : "18px 6px",
                  marginBottom: 2,
                  background: isActive ? "#0d1a1f" : "transparent",
                  border: isActive ? "1px solid #1f4952" : "none",
                  borderBottom: isActive ? "1px solid #1f4952" : "1px solid #132227",
                  cursor: "pointer",
                  transition: "background 250ms ease, padding 250ms ease",
                }}
              >
                <div className="flex items-start gap-4">
                  <span
                    style={{
                      fontSize: 26,
                      fontWeight: 800,
                      color: isActive ? "#4de8f5" : "#2f5a62",
                      fontFamily: "Arial, sans-serif",
                      transition: "color 250ms ease",
                    }}
                  >
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <div style={{ flex: 1 }}>
                    <div
                      style={{
                        fontSize: 15,
                        color: isActive ? "#f5f8f9" : "#93a2a8",
                        fontWeight: "bold",
                        textTransform: "uppercase",
                        letterSpacing: "0.02em",
                      }}
                    >
                      {s.title}
                    </div>
                    {isActive && (
                      <p className="text-sm leading-relaxed text-[#93a2a8] mt-3" style={{ maxWidth: 420 }}>
                        {s.body}
                      </p>
                    )}
                  </div>
                  {!isActive && (
                    <span style={{ color: "#4de8f5", fontSize: 16 }} aria-hidden>
                      →
                    </span>
                  )}
                </div>
              </button>
            );
          })}

          <div className="grid grid-cols-2 gap-3 mt-10" style={{ maxWidth: 340 }}>
            <MetricTile label="mAP50 (trained model)" value={MODEL_METRICS.map50} />
            <MetricTile label="precision" value={MODEL_METRICS.precision} />
          </div>
        </div>

        <div style={{ position: "sticky", top: 24, alignSelf: "flex-start" }}>
          <div className="text-[10px] tracking-wide text-[#6b8890] mb-3">live detection, illustrated</div>
          <SurveillancePanel channel={`CH.0${active + 1}`} />
        </div>
      </div>
    </div>
  );
}
