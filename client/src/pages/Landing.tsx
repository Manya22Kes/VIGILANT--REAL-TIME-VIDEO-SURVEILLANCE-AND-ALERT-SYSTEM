import { useState, useCallback, useEffect, useRef, type MouseEvent } from "react";
import GlobeHero, { type DetectionEvent } from "../components/GlobeHero";
import CursorReticle from "../components/CursorReticle";
import CapabilitiesSection from "../components/CapabilitiesSection";
import { useSoundStatus } from "../lib/soundStatus";

const SEVERITY_COLOR = { low: "#4de8f5", critical: "#ff6b5e" };

const TICKER_ITEMS = [
  { text: "ZONE CLEAR // MAIN GATE", color: "#4de8f5" },
  { text: "MODEL LOADED // YOLOV8S CUSTOM", color: "#f2b94d" },
  { text: "PERSON DETECTED // LOGGED", color: "#4de8f5" },
  { text: "SEVERITY ESCALATION // DWELL TRACKED", color: "#f2b94d" },
  { text: "SNAPSHOT SAVED // ALERT LOGGED", color: "#4de8f5" },
  { text: "ZONE POLYGON // LIVE CHECK", color: "#f2b94d" },
];

const INITIAL_CARD: DetectionEvent = {
  zone: "MAIN GATE",
  cam: "cam_01",
  confidence: "91.4",
  line: "tracking // low priority",
  severity: "low",
};

export default function Landing() {
  const [card, setCard] = useState<DetectionEvent>(INITIAL_CARD);
  const [displayCard, setDisplayCard] = useState<DetectionEvent>(INITIAL_CARD);
  const [cardVisible, setCardVisible] = useState(true);
  const [cycleKey, setCycleKey] = useState(0);
  const isFirstCard = useRef(true);
  const { muted } = useSoundStatus();
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);

  const onDetection = useCallback((e: DetectionEvent) => setCard(e), []);
  const trackCursor = useCallback((e: MouseEvent<HTMLDivElement>) => setCursor({ x: e.clientX, y: e.clientY }), []);
  const clearCursor = useCallback(() => setCursor(null), []);

  // vanish the card, swap its content, then fade it back in with the new severity color
  useEffect(() => {
    if (isFirstCard.current) {
      isFirstCard.current = false;
      return;
    }
    setCardVisible(false);
    const t = window.setTimeout(() => {
      setDisplayCard(card);
      setCardVisible(true);
      setCycleKey((k) => k + 1);
    }, 260);
    return () => clearTimeout(t);
  }, [card]);

  const accent = SEVERITY_COLOR[displayCard.severity];

  return (
    <div
      className="relative flex-1 overflow-y-auto cursor-none"
      onMouseMove={trackCursor}
      onMouseLeave={clearCursor}
    >
      {cursor && <CursorReticle x={cursor.x} y={cursor.y} />}

      <div
        className="relative h-full overflow-hidden"
        style={{ background: "radial-gradient(ellipse at 55% 45%, #0d1c22 0%, #060a0d 65%, #050608 100%)" }}
      >
        <GlobeHero onDetection={onDetection} muted={muted} />

        <div className="absolute inset-0 pointer-events-none font-mono">
          <div className="absolute" style={{ top: 108, left: 60, fontSize: 14, fontWeight: 600, letterSpacing: "0.15em", color: "#4de8f5" }}>
            <span style={{ color: "#2f5a62" }}>—— </span>vigilant campus surveillance mesh
          </div>

          <div className="absolute" style={{ top: 140, left: 60, fontFamily: "Arial, sans-serif", fontWeight: 800, lineHeight: 0.98 }}>
            <div style={{ fontSize: 62, color: "#f5f8f9", textShadow: "0 0 20px rgba(255,255,255,0.18)" }}>EVERY FRAME.</div>
            <div style={{ fontSize: 62, color: "transparent", WebkitTextStroke: "1.5px #4de8f5", textShadow: "0 0 26px rgba(77,232,245,0.4)" }}>
              EVERY ZONE.
            </div>
            <div style={{ fontSize: 62, color: "#ff6b5e", textShadow: "0 0 26px rgba(255,107,94,0.45)" }}>WATCHED.</div>
          </div>

          <div className="absolute" style={{ top: 360, left: 60, maxWidth: 420, fontFamily: "Arial, sans-serif", fontSize: 16, fontWeight: 500, lineHeight: 1.6, color: "#c7d0d4" }}>
            An AI camera network that flags the moment someone enters a restricted area on campus — not after.
          </div>

          <div
            className="absolute"
            style={{
              top: 32,
              right: 40,
              width: 230,
              border: `1px solid ${accent}`,
              padding: "14px 16px",
              background: "rgba(8,20,24,0.7)",
              boxShadow: `0 0 30px ${accent}22`,
              opacity: cardVisible ? 1 : 0,
              transform: cardVisible ? "translateY(0)" : "translateY(-6px)",
              transition: "opacity 300ms ease, transform 300ms ease, border-color 400ms ease, box-shadow 400ms ease",
            }}
          >
            <div style={{ fontSize: 10, letterSpacing: "0.1em", color: "#6b8890", marginBottom: 8, textTransform: "uppercase" }}>
              <span
                style={{
                  display: "inline-block",
                  width: 5,
                  height: 5,
                  borderRadius: "50%",
                  background: accent,
                  boxShadow: `0 0 8px ${accent}`,
                  marginRight: 6,
                  transition: "background 400ms ease, box-shadow 400ms ease",
                }}
              />
              sweep pass // threat ping
            </div>
            <div style={{ fontSize: 15, color: "#f5f8f9", fontWeight: "bold", marginBottom: 4 }}>{displayCard.zone}</div>
            <div style={{ fontSize: 11, color: "#7c9098", marginBottom: 8 }}>
              {displayCard.cam} // conf {displayCard.confidence}%
            </div>
            <div style={{ position: "relative", height: 1, marginBottom: 8 }}>
              <div
                key={cycleKey}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  height: 1,
                  background: accent,
                  animation: "countdown-bar 3.6s linear forwards",
                }}
              />
            </div>
            <div
              style={{
                fontSize: 11,
                letterSpacing: "0.05em",
                textTransform: "uppercase",
                color: accent,
                transition: "color 400ms ease",
              }}
            >
              {displayCard.line}
            </div>
          </div>

          <div className="absolute" style={{ inset: 0, background: "radial-gradient(ellipse at 55% 48%, transparent 45%, rgba(0,0,0,0.55) 100%)" }} />
        </div>
      </div>

      <div
        className="relative border-t border-b border-[#132227] px-16 py-5 flex flex-wrap items-center gap-x-12 gap-y-2 font-mono text-sm tracking-wide"
        style={{ background: "#070b0d" }}
      >
        <span className="flex items-center gap-2" style={{ color: "#4de8f5" }}>
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: "#4de8f5",
              boxShadow: "0 0 6px #4de8f5",
              animation: "rec-blink 1.8s infinite",
            }}
          />
          LIVE
        </span>
        <span style={{ color: "#6b8890" }}>
          ZONE <span style={{ color: "#e7ecee" }}>{card.zone}</span>
        </span>
        <span style={{ color: "#6b8890" }}>
          CAM <span style={{ color: "#e7ecee" }}>{card.cam}</span>
        </span>
        <span style={{ color: "#6b8890" }}>
          CONF <span style={{ color: "#e7ecee" }}>{card.confidence}%</span>
        </span>
        <span style={{ color: "#6b8890" }}>
          MODEL <span style={{ color: "#e7ecee" }}>yolov8s</span>
        </span>
      </div>

      <div className="relative overflow-hidden border-b border-[#132227] py-4" style={{ background: "#050608" }}>
        <div className="flex whitespace-nowrap font-mono text-sm tracking-wide" style={{ animation: "ticker-scroll 22s linear infinite", width: "max-content" }}>
          {[...TICKER_ITEMS, ...TICKER_ITEMS].map((item, i) => (
            <span key={i} className="flex items-center">
              <span style={{ color: item.color }}>{item.text}</span>
              <span style={{ color: "#3a4a50", margin: "0 28px" }}>///</span>
            </span>
          ))}
        </div>
      </div>

      <CapabilitiesSection />
    </div>
  );
}
