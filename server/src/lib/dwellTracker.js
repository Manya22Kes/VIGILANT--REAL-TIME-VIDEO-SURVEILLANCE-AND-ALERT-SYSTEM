import { config } from "../config.js";

// Frames arrive roughly once a second from the browser, not as continuous
// video, so "time in zone" is tracked as: has someone been detected in the
// zone on every recent frame, with no gap longer than dwellGapSeconds?
// This is process-memory state (single camera stream assumed for v1).
let firstSeenAt = null;
let lastSeenAt = null;

export function updateDwell(personInZone) {
  const now = Date.now();

  if (personInZone) {
    const gap = lastSeenAt ? (now - lastSeenAt) / 1000 : Infinity;
    if (firstSeenAt === null || gap > config.dwellGapSeconds) {
      firstSeenAt = now; // new occupancy episode
    }
    lastSeenAt = now;
    return (now - firstSeenAt) / 1000;
  }

  // Nobody in zone this frame. Only reset once the gap has actually elapsed,
  // so a single missed detection doesn't wipe out a real dwell streak.
  if (lastSeenAt && (now - lastSeenAt) / 1000 > config.dwellGapSeconds) {
    firstSeenAt = null;
    lastSeenAt = null;
  }
  return 0;
}
