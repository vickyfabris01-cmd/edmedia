// js/engine/pixels.js

const POINT_KEYS = [
  'exposure', 'brightness', 'contrast', 'highlights', 'shadows', 'saturation', 'temperature', 'tint',
  'hue', 'grayscale', 'sepia', 'invert', 'sharpen', 'clarity', 'blur',
];

export function hasPixelEffect(v) {
  return POINT_KEYS.some((k) => Math.abs(v[k] || 0) > 0.01);
}

function blurPass(src, dst, w, h, r, horizontal) {
  const len = horizontal ? w : h;
  const stride = horizontal ? 4 : w * 4;
  const lines = horizontal ? h : w;
  const lineStride = horizontal ? w * 4 : 4;
  const div = 2 * r + 1;
  for (let line = 0; line < lines; line++) {
    const base = line * lineStride;
    for (let c = 0; c < 4; c++) {
      let sum = 0;
      for (let k = -r; k <= r; k++) sum += src[base + Math.min(len - 1, Math.max(0, k)) * stride + c];
      for (let i = 0; i < len; i++) {
        dst[base + i * stride + c] = sum / div;
        sum += src[base + Math.min(len - 1, i + r + 1) * stride + c] - src[base + Math.max(0, i - r) * stride + c];
      }
    }
  }
}

// Box blur in place on a Uint8ClampedArray of RGBA data.
export function blurData(data, w, h, radius, iterations = 2) {
  const r = Math.max(1, Math.round(radius));
  const tmp = new Uint8ClampedArray(data.length);
  for (let i = 0; i < iterations; i++) {
    blurPass(data, tmp, w, h, r, true);
    blurPass(tmp, data, w, h, r, false);
  }
  return data;
}

export function blurImageData(img, radius, iterations = 2) {
  blurData(img.data, img.width, img.height, radius, iterations);
  return img;
}

// amount > 0 sharpens, amount < 0 softens
function unsharp(data, w, h, radius, amount) {
  const blurred = blurData(new Uint8ClampedArray(data), w, h, radius, 1);
  for (let i = 0; i < data.length; i += 4) {
    data[i] += (data[i] - blurred[i]) * amount;
    data[i + 1] += (data[i + 1] - blurred[i + 1]) * amount;
    data[i + 2] += (data[i + 2] - blurred[i + 2]) * amount;
  }
}

// v: merged adjustment values (see filters.js). Edits the ImageData in place.
export function applyPixelOps(img, v) {
  const d = img.data;
  const w = img.width;
  const h = img.height;
  const ex = Math.pow(2, ((v.exposure || 0) / 100) * 1.5);
  const br = ((v.brightness || 0) / 100) * 76;
  const c255 = (v.contrast || 0) * 2.55;
  const cf = (259 * (c255 + 255)) / (255 * (259 - c255));
  const sat = 1 + (v.saturation || 0) / 100;
  const temp = (v.temperature || 0) / 100;
  const tint = (v.tint || 0) / 100;
  const hi = (v.highlights || 0) / 100;
  const sh = (v.shadows || 0) / 100;
  const gray = (v.grayscale || 0) / 100;
  const sep = (v.sepia || 0) / 100;
  const inv = (v.invert || 0) / 100;
  const ang = ((v.hue || 0) * Math.PI) / 180;
  const cs = Math.cos(ang);
  const sn = Math.sin(ang);
  const m00 = 0.213 + cs * 0.787 - sn * 0.213, m01 = 0.715 - cs * 0.715 - sn * 0.715, m02 = 0.072 - cs * 0.072 + sn * 0.928;
  const m10 = 0.213 - cs * 0.213 + sn * 0.143, m11 = 0.715 + cs * 0.285 + sn * 0.14, m12 = 0.072 - cs * 0.072 - sn * 0.283;
  const m20 = 0.213 - cs * 0.213 - sn * 0.787, m21 = 0.715 - cs * 0.715 + sn * 0.715, m22 = 0.072 + cs * 0.928 + sn * 0.072;
  const doHue = Math.abs(v.hue || 0) > 0.01;
  const doTone = hi !== 0 || sh !== 0;
  const doSat = Math.abs(v.saturation || 0) > 0.01;

  for (let i = 0; i < d.length; i += 4) {
    let r = d[i] * ex + br;
    let g = d[i + 1] * ex + br;
    let b = d[i + 2] * ex + br;
    if (temp) { r += temp * 34; b -= temp * 34; }
    if (tint) { g -= tint * 26; r += tint * 8; b += tint * 8; }
    if (doTone) {
      const l = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
      const lc = l < 0 ? 0 : l > 1 ? 1 : l;
      const adj = sh * (1 - lc) * (1 - lc) * 70 + hi * lc * lc * 70;
      r += adj; g += adj; b += adj;
    }
    if (cf !== 1) { r = cf * (r - 128) + 128; g = cf * (g - 128) + 128; b = cf * (b - 128) + 128; }
    if (doHue) {
      const nr = m00 * r + m01 * g + m02 * b;
      const ng = m10 * r + m11 * g + m12 * b;
      const nb = m20 * r + m21 * g + m22 * b;
      r = nr; g = ng; b = nb;
    }
    if (doSat || gray || sep) {
      if (doSat) {
        const l = 0.299 * r + 0.587 * g + 0.114 * b;
        r = l + (r - l) * sat; g = l + (g - l) * sat; b = l + (b - l) * sat;
      }
      if (gray) {
        const l2 = 0.299 * r + 0.587 * g + 0.114 * b;
        r += (l2 - r) * gray; g += (l2 - g) * gray; b += (l2 - b) * gray;
      }
      if (sep) {
        const sr = r * 0.393 + g * 0.769 + b * 0.189;
        const sg = r * 0.349 + g * 0.686 + b * 0.168;
        const sb = r * 0.272 + g * 0.534 + b * 0.131;
        r += (sr - r) * sep; g += (sg - g) * sep; b += (sb - b) * sep;
      }
    }
    if (inv) { r += (255 - 2 * r) * inv; g += (255 - 2 * g) * inv; b += (255 - 2 * b) * inv; }
    d[i] = r; d[i + 1] = g; d[i + 2] = b;
  }

  const base = Math.max(w, h);
  if ((v.blur || 0) > 0.5) blurData(d, w, h, Math.max(1, ((v.blur / 100) * 0.025) * base), 2);
  if ((v.sharpen || 0) > 0.5) unsharp(d, w, h, Math.max(1, base * 0.0015), (v.sharpen / 100) * 1.8);
  if (Math.abs(v.clarity || 0) > 0.5) unsharp(d, w, h, Math.max(2, base * 0.01), (v.clarity / 100) * 0.9);
}
