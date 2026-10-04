// js/editor/handles.js

// Helpers for the draggable corner dots on rectangle and ellipse areas (blur and mask).
// A box is { cx, cy, w, h } as fractions of the canvas. rect is stage.rect() (screen pixels).

const CORNERS = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
const GRAB_RADIUS = 32;

// Index of the corner dot under the finger, or -1.
export function hitCorner(rect, box, pos) {
  let best = -1;
  let bestDist = GRAB_RADIUS;
  CORNERS.forEach(([sx, sy], i) => {
    const x = rect.left + (box.cx + (sx * box.w) / 2) * rect.width;
    const y = rect.top + (box.cy + (sy * box.h) / 2) * rect.height;
    const d = Math.hypot(pos.x - x, pos.y - y);
    if (d < bestDist) { bestDist = d; best = i; }
  });
  return best;
}

// Screen position -> fraction of the canvas.
export function toCanvasFraction(rect, pos) {
  return { x: (pos.x - rect.left) / rect.width, y: (pos.y - rect.top) / rect.height };
}

// Size in canvas pixels of a shape centred on (cx, cy) when a corner is dragged to the pointer.
// dxF, dyF: pointer minus centre, as fractions of the canvas.
// lock: always a perfect circle or square. Otherwise it snaps to equal when you get close.
export function ovalSize(dxF, dyF, W, H, lock, maxW, maxH) {
  let wPx = Math.abs(dxF) * 2 * W;
  let hPx = Math.abs(dyF) * 2 * H;
  const big = Math.max(wPx, hPx);
  if (lock) {
    wPx = hPx = Math.min(big, maxW, maxH);
  } else if (Math.abs(wPx - hPx) < big * 0.05) {
    wPx = hPx = Math.min((wPx + hPx) / 2, maxW, maxH);
  }
  const min = Math.min(W, H) * 0.02;
  return { wPx: Math.max(min, Math.min(wPx, maxW)), hPx: Math.max(min, Math.min(hPx, maxH)) };
}

