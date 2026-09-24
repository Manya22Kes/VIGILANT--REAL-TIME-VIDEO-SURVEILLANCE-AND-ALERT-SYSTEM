import { useEffect, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { api, type SystemStatus } from "../lib/api";
import { useCameraStatus } from "../lib/cameraStatus";
import { useAuth } from "../lib/authContext";
import { useSoundStatus } from "../lib/soundStatus";
import BracketMark from "./BracketMark";

function Dot({ color }: { color: string }) {
  return <span className="inline-block w-1.5 h-1.5 rounded-full mr-2" style={{ background: color, boxShadow: `0 0 6px ${color}` }} />;
}

export default function StatusBar() {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [failed, setFailed] = useState(false);
  const { state: cameraState } = useCameraStatus();
  const { logout } = useAuth();
  const { muted, toggleMuted } = useSoundStatus();

  useEffect(() => {
    let cancelled = false;
    const poll = () => {
      api
        .systemStatus()
        .then((s) => {
          if (!cancelled) {
            setStatus(s);
            setFailed(false);
          }
        })
        .catch(() => {
          if (!cancelled) setFailed(true);
        });
    };
    poll();
    const id = setInterval(poll, 5000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const backendColor = failed ? "#ff6b5e" : "#4de8f5";
  const backendLabel = failed ? "backend offline" : "backend connected";

  const modelColor = !status?.inference.reachable ? "#ff6b5e" : status.inference.model_source === "custom" ? "#4de8f5" : "#f2b94d";
  const modelLabel = !status?.inference
    ? "checking model…"
    : !status.inference.reachable
      ? "model unreachable"
      : status.inference.model_source === "custom"
        ? "trained model loaded"
        : status.inference.model_source === "not_loaded_yet"
          ? "model idle"
          : "fallback model";

  const camColor = cameraState === "active" ? "#4de8f5" : cameraState === "error" ? "#ff6b5e" : "#5c6e74";
  const camLabel = cameraState === "active" ? "camera active" : cameraState === "error" ? "camera error" : "camera inactive";

  return (
    <div className="flex items-center gap-7 px-6 py-3.5 bg-[#070b0d] border-b border-[#132227] font-mono text-sm tracking-wide text-[#7c9098]">
      <span className="flex items-center gap-2 text-[#f5f8f9] font-bold tracking-widest text-xl">
        <BracketMark size={19} />
        VIGILANT.
      </span>
      <span className="flex items-center"><Dot color={backendColor} />{backendLabel}</span>
      <span className="flex items-center"><Dot color={modelColor} />{modelLabel}</span>
      <span className="flex items-center"><Dot color={camColor} />{camLabel}</span>
      <button
        onClick={toggleMuted}
        title={muted ? "unmute detection ping" : "mute detection ping"}
        className="ml-auto flex items-center gap-2 px-3 py-1.5 text-sm tracking-wide border border-[#2a3a40] text-[#93a2a8] hover:bg-[#0f1a1d] rounded"
      >
        {muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
        {muted ? "sound off" : "sound on"}
      </button>
      <button
        onClick={logout}
        className="px-3 py-1.5 text-sm tracking-wide border border-[#2a3a40] text-[#93a2a8] hover:bg-[#0f1a1d] rounded"
      >
        log out
      </button>
    </div>
  );
}
