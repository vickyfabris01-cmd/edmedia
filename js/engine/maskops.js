// js/engine/maskops.js

// A selection mask is a grid of 0-255 values (255 = selected) that covers the whole canvas.
// Pure functions only (no DOM), so they are easy to test.

export const MASK_SIDE = 512;

// Grid size for a canvas: the long side is `side` cells.
export function maskSize(W, H, side = MASK_SIDE) {
  const s = side / Math.max(W, H);
  return { w: Math.max(1, Math.round(W * s)), h: Math.max(1, Math.round(H * s)) };
}

// ---------- Saving a mask inside a recipe (run-length pairs, as base64 text) ----------

// 5 bits per cell keeps the text short. 255 stays 255 and 0 stays 0.
const quantize = (v) => Math.min(255, ((v + 4) >> 3) << 3);

export function packMask(data, w, h) {
  const out = [];
  let i = 0;
  const n = data.length;
  while (i < n) {
    const v = quantize(data[i]);
    let run = 1;
    while (i + run < n && run < 255 && quantize(data[i + run]) === v) run++;
    out.push(v, run);
    i += run;
  }
  let bin = '';
  for (let k = 0; k < out.length; k += 0x8000) bin += String.fromCharCode.apply(null, out.slice(k, k + 0x8000));
  return { w, h, rle: btoa(bin) };
}

export function unpackMask(m) {
  const data = new Uint8Array(m.w * m.h);
  if (!m.rle) return data;
  const bin = atob(m.rle);
  let pos = 0;
  for (let k = 0; k + 1 < bin.length && pos < data.length; k += 2) {
    const v = bin.charCodeAt(k);
    const run = bin.charCodeAt(k + 1);
    data.fill(v, pos, Math.min(data.length, pos + run));
    pos += run;
  }
  return data;
}

// Decoding the same text again and again is wasteful while painting, so recent masks are kept.
const cache = new Map();
export function unpackMaskCached(m) {
  const key = m.w + 'x' + m.h + ':' + m.rle;
  let data = cache.get(key);
  if (!data) {
    data = unpackMask(m);
    cache.set(key, data);
    if (cache.size > 6) cache.delete(cache.keys().next().value);
  }
  return data;
}

// ---------- Brushes ----------

// One round dab. Paint raises the cells, erase lowers them.
export function paintDisk(data, w, h, cx, cy, r, erase) {
  const x0 = Math.max(0, Math.floor(cx - r - 1));
  const x1 = Math.min(w - 1, Math.ceil(cx + r + 1));
  const y0 = Math.max(0, Math.floor(cy - r - 1));
  const y1 = Math.min(h - 1, Math.ceil(cy + r + 1));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      const cov = Math.max(0, Math.min(1, r + 0.5 - d));
      if (cov <= 0) continue;
      const i = y * w + x;
      if (erase) data[i] = Math.round(data[i] * (1 - cov));
      else { const v = Math.round(255 * cov); if (v > data[i]) data[i] = v; }
    }
  }
}

// Dabs along a line from (ax, ay) to (bx, by), spaced so the stroke looks continuous.
export function paintLine(dab, ax, ay, bx, by, r) {
  const dist = Math.hypot(bx - ax, by - ay);
  const step = Math.max(1, r / 3);
  const n = Math.max(1, Math.ceil(dist / step));
  for (let i = 1; i <= n; i++) dab(ax + ((bx - ax) * i) / n, ay + ((by - ay) * i) / n);
}

// ---------- Edge-snapping brush ----------

let stamp = null;
let stampValue = 0;
let queue = null;

// A round dab that stops at edges in the picture. It starts at the centre and spreads outward
// through pixels that look alike, so it fills the object under the brush but not what is next to it.
// rgba: the picture at mask size (Uint8ClampedArray). sensitivity 0-100: higher stops at weaker edges.
export function smartDab(data, w, h, rgba, cx, cy, r, erase, sensitivity = 50) {
  const px = Math.min(w - 1, Math.max(0, Math.round(cx - 0.5)));
  const py = Math.min(h - 1, Math.max(0, Math.round(cy - 0.5)));
  const s = Math.max(0, Math.min(100, sensitivity)) / 100;
  const edgeTol = 52 - 40 * s; // largest colour step between neighbours that is still "the same surface"
  const rangeTol = 120 - 85 * s; // largest colour drift from the centre of the brush
  const edge2 = edgeTol * edgeTol;
  const range2 = rangeTol * rangeTol;

  // Colour at the centre: average of the 3x3 block around it
  let sr = 0, sg = 0, sb = 0, cnt = 0;
  for (let y = Math.max(0, py - 1); y <= Math.min(h - 1, py + 1); y++) {
    for (let x = Math.max(0, px - 1); x <= Math.min(w - 1, px + 1); x++) {
      const i = (y * w + x) * 4;
      sr += rgba[i]; sg += rgba[i + 1]; sb += rgba[i + 2]; cnt++;
    }
  }
  sr /= cnt; sg /= cnt; sb /= cnt;

  if (!stamp || stamp.length !== w * h) { stamp = new Uint32Array(w * h); stampValue = 0; queue = new Int32Array(w * h); }
  stampValue++;
  if (stampValue === 0xffffffff) { stamp.fill(0); stampValue = 1; }

  const r2 = r * r;
  let head = 0;
  let tail = 0;
  const start = py * w + px;
  queue[tail++] = start;
  stamp[start] = stampValue;
  while (head < tail) {
    const idx = queue[head++];
    const x = idx % w;
    const y = (idx - x) / w;
    data[idx] = erase ? 0 : 255;
    const pi = idx * 4;
    const pr = rgba[pi], pg = rgba[pi + 1], pb = rgba[pi + 2];
    for (let k = 0; k < 4; k++) {
      const nx = k === 0 ? x - 1 : k === 1 ? x + 1 : x;
      const ny = k === 2 ? y - 1 : k === 3 ? y + 1 : y;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const ni = ny * w + nx;
      if (stamp[ni] === stampValue) continue;
      const dx = nx + 0.5 - cx;
      const dy = ny + 0.5 - cy;
      if (dx * dx + dy * dy > r2) continue;
      const q = ni * 4;
      const er = rgba[q] - pr, eg = rgba[q + 1] - pg, eb = rgba[q + 2] - pb;
      if (er * er + eg * eg + eb * eb > edge2) continue;
      const rr = rgba[q] - sr, rg = rgba[q + 1] - sg, rb = rgba[q + 2] - sb;
      if (rr * rr + rg * rg + rb * rb > range2) continue;
      stamp[ni] = stampValue;
      queue[tail++] = ni;
    }
  }
}

// ---------- Shapes ----------

// Rectangle or ellipse centred on (cx, cy) with width w and height h, all as fractions of the canvas.
export function rasterShape(shape, cx, cy, bw, bh, gw, gh) {
  const data = new Uint8Array(gw * gh);
  const rx = Math.max(0.5, (bw * gw) / 2);
  const ry = Math.max(0.5, (bh * gh) / 2);
  const mx = cx * gw;
  const my = cy * gh;
  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) {
      const dx = (x + 0.5 - mx) / rx;
      const dy = (y + 0.5 - my) / ry;
      let cov;
      if (shape === 'rect') {
        // Soft one-cell edge so the outline is not jagged
        const ex = Math.min(1, Math.max(0, (rx - Math.abs(x + 0.5 - mx)) + 0.5));
        const ey = Math.min(1, Math.max(0, (ry - Math.abs(y + 0.5 - my)) + 0.5));
        cov = Math.min(ex, ey);
      } else {
        const d = Math.hypot(dx, dy);
        const edge = 1 / Math.min(rx, ry); // one cell, in ellipse units
        cov = Math.min(1, Math.max(0, (1 - d) / edge + 0.5));
      }
      data[y * gw + x] = Math.round(cov * 255);
    }
  }
  return data;
}

// Same mask on a different grid (used when the canvas shape changes).
export function resampleMask(data, w, h, nw, nh) {
  if (w === nw && h === nh) return Uint8Array.from(data);
  const out = new Uint8Array(nw * nh);
  for (let y = 0; y < nh; y++) {
    const sy = Math.min(h - 1, Math.floor(((y + 0.5) * h) / nh));
    for (let x = 0; x < nw; x++) out[y * nw + x] = data[sy * w + Math.min(w - 1, Math.floor(((x + 0.5) * w) / nw))];
  }
  return out;
}

// ---------- Soft edge ----------

// Box blur on a single-channel grid, two passes (close to a Gaussian). Edits `data` in place.
export function blurMask(data, w, h, radius) {
  const r = Math.round(radius);
  if (r < 1) return data;
  const tmp = new Uint8Array(data.length);
  const pass = (src, dst, len, lines, stride, lineStride) => {
    const div = 2 * r + 1;
    for (let line = 0; line < lines; line++) {
      const base = line * lineStride;
      let sum = 0;
      for (let k = -r; k <= r; k++) sum += src[base + Math.min(len - 1, Math.max(0, k)) * stride];
      for (let i = 0; i < len; i++) {
        dst[base + i * stride] = Math.round(sum / div);
        sum += src[base + Math.min(len - 1, i + r + 1) * stride] - src[base + Math.max(0, i - r) * stride];
      }
    }
  };
  for (let it = 0; it < 2; it++) {
    pass(data, tmp, w, h, 1, w);
    pass(tmp, data, h, w, w, 1);
  }
  return data;
}

// ---------- Combining and cleaning ----------

// Adds `src` to `dst` (or takes it away when erase is true).
export function mergeMask(dst, src, erase) {
  for (let i = 0; i < dst.length; i++) {
    if (erase) dst[i] = Math.round(dst[i] * (1 - src[i] / 255));
    else if (src[i] > dst[i]) dst[i] = src[i];
  }
  return dst;
}

// A person-detection result is a soft probability. This pushes it toward clear in/out
// so the leftover haze in the background does not count as selected.
export function refineProbability(alpha, low = 0.35, high = 0.65) {
  const out = new Uint8Array(alpha.length);
  for (let i = 0; i < alpha.length; i++) {
    let t = (alpha[i] / 255 - low) / (high - low);
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    out[i] = Math.round(t * t * (3 - 2 * t) * 255);
  }
  return out;
}

// Box (in cells) around everything selected, or null when nothing is.
export function maskBounds(data, w, h, threshold = 8) {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[y * w + x] >= threshold) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  return x1 < 0 ? null : { x0, y0, x1: x1 + 1, y1: y1 + 1 };
}

export function isEmptyMask(data, threshold = 8) {
  for (let i = 0; i < data.length; i++) if (data[i] >= threshold) return false;
  return true;
}