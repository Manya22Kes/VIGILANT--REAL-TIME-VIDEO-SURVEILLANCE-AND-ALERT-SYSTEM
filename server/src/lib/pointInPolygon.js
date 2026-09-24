// Standard ray-casting test. `point` and `polygon` points are in the same
// coordinate space (we always call this with absolute pixel coordinates,
// after converting the stored fractional zone using the frame's actual size).
export function isPointInPolygon(point, polygon) {
  const { x, y } = point;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;
    const intersects =
      yi > y !== yj > y &&
      x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

export function boxCenter([x1, y1, x2, y2]) {
  return { x: (x1 + x2) / 2, y: (y1 + y2) / 2 };
}

// Stored zone points are fractions of frame width/height (0..1) so the zone
// stays correct regardless of the camera/video resolution used at capture
// time. This converts to absolute pixels for a given frame size.
export function zoneToAbsolute(fractionalZone, width, height) {
  return fractionalZone.map((p) => ({ x: p.x * width, y: p.y * height }));
}
