export default function CursorReticle({ x, y }: { x: number; y: number }) {
  return (
    <div
      className="pointer-events-none fixed z-50"
      style={{ left: x, top: y, transform: "translate(-50%, -50%)" }}
    >
      <svg width={34} height={34} viewBox="0 0 34 34">
        <line x1="17" y1="1" x2="17" y2="12" stroke="#4de8f5" strokeWidth={1} />
        <line x1="17" y1="22" x2="17" y2="33" stroke="#4de8f5" strokeWidth={1} />
        <line x1="1" y1="17" x2="12" y2="17" stroke="#4de8f5" strokeWidth={1} />
        <line x1="22" y1="17" x2="33" y2="17" stroke="#4de8f5" strokeWidth={1} />
        <circle cx="17" cy="17" r={1.5} fill="#4de8f5" />
      </svg>
    </div>
  );
}
