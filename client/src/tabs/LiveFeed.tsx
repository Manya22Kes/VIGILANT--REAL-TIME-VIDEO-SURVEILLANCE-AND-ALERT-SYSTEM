import { useRef, useState, useCallback, useEffect, type ChangeEvent } from "react";
import { api, ApiError, type Alert, type ZonePoint } from "../lib/api";
import { useCameraStatus } from "../lib/cameraStatus";
import { useAuth } from "../lib/authContext";
import ZoneEditor from "../components/ZoneEditor";
import SettingsPanel from "../components/SettingsPanel";

// Frames are sent one at a time: the next capture starts only after the previous detection
// has come back (plus this short pause), so requests never pile up and the feed runs as
// fast as the model allows. After a failed request it backs off before retrying.
const MIN_FRAME_GAP_MS = 250;
const RETRY_DELAY_MS = 1500;
const FRAME_W = 640;
// Default frame height (4:3). The real height follows the source's aspect ratio (a 16:9
// webcam or video is 360 tall at this width) so the overlay and zone always line up with
// the picture instead of being stretched over letterbox bars.
const DEFAULT_FRAME_H = 480;
const MIN_FRAME_H = 200;
const MAX_FRAME_H = 720;
const heightForAspect = (w: number, h: number) =>
  w > 0 && h > 0 ? Math.min(MAX_FRAME_H, Math.max(MIN_FRAME_H, Math.round((FRAME_W * h) / w))) : DEFAULT_FRAME_H;

type Mode = "idle" | "camera" | "video" | "image";

export default function LiveFeed() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const captureCanvasRef = useRef<HTMLCanvasElement>(document.createElement("canvas"));
  const loopTimerRef = useRef<number | null>(null);
  const loopActiveRef = useRef(false);
  const objectUrlRef = useRef<string | null>(null);
  // Bumped whenever the source is stopped, so late detection results can be ignored.
  const sourceIdRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { setState: setCameraState } = useCameraStatus();
  const { logout } = useAuth();
  const [mode, setMode] = useState<Mode>("idle");
  const [lastAlert, setLastAlert] = useState<Alert | null>(null);
  const [crowd, setCrowd] = useState<{ count: number; threshold: number; dense: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [zone, setZone] = useState<ZonePoint[] | null>(null);
  const [frameH, setFrameH] = useState(DEFAULT_FRAME_H);
  const [isEditingZone, setIsEditingZone] = useState(false);
  const isEditingZoneRef = useRef(false);
  useEffect(() => {
    isEditingZoneRef.current = isEditingZone;
  }, [isEditingZone]);
  const [savingZone, setSavingZone] = useState(false);
  // This webcam delivers a mirrored picture (your right shows on the left). Flipping it
  // horizontally gives true directions. It applies to the live camera only (never to uploaded
  // files) and to what is sent for detection too, so boxes, the zone and saved snapshots all
  // match the picture on screen. Turn it off with the button if a camera is already correct.
  const [flipCamera, setFlipCamera] = useState(true);
  const flipCameraRef = useRef(true);
  useEffect(() => {
    flipCameraRef.current = flipCamera;
  }, [flipCamera]);

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
  const runDetectionOnBlob = useCallback(async (blob: Blob, width: number, height: number): Promise<boolean> => {
    const overlay = canvasRef.current;
    if (!overlay) return true;
    const sourceId = sourceIdRef.current;

    try {
      const result = await api.detectFrame(blob);
      // The source was stopped or replaced while this request was in flight: drop the
      // result so it cannot redraw boxes on a cleared overlay.
      if (sourceId !== sourceIdRef.current) return true;
      if (result.alert) setLastAlert(result.alert);
      setCrowd({ count: result.person_count, threshold: result.crowd_threshold, dense: result.dense_pass });

      overlay.width = width;
      overlay.height = height;
      const octx = overlay.getContext("2d");
      if (!octx) return true;
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
        const isWeapon = d.label === "weapon";
        // People below the zone-alert confidence are drawn faint: they only count towards the crowd.
        const color = isWeapon ? "#ff2e63" : !d.strong ? "#2a5560" : d.in_zone ? "#ff6b5e" : "#3d95a3";
        octx.strokeStyle = color;
        octx.lineWidth = isWeapon ? 4 : !d.strong ? 1 : d.in_zone ? 3 : 1.5;
        octx.strokeRect(x1, y1, x2 - x1, y2 - y1);
        octx.fillStyle = color;
        octx.font = isWeapon ? "bold 14px monospace" : "13px monospace";
        const text = `${isWeapon ? "WEAPON " : ""}${(d.confidence * 100).toFixed(0)}%`;
        octx.fillText(text, x1, y1 - 4);
      });
      return true;
    } catch {
      // one failed frame isn't worth surfacing - the loop backs off and tries again
      return false;
    }
  }, []);

  // Grabs the current frame from videoRef (live webcam stream or an uploaded video
  // file being played back) and runs detection on it. Used as the interval tick for
  // both sources.
  const captureAndDetect = useCallback(async (): Promise<boolean> => {
    const video = videoRef.current;
    const captureCanvas = captureCanvasRef.current;
    if (!video || video.readyState < 2) return true;
    // An uploaded video that is paused or has ended would otherwise be re-detected forever
    // (repeating the same alert from one frozen frame). Live camera streams never pause.
    if (video.srcObject === null && (video.paused || video.ended)) return true;

    captureCanvas.width = video.videoWidth;
    captureCanvas.height = video.videoHeight;
    const ctx = captureCanvas.getContext("2d");
    if (!ctx) return true;
    // Live camera only (uploaded videos have srcObject === null): mirror the frame to match the flipped preview.
    if (video.srcObject !== null && flipCameraRef.current) {
      ctx.translate(video.videoWidth, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0);

    const blob: Blob | null = await new Promise((resolve) => captureCanvas.toBlob(resolve, "image/jpeg", 0.85));
    if (!blob) return true;
    return runDetectionOnBlob(blob, video.videoWidth, video.videoHeight);
  }, [runDetectionOnBlob]);

  const stopLoop = useCallback(() => {
    loopActiveRef.current = false;
    if (loopTimerRef.current !== null) clearTimeout(loopTimerRef.current);
    loopTimerRef.current = null;
  }, []);

  const startLoop = useCallback(() => {
    stopLoop();
    loopActiveRef.current = true;
    const tick = async () => {
      if (!loopActiveRef.current) return;
      const started = performance.now();
      const ok = await captureAndDetect();
      if (!loopActiveRef.current) return;
      const wait = ok ? Math.max(MIN_FRAME_GAP_MS - (performance.now() - started), 0) : RETRY_DELAY_MS;
      loopTimerRef.current = window.setTimeout(tick, wait);
    };
    void tick();
  }, [captureAndDetect, stopLoop]);

  const startCamera = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
      if (videoRef.current) videoRef.current.srcObject = stream;
      setCameraState("active");
      setMode("camera");
      startLoop();
    } catch (err) {
      setCameraState("error");
      setError(err instanceof Error ? err.message : "could not access camera");
    }
  }, [startLoop, setCameraState]);

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
      startLoop();
    },
    [startLoop],
  );

  const detectUploadedImage = useCallback(
    (file: File) => {
      setError(null);
      const url = URL.createObjectURL(file);
      objectUrlRef.current = url;
      const img = new Image();
      img.onload = () => {
        if (imageRef.current) imageRef.current.src = url;
        setFrameH(heightForAspect(img.naturalWidth, img.naturalHeight));
        void runDetectionOnBlob(file, img.naturalWidth, img.naturalHeight);
      };
      img.src = url;
      setMode("image");
    },
    [runDetectionOnBlob],
  );

  const stopSource = useCallback(() => {
    stopLoop();
    sourceIdRef.current += 1;

    // Wipe the last detection boxes and zone outline off the overlay.
    const overlay = canvasRef.current;
    overlay?.getContext("2d")?.clearRect(0, 0, overlay.width, overlay.height);

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
    setCrowd(null);
    setFrameH(DEFAULT_FRAME_H);
  }, [setCameraState, stopLoop]);

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
        {mode === "camera" && (
          <button
            onClick={() => setFlipCamera((f) => !f)}
            title="mirror the camera left/right"
            className="px-5 py-2.5 text-sm tracking-wide border border-[#2a3a40] text-[#93a2a8] hover:bg-[#0f1a1d] rounded"
          >
            flip camera: {flipCamera ? "on" : "off"}
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

      <div className="relative border border-[#132227] mx-auto" style={{ width: FRAME_W + 2, height: isEditingZone ? frameH + 40 : frameH }}>
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          controls={mode === "video"}
          onLoadedMetadata={(e) => setFrameH(heightForAspect(e.currentTarget.videoWidth, e.currentTarget.videoHeight))}
          className="block"
          style={{
            width: FRAME_W,
            height: frameH,
            objectFit: "fill",
            background: "#0a0f12",
            display: mode === "image" ? "none" : "block",
            transform: mode === "camera" && flipCamera ? "scaleX(-1)" : undefined,
          }}
        />
        <img
          ref={imageRef}
          alt=""
          className="absolute top-0 left-0"
          style={{ width: FRAME_W, height: frameH, objectFit: "fill", background: "#0a0f12", display: mode === "image" ? "block" : "none" }}
        />
        <canvas ref={canvasRef} className="absolute top-0 left-0 pointer-events-none" style={{ width: FRAME_W, height: frameH }} />
        {!isActive && (
          <div className="absolute top-0 left-0 flex items-center justify-center text-sm text-[#4a5a63]" style={{ width: FRAME_W, height: frameH }}>
            camera inactive
          </div>
        )}
        {isEditingZone && zone && (
          <ZoneEditor key={frameH} width={FRAME_W} height={frameH} initialZone={zone} onSave={saveZone} onCancel={() => setIsEditingZone(false)} saving={savingZone} />
        )}
      </div>

      {crowd && (
        <div className="mt-3 mx-auto text-xs" style={{ width: FRAME_W, color: crowd.count >= crowd.threshold ? "#f2b94d" : "#4a5a63" }}>
          people detected: {crowd.count}{crowd.dense ? " (dense scan)" : ""} · crowd alert at {crowd.threshold}
        </div>
      )}

      <SettingsPanel />

      {lastAlert && (
        <div className="mt-5 mx-auto max-w-md border border-[#1f4952] p-4 text-sm">
          <div className="text-[#ff6b5e] mb-1">
            latest alert · {lastAlert.type === "weapon" ? "weapon detected" : lastAlert.type === "crowd" ? "crowd" : "zone intrusion"} · severity {lastAlert.severity}
          </div>
          <div className="text-[#93a2a8]">
            confidence {(lastAlert.confidence * 100).toFixed(1)}% · {lastAlert.num_detections} detection(s) · {new Date(lastAlert.timestamp).toLocaleTimeString()}
          </div>
        </div>
      )}
    </div>
  );
}
