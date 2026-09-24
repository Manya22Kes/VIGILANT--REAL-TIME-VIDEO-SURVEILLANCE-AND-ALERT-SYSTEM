import { useRef, useState, useCallback, useEffect, type ChangeEvent } from "react";
import { api, ApiError, type Alert, type ZonePoint } from "../lib/api";
import { useCameraStatus } from "../lib/cameraStatus";
import { useAuth } from "../lib/authContext";
import ZoneEditor from "../components/ZoneEditor";

const CAPTURE_INTERVAL_MS = 1200;
const FRAME_W = 640;
const FRAME_H = 480;

type Mode = "idle" | "camera" | "video" | "image";

export default function LiveFeed() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const captureCanvasRef = useRef<HTMLCanvasElement>(document.createElement("canvas"));
  const intervalRef = useRef<number | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { setState: setCameraState } = useCameraStatus();
  const { logout } = useAuth();
  const [mode, setMode] = useState<Mode>("idle");
  const [lastAlert, setLastAlert] = useState<Alert | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [zone, setZone] = useState<ZonePoint[] | null>(null);
  const [isEditingZone, setIsEditingZone] = useState(false);
  const isEditingZoneRef = useRef(false);
  useEffect(() => {
    isEditingZoneRef.current = isEditingZone;
  }, [isEditingZone]);
  const [savingZone, setSavingZone] = useState(false);

  useEffect(() => {
    api.zone().then((r) => setZone(r.zone)).catch(() => setZone(null));
  }, []);

  const saveZone = useCallback(
    async (newZone: ZonePoint[]) => {
      setSavingZone(true);
      try {
        const r = await api.setZone(newZone);
        setZone(r.zone);
        setIsEditingZone(false);
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          logout();
        } else {
          setError("could not save zone - is the backend running?");
        }
      } finally {
        setSavingZone(false);
      }
    },
    [logout],
  );

  // Runs a detection call against any image blob and draws the result on the overlay
  // canvas at the given pixel dimensions - shared by the live camera loop, the uploaded
  // video loop, and the single-shot uploaded image path.
  const runDetectionOnBlob = useCallback(async (blob: Blob, width: number, height: number) => {
    const overlay = canvasRef.current;
    if (!overlay) return;

    try {
      const result = await api.detectFrame(blob);
      if (result.alert) setLastAlert(result.alert);

      overlay.width = width;
      overlay.height = height;
      const octx = overlay.getContext("2d");
      if (!octx) return;
      octx.clearRect(0, 0, width, height);

      octx.strokeStyle = "#4de8f5";
      octx.lineWidth = 2;
      if (!isEditingZoneRef.current) {
        octx.beginPath();
        result.zone.forEach((p, i) => (i === 0 ? octx.moveTo(p.x, p.y) : octx.lineTo(p.x, p.y)));
        octx.closePath();
        octx.stroke();
      }

      result.detections.forEach((d) => {
        const [x1, y1, x2, y2] = d.bbox;
        octx.strokeStyle = d.in_zone ? "#ff6b5e" : "#3d95a3";
        octx.lineWidth = d.in_zone ? 3 : 1.5;
        octx.strokeRect(x1, y1, x2 - x1, y2 - y1);
        octx.fillStyle = d.in_zone ? "#ff6b5e" : "#3d95a3";
        octx.font = "13px monospace";
        octx.fillText(`${(d.confidence * 100).toFixed(0)}%`, x1, y1 - 4);
      });
    } catch {
      // one failed frame isn't worth surfacing - just skip this tick
    }
  }, []);

  // Grabs the current frame from videoRef (live webcam stream or an uploaded video
  // file being played back) and runs detection on it. Used as the interval tick for
  // both sources.
  const captureAndDetect = useCallback(async () => {
    const video = videoRef.current;
    const captureCanvas = captureCanvasRef.current;
    if (!video || video.readyState < 2) return;

    captureCanvas.width = video.videoWidth;
    captureCanvas.height = video.videoHeight;
    const ctx = captureCanvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);

    const blob: Blob | null = await new Promise((resolve) => captureCanvas.toBlob(resolve, "image/jpeg", 0.85));
    if (!blob) return;
    await runDetectionOnBlob(blob, video.videoWidth, video.videoHeight);
  }, [runDetectionOnBlob]);

  const startCamera = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
      if (videoRef.current) videoRef.current.srcObject = stream;
      setCameraState("active");
      setMode("camera");
      intervalRef.current = window.setInterval(captureAndDetect, CAPTURE_INTERVAL_MS);
    } catch (err) {
      setCameraState("error");
      setError(err instanceof Error ? err.message : "could not access camera");
    }
  }, [captureAndDetect, setCameraState]);

  const startUploadedVideo = useCallback(
    (file: File) => {
      setError(null);
      const url = URL.createObjectURL(file);
      objectUrlRef.current = url;
      const video = videoRef.current;
      if (video) {
        video.srcObject = null;
        video.src = url;
        video.play().catch(() => {});
      }
      setMode("video");
      intervalRef.current = window.setInterval(captureAndDetect, CAPTURE_INTERVAL_MS);
    },
    [captureAndDetect],
  );

  const detectUploadedImage = useCallback(
    (file: File) => {
      setError(null);
      const url = URL.createObjectURL(file);
      objectUrlRef.current = url;
      const img = new Image();
      img.onload = () => {
        if (imageRef.current) imageRef.current.src = url;
        void runDetectionOnBlob(file, img.naturalWidth, img.naturalHeight);
      };
      img.src = url;
      setMode("image");
    },
    [runDetectionOnBlob],
  );

  const stopSource = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = null;

    const video = videoRef.current;
    if (video) {
      const stream = video.srcObject as MediaStream | null;
      stream?.getTracks().forEach((t) => t.stop());
      video.srcObject = null;
      video.removeAttribute("src");
      video.load();
    }
    if (imageRef.current) imageRef.current.removeAttribute("src");
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }

    setCameraState("inactive");
    setMode("idle");
  }, [setCameraState]);

  const handleFileChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;

      if (file.type.startsWith("image/")) {
        detectUploadedImage(file);
      } else if (file.type.startsWith("video/")) {
        startUploadedVideo(file);
      } else {
        setError("unsupported file type - use jpg, png, or mp4");
      }
    },
    [detectUploadedImage, startUploadedVideo],
  );

  useEffect(() => () => stopSource(), [stopSource]);

  const isActive = mode !== "idle";

  return (
    <div className="flex-1 p-10 bg-[#050608] font-mono text-[#93a2a8]">
      <div className="text-sm tracking-wide text-[#4de8f5] mb-6">
        <span style={{ color: "#2f5a62" }}>—— </span>live feed
      </div>
      <div className="flex items-center justify-center gap-3 mb-5 mx-auto" style={{ width: FRAME_W }}>
        {!isActive ? (
          <>
            <button onClick={startCamera} className="px-5 py-2.5 text-sm tracking-wide border border-[#1f4952] text-[#4de8f5] hover:bg-[#0f2226] rounded">
              start camera
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-5 py-2.5 text-sm tracking-wide border border-[#2a3a40] text-[#93a2a8] hover:bg-[#0f1a1d] rounded"
            >
              upload media instead
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,video/mp4"
              className="hidden"
              onChange={handleFileChange}
            />
          </>
        ) : (
          <button onClick={stopSource} className="px-5 py-2.5 text-sm tracking-wide border border-[#4a1f1a] text-[#ff6b5e] hover:bg-[#22110d] rounded">
            {mode === "image" ? "clear" : "stop"}
          </button>
        )}
        {!isEditingZone && (
          <button
            onClick={() => setIsEditingZone(true)}
            disabled={!zone}
            className="px-5 py-2.5 text-sm tracking-wide border border-[#2a3a40] text-[#93a2a8] hover:bg-[#0f1a1d] rounded disabled:opacity-40"
          >
            edit zone
          </button>
        )}
        {error && <span className="text-sm text-[#ff6b5e]">{error}</span>}
      </div>

      <div className="relative border border-[#132227] mx-auto" style={{ width: FRAME_W, height: isEditingZone ? FRAME_H + 40 : FRAME_H }}>
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          controls={mode === "video"}
          className="block"
          style={{ width: FRAME_W, height: FRAME_H, background: "#0a0f12", display: mode === "image" ? "none" : "block" }}
        />
        <img
          ref={imageRef}
          alt=""
          className="absolute top-0 left-0 object-contain"
          style={{ width: FRAME_W, height: FRAME_H, background: "#0a0f12", display: mode === "image" ? "block" : "none" }}
        />
        <canvas ref={canvasRef} className="absolute top-0 left-0 pointer-events-none" style={{ width: FRAME_W, height: FRAME_H }} />
        {!isActive && (
          <div className="absolute top-0 left-0 flex items-center justify-center text-sm text-[#4a5a63]" style={{ width: FRAME_W, height: FRAME_H }}>
            camera inactive
          </div>
        )}
        {isEditingZone && zone && (
          <ZoneEditor width={FRAME_W} height={FRAME_H} initialZone={zone} onSave={saveZone} onCancel={() => setIsEditingZone(false)} saving={savingZone} />
        )}
      </div>

      {lastAlert && (
        <div className="mt-5 max-w-md border border-[#1f4952] p-4 text-sm">
          <div className="text-[#ff6b5e] mb-1">latest alert · severity {lastAlert.severity}</div>
          <div className="text-[#93a2a8]">
            confidence {(lastAlert.confidence * 100).toFixed(1)}% · {lastAlert.num_detections} detection(s) · {new Date(lastAlert.timestamp).toLocaleTimeString()}
          </div>
        </div>
      )}
    </div>
  );
}
