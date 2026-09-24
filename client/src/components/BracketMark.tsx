// Four L-shaped corner brackets forming a viewfinder square - the same
// motif used for zone/detection bounding boxes, reused here as a mark.
export default function BracketMark({ size = 18, color = "#4de8f5" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <path d="M1 6.5V1h5.5" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
      <path d="M13.5 1H19v5.5" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
      <path d="M19 13.5V19h-5.5" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
      <path d="M6.5 19H1v-5.5" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
