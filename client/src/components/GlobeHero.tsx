import { useRef, useMemo, useEffect, useCallback } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";

const ZONES = ["MAIN GATE", "LIBRARY ENTRANCE", "HOSTEL BLOCK C", "PARKING LOT", "ACADEMIC BLOCK", "CAFETERIA WING"];
const LOW_LINES = ["tracking // low priority", "zone clear // 0 alerts", "confidence above threshold"];
const CRITICAL_LINES = ["critical // intercept queued", "person detected // logged", "restricted zone breach"];

export type Severity = "low" | "critical";

export interface DetectionEvent {
  zone: string;
  cam: string;
  confidence: string;
  line: string;
  severity: Severity;
}

function glowTexture(hex: string) {
  const size = 256;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, hex + "aa");
  grad.addColorStop(1, hex + "00");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(c);
}

function surfaceTangents(normal: THREE.Vector3) {
  const up = Math.abs(normal.y) < 0.99 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  const a = new THREE.Vector3().crossVectors(up, normal).normalize();
  const b = new THREE.Vector3().crossVectors(normal, a).normalize();
  return [a, b] as const;
}

// note: phi sweeps a full 2*PI, not PI - a fixed-phi arc from pole to pole is
// only half a great circle, so lonRings needs the full range to close the globe
function buildGlobeWireframe(radius: number, latRings: number, lonRings: number, segs: number) {
  const points: THREE.Vector3[] = [];
  for (let i = 1; i < latRings; i++) {
    const theta = (Math.PI * i) / latRings;
    const y = radius * Math.cos(theta);
    const r = radius * Math.sin(theta);
    for (let j = 0; j < segs; j++) {
      const a0 = (j / segs) * Math.PI * 2, a1 = ((j + 1) / segs) * Math.PI * 2;
      points.push(new THREE.Vector3(r * Math.cos(a0), y, r * Math.sin(a0)));
      points.push(new THREE.Vector3(r * Math.cos(a1), y, r * Math.sin(a1)));
    }
  }
  for (let i = 0; i < lonRings; i++) {
    const phi = (i / lonRings) * Math.PI * 2;
    for (let j = 0; j < segs; j++) {
      const t0 = (Math.PI * j) / segs, t1 = (Math.PI * (j + 1)) / segs;
      points.push(new THREE.Vector3(radius * Math.sin(t0) * Math.cos(phi), radius * Math.cos(t0), radius * Math.sin(t0) * Math.sin(phi)));
      points.push(new THREE.Vector3(radius * Math.sin(t1) * Math.cos(phi), radius * Math.cos(t1), radius * Math.sin(t1) * Math.sin(phi)));
    }
  }
  return new THREE.BufferGeometry().setFromPoints(points);
}

function buildSurfaceMarkers(radius: number, count: number) {
  const points: THREE.Vector3[] = [];
  for (let i = 0; i < count; i++) {
    const theta = Math.acos(2 * Math.random() - 1);
    const phi = Math.random() * Math.PI * 2;
    const normal = new THREE.Vector3(Math.sin(theta) * Math.cos(phi), Math.cos(theta), Math.sin(theta) * Math.sin(phi));
    const center = normal.clone().multiplyScalar(radius * 1.01);
    const [a, b] = surfaceTangents(normal);
    const s = 0.06;
    points.push(center.clone().addScaledVector(a, -s), center.clone().addScaledVector(a, s));
    points.push(center.clone().addScaledVector(b, -s), center.clone().addScaledVector(b, s));
  }
  return new THREE.BufferGeometry().setFromPoints(points);
}

function buildDust(count: number) {
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 15;
    pos[i * 3 + 1] = (Math.random() - 0.5) * 9;
    pos[i * 3 + 2] = (Math.random() - 0.5) * 10 - 2;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  return g;
}

let audioCtx: AudioContext | null = null;
function ensureAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  if (audioCtx.state === "suspended") audioCtx.resume();
}
// a soft two-tone chime (root + a fifth above) rather than a sharp pitch-sweep -
// reads as a gentle notification instead of a laser-zap
function playPing() {
  if (!audioCtx || audioCtx.state !== "running") return;
  const now = audioCtx.currentTime;
  const gain = audioCtx.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.11, now + 0.03);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);
  gain.connect(audioCtx.destination);

  [880, 1318.5].forEach((freq, i) => {
    const osc = audioCtx!.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, now);
    osc.connect(gain);
    osc.start(now + i * 0.015);
    osc.stop(now + 0.55);
  });
}

const GLOBE_RADIUS = 2.5;
const GLOBE_SCALE = 1.3;

const SATELLITES = [0, 1, 2, 3].map((i) => ({
  radius: 3.0 + i * 0.35,
  speed: 0.25 - i * 0.04,
  incline: 0.3 + i * 0.25,
  phase: i * 1.7,
}));

function Scene({ onDetection, muted }: { onDetection: (e: DetectionEvent) => void; muted: boolean }) {
  const groupRef = useRef<THREE.Group>(null!);
  const globeRef = useRef<THREE.LineSegments>(null!);
  const dotRef = useRef<THREE.Mesh>(null!);
  const ringRef = useRef<THREE.Mesh>(null!);
  const ringMatRef = useRef<THREE.MeshBasicMaterial>(null!);
  const satRefs = useRef<(THREE.Mesh | null)[]>([]);
  const cycleT = useRef(999);
  const ringT = useRef(0);
  const markerNormal = useRef(new THREE.Vector3(0.6, 0.5, 0.6).normalize());
  const smoothedPointer = useRef(new THREE.Vector2(0, 0));
  const mutedRef = useRef(muted);
  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);

  const globeGeo = useMemo(() => buildGlobeWireframe(GLOBE_RADIUS, 9, 12, 48), []);
  const markerGeo = useMemo(() => buildSurfaceMarkers(GLOBE_RADIUS, 60), []);
  const dustGeo = useMemo(() => buildDust(200), []);
  const cyanGlow = useMemo(() => glowTexture("#1ec4d8"), []);
  const dotGlow = useMemo(() => glowTexture("#ff6b5e"), []);
  const satGlow = useMemo(() => glowTexture("#4de8f5"), []);

  const reposition = useCallback(() => {
    const theta = Math.acos(2 * Math.random() - 1) * 0.7 + 0.5;
    const phi = Math.random() * Math.PI - Math.PI * 0.15;
    markerNormal.current.set(Math.sin(theta) * Math.cos(phi), Math.cos(theta), Math.sin(theta) * Math.sin(phi));
    const pos = markerNormal.current.clone().multiplyScalar(GLOBE_RADIUS + 0.02);
    dotRef.current.position.copy(pos);
    ringRef.current.position.copy(pos);
    ringRef.current.lookAt(pos.clone().add(markerNormal.current));
    ringRef.current.scale.setScalar(0.18);
    ringT.current = 0;
    if (!mutedRef.current) playPing();
    const severity: Severity = Math.random() < 0.28 ? "critical" : "low";
    const lines = severity === "critical" ? CRITICAL_LINES : LOW_LINES;
    onDetection({
      zone: ZONES[Math.floor(Math.random() * ZONES.length)],
      cam: `cam_0${1 + Math.floor(Math.random() * 4)}`,
      confidence: (severity === "critical" ? 90 + Math.random() * 9 : 78 + Math.random() * 15).toFixed(1),
      line: lines[Math.floor(Math.random() * lines.length)],
      severity,
    });
  }, [onDetection]);

  useEffect(() => {
    const start = () => ensureAudio();
    window.addEventListener("pointerdown", start, { once: true });
    window.addEventListener("mousemove", start, { once: true });
    reposition();
    return () => {
      window.removeEventListener("pointerdown", start);
      window.removeEventListener("mousemove", start);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.05);
    const t = state.clock.elapsedTime;

    groupRef.current.rotation.y += dt * 0.07;
    globeRef.current.scale.setScalar(1 + Math.sin(t * 0.6) * 0.015);

    SATELLITES.forEach((s, i) => {
      const a = t * s.speed + s.phase;
      const m = satRefs.current[i];
      if (m) m.position.set(Math.cos(a) * s.radius, Math.sin(a * 0.6) * s.radius * s.incline, Math.sin(a) * s.radius);
    });

    ringT.current += dt;
    ringRef.current.scale.setScalar(0.18 + ringT.current * 0.55);
    if (ringMatRef.current) ringMatRef.current.opacity = Math.max(0, 0.75 - ringT.current * 0.5);
    dotRef.current.scale.setScalar(1 + Math.max(0, 0.6 - ringT.current * 0.8));

    cycleT.current += dt;
    if (cycleT.current > 3.6) {
      cycleT.current = 0;
      reposition();
    }

    // smooth the raw pointer so parallax eases in/out instead of snapping to the cursor
    smoothedPointer.current.lerp(state.pointer, Math.min(1, dt * 3));
    const px = smoothedPointer.current.x;
    const py = smoothedPointer.current.y;

    const sway = Math.sin(t * 0.04) * 0.3;
    state.camera.position.x = 1.15 + sway + px * 0.45;
    state.camera.position.y = py * 0.25;
    state.camera.lookAt(1.15, -0.1, 0);

    // globe itself turns/tilts toward the cursor on top of its ambient spin
    groupRef.current.rotation.x = -py * 0.18;
    groupRef.current.rotation.z = px * 0.08;
  });

  return (
    <>
      <fog attach="fog" args={[0x0a141a, 6, 15]} />
      <points geometry={dustGeo}>
        <pointsMaterial color={0x3d95a3} size={0.022} transparent opacity={0.55} />
      </points>
      <group ref={groupRef} position={[1.15, -0.15, 0]} scale={GLOBE_SCALE}>
        <sprite scale={[10, 10, 1]}>
          <spriteMaterial map={cyanGlow} transparent depthWrite={false} blending={THREE.AdditiveBlending} opacity={0.5} />
        </sprite>
        <lineSegments ref={globeRef} geometry={globeGeo}>
          <lineBasicMaterial color={0x3d95a3} transparent opacity={0.8} />
        </lineSegments>
        <lineSegments geometry={markerGeo}>
          <lineBasicMaterial color={0x4de8f5} transparent opacity={0.9} />
        </lineSegments>
        {SATELLITES.map((_, i) => (
          <mesh key={i} ref={(el) => { satRefs.current[i] = el; }}>
            <sphereGeometry args={[0.045, 8, 8]} />
            <meshBasicMaterial color={0x4de8f5} />
            <sprite scale={[0.4, 0.4, 1]}>
              <spriteMaterial map={satGlow} transparent depthWrite={false} blending={THREE.AdditiveBlending} opacity={0.6} />
            </sprite>
          </mesh>
        ))}
        <mesh ref={dotRef}>
          <sphereGeometry args={[0.04, 12, 12]} />
          <meshBasicMaterial color={0xff6b5e} />
          <sprite scale={[0.5, 0.5, 1]}>
            <spriteMaterial map={dotGlow} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
          </sprite>
        </mesh>
        <mesh ref={ringRef}>
          <ringGeometry args={[0.9, 1.0, 32]} />
          <meshBasicMaterial ref={ringMatRef} color={0xff6b5e} transparent opacity={0} side={THREE.DoubleSide} />
        </mesh>
      </group>
    </>
  );
}

export default function GlobeHero({ onDetection, muted = false }: { onDetection: (e: DetectionEvent) => void; muted?: boolean }) {
  return (
    <Canvas
      camera={{ fov: 45, position: [0, 0, 8.5] }}
      gl={{ antialias: true, alpha: true }}
      style={{ position: "absolute", inset: 0 }}
    >
      <Scene onDetection={onDetection} muted={muted} />
    </Canvas>
  );
}
