import { useState, useRef, useCallback, type MouseEvent } from "react";
import type { ZonePoint } from "../lib/api";

interface ZoneEditorProps {
  width: number;
  height: number;
  initialZone: ZonePoint[]; // fractional, 0-1
  onSave: (zone: ZonePoint[]) => void;
  onCancel: () => void;
  saving: boolean;
}

const MAX_POINTS = 8;

export default function ZoneEditor({ width, height, initialZone, onSave, onCancel, saving }: ZoneEditorProps) {
  const [points, setPoints] = useState<ZonePoint[]>(() => initialZone.map((p) => ({ x: p.x * width, y: p.y * height })));
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const suppressNextClick = useRef(false);

  const addPoint = useCallback(
    (e: MouseEvent<SVGSVGElement>) => {
      if (suppressNextClick.current) {
        suppressNextClick.current = false;
        return;
      }
      if (dragIndex !== null || points.length >= MAX_POINTS) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      setPoints((prev) => [...prev, { x, y }]);
    },
    [dragIndex, points.length],
  );

  const onPointDrag = useCallback(
    (e: MouseEvent<SVGSVGElement>) => {
      if (dragIndex === null) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const x = Math.max(0, Math.min(width, e.clientX - rect.left));
      const y = Math.max(0, Math.min(height, e.clientY - rect.top));
      setPoints((prev) => prev.map((p, i) => (i === dragIndex ? { x, y } : p)));
    },
    [dragIndex, width, height],
  );

  const resetToRectangle = useCallback(() => {
    setPoints([
      { x: width * 0.2, y: height * 0.2 },
      { x: width * 0.8, y: height * 0.2 },
      { x: width * 0.8, y: height * 0.8 },
      { x: width * 0.2, y: height * 0.8 },
    ]);
  }, [width, height]);

  const removeLastPoint = useCallback(() => setPoints((prev) => prev.slice(0, -1)), []);

  const canSave = points.length >= 3;

  return (
    <div>
      <svg
        id="zone-editor-canvas"
        width={width}
        height={height}
        className="absolute top-0 left-0"
        style={{ width, height, cursor: dragIndex !== null ? "grabbing" : "crosshair" }}
        onClick={addPoint}
        onMouseMove={onPointDrag}
        onMouseUp={() => {
          if (dragIndex !== null) suppressNextClick.current = true;
          setDragIndex(null);
        }}
        onMouseLeave={() => setDragIndex(null)}
      >
        {points.length > 1 && (
          <polygon
            points={points.map((p) => `${p.x},${p.y}`).join(" ")}
            fill="rgba(77,232,245,0.08)"
            stroke="#4de8f5"
            strokeWidth={2}
          />
        )}
        {points.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={7}
            fill="#ff6b5e"
            stroke="#050608"
            strokeWidth={1.5}
            style={{ cursor: "grab" }}
            onMouseDown={(e) => {
              e.stopPropagation();
              setDragIndex(i);
            }}
          />
        ))}
      </svg>

      <div className="absolute left-0 flex items-center gap-2 text-[11px]" style={{ top: height + 12 }}>
        <span className="text-[#6b8890]">{points.length} point{points.length !== 1 ? "s" : ""} · click frame to add, drag dots to move</span>
        <button onClick={removeLastPoint} disabled={points.length === 0} className="px-2 py-1 border border-[#2a3a40] text-[#93a2a8] rounded disabled:opacity-40">
          undo point
        </button>
        <button onClick={resetToRectangle} className="px-2 py-1 border border-[#2a3a40] text-[#93a2a8] rounded">
          reset to rectangle
        </button>
        <button
          onClick={() => onSave(points.map((p) => ({ x: p.x / width, y: p.y / height })))}
          disabled={!canSave || saving}
          className="px-3 py-1 border border-[#1f4952] text-[#4de8f5] rounded disabled:opacity-40"
        >
          {saving ? "saving…" : "save zone"}
        </button>
        <button onClick={onCancel} className="px-3 py-1 border border-[#4a1f1a] text-[#ff6b5e] rounded">
          cancel
        </button>
      </div>
    </div>
  );
}
