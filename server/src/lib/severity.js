// confidence: 0..1 (highest-confidence detection in the zone)
// numDetections: how many people are in the zone
// timeInZoneSeconds: how long someone has continuously been in the zone,
// from the dwell tracker.
export function calculateSeverity(confidence, numDetections, timeInZoneSeconds) {
  // One or two people in the zone are always LOW, however long they stay. Severity only
  // escalates (by count, confidence and dwell time) once three or more people are in.
  if (numDetections <= 2) return "LOW";

  let score = confidence * numDetections;
  if (timeInZoneSeconds > 10) score *= 2.0;
  else if (timeInZoneSeconds > 5) score *= 1.5;

  if (score < 1.0) return "LOW";
  if (score < 2.0) return "MEDIUM";
  return "HIGH";
}
