// js/engine/render.js

import { createCanvas, sourceSize } from './canvas.js';
import { mergeValues } from './filters.js';
import { applyPixelOps, hasPixelEffect, blurImageData } from './pixels.js';
import { maskSize, unpackMaskCached, rasterShape, blurMask, maskBounds } from './maskops.js';

export const FONTS = {
  sans: { label: 'Sans', css: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' },
  serif: { label: 'Serif', css: 'Georgia, "Times New Roman", serif' },
  mono: { label: 'Mono', css: 'ui-monospace, Menlo, Consolas, monospace' },
  display: { label: 'Display', css: 'Impact, "Arial Black", "Helvetica Neue", sans-serif' },
  script: { label: 'Script', css: '"Brush Script MT", "Segoe Script", cursive' },
};

const GRID = { tl: [0, 0], tc: [0.5, 0], tr: [1, 0], ml: [0, 0.5], mc: [0.5, 0.5], mr: [1, 0.5], bl: [0, 1], bc: [0.5, 1], br: [1, 1] };

let measureCtx = null;
function measurer() {
  if (!measureCtx) measureCtx = createCanvas(4, 4).getContext('2d');
  return measureCtx;
}

export function slotPx(recipe, W, H) {
  const s = recipe.slot;
  return { x: Math.round(s.x * W), y: Math.round(s.y * H), w: Math.max(1, Math.round(s.w * W)), h: Math.max(1, Math.round(s.h * H)) };
}

// ---------- Photo placement ----------

export function photoMetrics(layer, img, sw, sh) {
  const { w: iw, h: ih } = sourceSize(img);
  const rot = (((layer.rot || 0) % 360) + 360) % 360;
  const swap = rot === 90 || rot === 270;
  const bw = swap ? ih : iw;
  const bh = swap ? iw : ih;
  const ang = ((layer.straighten || 0) * Math.PI) / 180;
  const c = Math.abs(Math.cos(ang));
  const s = Math.abs(Math.sin(ang));
  const base = Math.max((sw * c + sh * s) / bw, (sw * s + sh * c) / bh);
  return { iw, ih, bw, bh, rot, swap, ang, base, scale: base * (layer.zoom || 1) };
}

// Keeps the photo covering the whole slot.
export function clampPhoto(layer, img, sw, sh) {
  const m = photoMetrics(layer, img, sw, sh);
  const c = Math.abs(Math.cos(m.ang));
  const s = Math.abs(Math.sin(m.ang));
  const maxX = Math.max(0, (m.bw * m.scale - (sw * c + sh * s)) / 2) / sw;
  const maxY = Math.max(0, (m.bh * m.scale - (sw * s + sh * c)) / 2) / sh;
  layer.ox = Math.min(maxX, Math.max(-maxX, layer.ox || 0));
  layer.oy = Math.min(maxY, Math.max(-maxY, layer.oy || 0));
}

export function fixPhotoPosition(recipe, img) {
  const layer = recipe.layers.find((l) => l.type === 'photo');
  if (!layer || !img) return;
  const sp = slotPx(recipe, recipe.canvas.width, recipe.canvas.height);
  clampPhoto(layer, img, sp.w, sp.h);
}

function drawPhotoInto(ctx, layer, img, sw, sh) {
  const m = photoMetrics(layer, img, sw, sh);
  ctx.save();
  ctx.translate(sw / 2 + (layer.ox || 0) * sw, sh / 2 + (layer.oy || 0) * sh);
  ctx.rotate(m.ang);
  ctx.scale(m.scale, m.scale);
  ctx.rotate((m.rot * Math.PI) / 180);
  let fx = 1;
  let fy = 1;
  if (layer.flipH) { if (m.swap) fy = -1; else fx = -1; }
  if (layer.flipV) { if (m.swap) fx = -1; else fy = -1; }
  ctx.scale(fx, fy);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, -m.iw / 2, -m.ih / 2);
  ctx.restore();
}

function maskedBlend(original, adjusted, mask, w, h) {
  const m = createCanvas(w, h);
  const mc = m.getContext('2d');
  const cx = mask.cx * w;
  const cy = mask.cy * h;
  const rx = Math.max(1, mask.rx * w);
  const ry = Math.max(1, mask.ry * h);
  mc.fillStyle = '#fff';
  mc.beginPath();
  if (mask.shape === 'rect') mc.rect(cx - rx, cy - ry, rx * 2, ry * 2);
  else mc.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  mc.fill();
  const feather = ((mask.feather || 0) / 100) * Math.min(w, h) * 0.12;
  if (feather > 1 || mask.invert) {
    const id = mc.getImageData(0, 0, w, h);
    if (feather > 1) blurImageData(id, feather / 2, 2);
    if (mask.invert) for (let i = 3; i < id.data.length; i += 4) id.data[i] = 255 - id.data[i];
    mc.putImageData(id, 0, 0);
  }
  const tmp = createCanvas(w, h);
  const tc = tmp.getContext('2d');
  tc.drawImage(adjusted, 0, 0);
  tc.globalCompositeOperation = 'destination-in';
  tc.drawImage(m, 0, 0);
  const out = createCanvas(w, h);
  const oc = out.getContext('2d');
  oc.drawImage(original, 0, 0);
  oc.drawImage(tmp, 0, 0);
  return out;
}

function drawVignette(canvas, amount) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.25, w / 2, h / 2, Math.hypot(w, h) / 2);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,' + Math.min(0.9, (0.85 * amount) / 100) + ')');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

// The Vignette tool. v: { amount, strength, soft, round, x, y, light }
//  strength: how dark (or light) the edges get
//  amount: how far the effect reaches in from the edges
//  soft: how gradual the change is; round: 0 follows the picture's shape, 100 is a circle
//  x, y: move the centre (-100 to 100); light: white edges instead of dark
function drawVignetteTool(canvas, v) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  const round = clamp01((v.round == null ? 50 : v.round) / 100);
  const half = Math.hypot(w, h) / 2;
  const a = (w / Math.SQRT2) * (1 - round) + half * round;
  const b = (h / Math.SQRT2) * (1 - round) + half * round;
  const t0 = 1 - 0.95 * clamp01((v.amount == null ? 50 : v.amount) / 100);
  if (t0 >= 0.999) return;
  const t1 = t0 + (1 - t0) * (0.12 + 0.88 * clamp01((v.soft == null ? 60 : v.soft) / 100));
  const strength = clamp01((v.strength == null ? 60 : v.strength) / 100);
  const rgb = v.light ? '255,255,255' : '0,0,0';
  const cx = w / 2 + ((v.x || 0) / 100) * (w / 2);
  const cy = h / 2 + ((v.y || 0) / 100) * (h / 2);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  g.addColorStop(0, 'rgba(' + rgb + ',0)');
  g.addColorStop(t0, 'rgba(' + rgb + ',0)');
  const N = 10;
  for (let i = 1; i <= N; i++) {
    const u = i / N;
    g.addColorStop(Math.min(1, t0 + (t1 - t0) * u), 'rgba(' + rgb + ',' + (strength * u * u * (3 - 2 * u)).toFixed(4) + ')');
  }
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(a, b);
  ctx.fillStyle = g;
  ctx.fillRect(-cx / a, -cy / b, w / a, h / b);
  ctx.restore();
}

function renderPhoto(ctx, layer, recipe, img, W, H, original) {
  const sp = slotPx(recipe, W, H);
  let base = createCanvas(sp.w, sp.h);
  const bctx = base.getContext('2d');
  if (img) {
    drawPhotoInto(bctx, layer, img, sp.w, sp.h);
  } else {
    const g = bctx.createLinearGradient(0, 0, sp.w, sp.h);
    g.addColorStop(0, '#2e463a');
    g.addColorStop(1, '#142019');
    bctx.fillStyle = g;
    bctx.fillRect(0, 0, sp.w, sp.h);
  }
  if (!original) {
    const v = mergeValues(layer.adjust, layer.filter);
    let out = base;
    if (hasPixelEffect(v)) {
      out = createCanvas(sp.w, sp.h);
      const octx = out.getContext('2d');
      octx.drawImage(base, 0, 0);
      const id = octx.getImageData(0, 0, sp.w, sp.h);
      applyPixelOps(id, v);
      octx.putImageData(id, 0, 0);
      if (layer.mask) out = maskedBlend(base, out, layer.mask, sp.w, sp.h);
    }
    const tool = layer.vignette;
    const hasTool = !!tool && (tool.strength || 0) > 0.5 && (tool.amount || 0) > 0.5;
    if ((v.vignette || 0) > 0.5 || hasTool) {
      if (out === base) { out = createCanvas(sp.w, sp.h); out.getContext('2d').drawImage(base, 0, 0); }
      if ((v.vignette || 0) > 0.5) drawVignette(out, v.vignette);
      if (hasTool) drawVignetteTool(out, tool);
    }
    base = out;
  }
  ctx.drawImage(base, sp.x, sp.y);
}

// ---------- Text ----------

function layoutText(ctx, layer, W) {
  const px = Math.max(4, layer.size * W);
  const family = (FONTS[layer.font] || FONTS.sans).css;
  ctx.font = (layer.italic ? 'italic ' : '') + (layer.bold ? '700 ' : '400 ') + px + 'px ' + family;
  const maxW = Math.max(px, (layer.w || 0.8) * W);
  const lines = [];
  String(layer.content || '').split('\n').forEach((para) => {
    let line = '';
    para.split(' ').forEach((word) => {
      const test = line ? line + ' ' + word : word;
      if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = word; } else line = test;
    });
    lines.push(line);
  });
  let width = 0;
  lines.forEach((l) => { width = Math.max(width, ctx.measureText(l).width); });
  const lineH = px * 1.2;
  return { lines, px, lineH, width, height: lineH * lines.length, font: ctx.font };
}

function drawText(ctx, layer, W, H) {
  const L = layoutText(ctx, layer, W);
  const pad = L.px * 0.3;
  ctx.save();
  ctx.translate(layer.x * W, layer.y * H);
  ctx.rotate(((layer.rotation || 0) * Math.PI) / 180);
  ctx.font = L.font;
  ctx.textBaseline = 'middle';
  if (layer.bg) {
    const a = ctx.globalAlpha;
    ctx.globalAlpha = a * (layer.bgOpacity == null ? 1 : layer.bgOpacity);
    ctx.fillStyle = layer.bg;
    ctx.fillRect(-L.width / 2 - pad, -L.height / 2 - pad * 0.5, L.width + pad * 2, L.height + pad);
    ctx.globalAlpha = a;
  }
  const ax = layer.align === 'left' ? -L.width / 2 : layer.align === 'right' ? L.width / 2 : 0;
  ctx.textAlign = layer.align === 'left' ? 'left' : layer.align === 'right' ? 'right' : 'center';
  L.lines.forEach((line, i) => {
    const y = -L.height / 2 + L.lineH * (i + 0.5);
    if (layer.outline && layer.outline.width > 0) {
      ctx.lineWidth = L.px * layer.outline.width;
      ctx.strokeStyle = layer.outline.color;
      ctx.lineJoin = 'round';
      ctx.strokeText(line, ax, y);
    }
    ctx.save();
    if (layer.shadow > 0) {
      ctx.shadowColor = 'rgba(0,0,0,0.65)';
      ctx.shadowBlur = L.px * 0.2 * layer.shadow;
      ctx.shadowOffsetY = L.px * 0.06 * layer.shadow;
    }
    ctx.fillStyle = layer.color;
    ctx.fillText(line, ax, y);
    ctx.restore();
  });
  ctx.restore();
}

// ---------- Shapes ----------

function drawShape(ctx, layer, W, H) {
  const t = Math.max(0, layer.thickness * W);
  ctx.save();
  ctx.strokeStyle = layer.color;
  ctx.fillStyle = layer.color;
  ctx.lineWidth = t;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  if (layer.shape === 'frame') {
    if (t > 0) ctx.strokeRect(t / 2, t / 2, W - t, H - t);
    ctx.restore();
    return;
  }
  ctx.translate(layer.x * W, layer.y * H);
  ctx.rotate(((layer.rotation || 0) * Math.PI) / 180);
  const bw = layer.w * W;
  const bh = layer.h * H;
  if (layer.shape === 'rect') {
    if (layer.fill) ctx.fillRect(-bw / 2, -bh / 2, bw, bh);
    if (t > 0) ctx.strokeRect(-bw / 2, -bh / 2, bw, bh);
  } else if (layer.shape === 'ellipse') {
    ctx.beginPath();
    ctx.ellipse(0, 0, Math.max(1, bw / 2), Math.max(1, bh / 2), 0, 0, Math.PI * 2);
    if (layer.fill) ctx.fill();
    if (t > 0) ctx.stroke();
  } else {
    const lw = Math.max(t, 1);
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.moveTo(-bw / 2, 0);
    ctx.lineTo(bw / 2, 0);
    ctx.stroke();
    if (layer.shape === 'arrow') {
      const head = Math.max(lw * 4, W * 0.03);
      ctx.beginPath();
      ctx.moveTo(bw / 2 + lw / 2, 0);
      ctx.lineTo(bw / 2 - head, -head * 0.6);
      ctx.lineTo(bw / 2 - head, head * 0.6);
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.restore();
}

// ---------- Watermark ----------

function wmContent(layer, sources, W) {
  if (layer.mode === 'logo') {
    const img = sources.assets && sources.assets.get(layer.assetId);
    if (!img) return null;
    const { w: iw, h: ih } = sourceSize(img);
    const width = Math.max(4, layer.size * W);
    return { kind: 'logo', img, w: width, h: (width * ih) / iw };
  }
  const ctx = measurer();
  const px = Math.max(6, layer.size * W * 0.35);
  ctx.font = '700 ' + px + 'px ' + FONTS.sans.css;
  return { kind: 'text', text: layer.text || '', px, w: ctx.measureText(layer.text || '').width, h: px * 1.2 };
}

function drawWmContent(ctx, layer, c) {
  if (c.kind === 'logo') {
    ctx.drawImage(c.img, -c.w / 2, -c.h / 2, c.w, c.h);
    return;
  }
  ctx.font = '700 ' + c.px + 'px ' + FONTS.sans.css;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = c.px * 0.15;
  ctx.fillStyle = layer.color || '#ffffff';
  ctx.fillText(c.text, 0, 0);
}

function wmPosition(layer, c, W, H) {
  const [gx, gy] = GRID[layer.position] || GRID.br;
  const m = 0.03 * W;
  const cx = gx === 0 ? m + c.w / 2 : gx === 1 ? W - m - c.w / 2 : W / 2;
  const cy = gy === 0 ? m + c.h / 2 : gy === 1 ? H - m - c.h / 2 : H / 2;
  return { cx, cy };
}

function drawWatermark(ctx, layer, sources, W, H) {
  const c = wmContent(layer, sources, W);
  if (!c || (c.kind === 'text' && !c.text)) return;
  ctx.save();
  if (layer.tiled) {
    const diag = Math.hypot(W, H);
    const stepX = c.w * 2.2;
    const stepY = c.h * 3.2;
    ctx.translate(W / 2, H / 2);
    ctx.rotate(((layer.rotation || 0) * Math.PI) / 180);
    let row = 0;
    for (let y = -diag / 2; y < diag / 2; y += stepY, row++) {
      for (let x = -diag / 2 - (row % 2 ? stepX / 2 : 0); x < diag / 2; x += stepX) {
        ctx.save();
        ctx.translate(x, y);
        drawWmContent(ctx, layer, c);
        ctx.restore();
      }
    }
  } else {
    const { cx, cy } = wmPosition(layer, c, W, H);
    ctx.translate(cx, cy);
    ctx.rotate(((layer.rotation || 0) * Math.PI) / 180);
    drawWmContent(ctx, layer, c);
  }
  ctx.restore();
}

// ---------- Blur ----------

// Blurs a copy of src. Large radii are blurred on a smaller copy, then scaled back up, which is much faster.
function blurredCopy(src, bw, bh, radius) {
  const f = Math.max(1, Math.floor(radius / 3));
  const sw = Math.max(1, Math.round(bw / f));
  const sh = Math.max(1, Math.round(bh / f));
  const small = createCanvas(sw, sh);
  const sctx = small.getContext('2d');
  sctx.imageSmoothingEnabled = true;
  sctx.imageSmoothingQuality = 'high';
  sctx.drawImage(src, 0, 0, sw, sh);
  const id = sctx.getImageData(0, 0, sw, sh);
  blurImageData(id, Math.max(1, radius / f), 2);
  sctx.putImageData(id, 0, 0);
  if (f === 1) return small;
  const out = createCanvas(bw, bh);
  const octx = out.getContext('2d');
  octx.imageSmoothingEnabled = true;
  octx.imageSmoothingQuality = 'high';
  octx.drawImage(small, 0, 0, bw, bh);
  return out;
}

// Pixel box that a blur layer touches (before soft edge), or null when it has nothing to blur.
function blurArea(layer, W, H) {
  if (layer.shape === 'brush') {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    (layer.strokes || []).forEach((s) => {
      if (s.erase) return;
      const r = (s.size * W) / 2;
      s.pts.forEach(([px, py]) => {
        x0 = Math.min(x0, px * W - r); x1 = Math.max(x1, px * W + r);
        y0 = Math.min(y0, py * H - r); y1 = Math.max(y1, py * H + r);
      });
    });
    return x0 === Infinity ? null : { x0, y0, x1, y1 };
  }
  const hw = (layer.w * W) / 2;
  const hh = (layer.h * H) / 2;
  return { x0: layer.cx * W - hw, y0: layer.cy * H - hh, x1: layer.cx * W + hw, y1: layer.cy * H + hh };
}

function drawBlur(ctx, layer, W, H) {
  const area = blurArea(layer, W, H);
  if (!area) return;
  const feather = ((layer.feather || 0) / 100) * Math.min(W, H) * 0.06;
  const pad = Math.ceil(feather * 2 + 2);
  const bx = Math.max(0, Math.floor(area.x0 - pad));
  const by = Math.max(0, Math.floor(area.y0 - pad));
  const bw = Math.min(W, Math.ceil(area.x1 + pad)) - bx;
  const bh = Math.min(H, Math.ceil(area.y1 + pad)) - by;
  if (bw < 1 || bh < 1) return;

  // The soft-edged shape that decides where the blur shows
  const mask = createCanvas(bw, bh);
  const mc = mask.getContext('2d');
  mc.translate(-bx, -by);
  mc.fillStyle = '#fff';
  mc.strokeStyle = '#fff';
  if (layer.shape === 'brush') {
    mc.lineCap = 'round';
    mc.lineJoin = 'round';
    (layer.strokes || []).forEach((s) => {
      mc.globalCompositeOperation = s.erase ? 'destination-out' : 'source-over';
      mc.lineWidth = Math.max(1, s.size * W);
      if (s.pts.length === 1) {
        mc.beginPath();
        mc.arc(s.pts[0][0] * W, s.pts[0][1] * H, mc.lineWidth / 2, 0, Math.PI * 2);
        mc.fill();
      } else {
        mc.beginPath();
        s.pts.forEach(([px, py], i) => { if (i) mc.lineTo(px * W, py * H); else mc.moveTo(px * W, py * H); });
        mc.stroke();
      }
    });
  } else {
    mc.beginPath();
    if (layer.shape === 'rect') mc.rect(area.x0, area.y0, area.x1 - area.x0, area.y1 - area.y0);
    else mc.ellipse((area.x0 + area.x1) / 2, (area.y0 + area.y1) / 2, Math.max(1, (area.x1 - area.x0) / 2), Math.max(1, (area.y1 - area.y0) / 2), 0, 0, Math.PI * 2);
    mc.fill();
  }
  mc.setTransform(1, 0, 0, 1, 0, 0);
  mc.globalCompositeOperation = 'source-over';
  if (feather > 1) {
    const id = mc.getImageData(0, 0, bw, bh);
    blurImageData(id, feather / 2, 2);
    mc.putImageData(id, 0, 0);
  }

  // Blur what is already drawn underneath, keep only the masked part
  const under = createCanvas(bw, bh);
  under.getContext('2d').drawImage(ctx.canvas, bx, by, bw, bh, 0, 0, bw, bh);
  const radius = Math.max(1, ((layer.strength || 0) / 100) * 0.05 * Math.max(W, H));
  const blurred = blurredCopy(under, bw, bh, radius);
  const bc = blurred.getContext('2d');
  bc.globalCompositeOperation = 'destination-in';
  bc.drawImage(mask, 0, 0);
  ctx.drawImage(blurred, bx, by);
}

// ---------- Selective black and white ----------

// The soft-edged selection as a grid of 0-255, or null when nothing is selected yet.
function monoWeights(layer, W, H) {
  let data;
  let gw;
  let gh;
  if (layer.shape === 'rect' || layer.shape === 'ellipse') {
    const size = maskSize(W, H, Math.min(1024, Math.max(W, H)));
    gw = size.w;
    gh = size.h;
    data = rasterShape(layer.shape, layer.cx, layer.cy, layer.w, layer.h, gw, gh);
  } else {
    // While someone is painting, the newest strokes are in layer._live (hidden from saving and copying)
    const live = layer._live;
    if (live) { gw = live.w; gh = live.h; data = Uint8Array.from(live.data); }
    else {
      if (!layer.mask || !layer.mask.rle) return null;
      gw = layer.mask.w;
      gh = layer.mask.h;
      data = Uint8Array.from(unpackMaskCached(layer.mask)); // a copy, because the soft edge changes it
    }
  }
  const raw = Uint8Array.from(data); // the selection as drawn, before the soft edge
  const feather = ((layer.feather || 0) / 100) * 0.04 * Math.max(gw, gh);
  if (feather >= 1) blurMask(data, gw, gh, feather);
  return { data, gw, gh, raw };
}

// Turns the selected area (or everything else) black and white, and can add colour to the rest.
// layer: { shape, mask | cx cy w h, target: 'inside' | 'outside', amount, boost, feather }
function drawMono(ctx, layer, W, H, preview) {
  const weights = monoWeights(layer, W, H);
  if (!weights) return;
  const { data: m, gw, gh } = weights;
  const box = maskBounds(m, gw, gh, 1);
  if (!box) return; // nothing selected: no effect
  const outside = layer.target === 'outside';
  const op = layer.opacity == null ? 1 : layer.opacity;
  const amount = clamp01((layer.amount == null ? 100 : layer.amount) / 100) * op;
  const boost = clamp01((layer.boost || 0) / 100);
  const bf = 1 + boost * 0.8;
  if (amount <= 0 && boost <= 0) return;

  // Without a colour boost only the selected area changes, so only that part is processed
  let x0 = 0, y0 = 0, x1 = W, y1 = H;
  if (!outside && boost === 0) {
    x0 = Math.max(0, Math.floor((box.x0 * W) / gw) - 3);
    y0 = Math.max(0, Math.floor((box.y0 * H) / gh) - 3);
    x1 = Math.min(W, Math.ceil((box.x1 * W) / gw) + 3);
    y1 = Math.min(H, Math.ceil((box.y1 * H) / gh) + 3);
  }
  const rw = x1 - x0;
  const rh = y1 - y0;
  if (rw < 1 || rh < 1) return;
  const img = ctx.getImageData(x0, y0, rw, rh);
  const d = img.data;

  // Smooth sampling of the selection grid at every pixel
  const xa = new Int32Array(rw);
  const xb = new Int32Array(rw);
  const xf = new Float32Array(rw);
  for (let i = 0; i < rw; i++) {
    const g = ((x0 + i + 0.5) * gw) / W - 0.5;
    const a = Math.floor(g);
    xa[i] = Math.min(gw - 1, Math.max(0, a));
    xb[i] = Math.min(gw - 1, Math.max(0, a + 1));
    xf[i] = g - a;
  }
  for (let j = 0; j < rh; j++) {
    const g = ((y0 + j + 0.5) * gh) / H - 0.5;
    const a = Math.floor(g);
    const rowA = Math.min(gh - 1, Math.max(0, a)) * gw;
    const rowB = Math.min(gh - 1, Math.max(0, a + 1)) * gw;
    const fy = g - a;
    for (let i = 0; i < rw; i++) {
      const top = m[rowA + xa[i]] * (1 - xf[i]) + m[rowA + xb[i]] * xf[i];
      const bot = m[rowB + xa[i]] * (1 - xf[i]) + m[rowB + xb[i]] * xf[i];
      let wgt = (top * (1 - fy) + bot * fy) / 255;
      if (outside) wgt = 1 - wgt;
      const t = wgt * amount;
      if (t < 0.002 && boost === 0) continue;
      const p = (j * rw + i) * 4;
      const r = d[p];
      const gr = d[p + 1];
      const b = d[p + 2];
      const l = 0.299 * r + 0.587 * gr + 0.114 * b;
      const f = (1 - t) * bf;
      d[p] = l + (r - l) * f;
      d[p + 1] = l + (gr - l) * f;
      d[p + 2] = l + (b - l) * f;
    }
  }
  ctx.putImageData(img, x0, y0);

  // While editing, the selected cells are tinted red so the edges are easy to check
  if (preview) {
    const tint = createCanvas(gw, gh);
    const tc = tint.getContext('2d');
    const tdata = tc.createImageData(gw, gh);
    const raw = weights.raw;
    for (let i = 0; i < raw.length; i++) {
      tdata.data[i * 4] = 255;
      tdata.data[i * 4 + 1] = 40;
      tdata.data[i * 4 + 2] = 70;
      tdata.data[i * 4 + 3] = Math.round(raw[i] * 0.42);
    }
    tc.putImageData(tdata, 0, 0);
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(tint, 0, 0, W, H);
    ctx.restore();
  }
}

// ---------- Bounds for selection and hit testing (canvas pixels) ----------

export function layerBounds(layer, recipe, sources) {
  const W = recipe.canvas.width;
  const H = recipe.canvas.height;
  if (layer.type === 'text') {
    const L = layoutText(measurer(), layer, W);
    const pad = L.px * 0.3;
    return { cx: layer.x * W, cy: layer.y * H, w: L.width + pad * 2, h: L.height + pad, rot: layer.rotation || 0 };
  }
  if (layer.type === 'shape') {
    if (layer.shape === 'frame') return null;
    const minH = Math.max(layer.thickness * W * 3, W * 0.03);
    const line = layer.shape === 'line' || layer.shape === 'arrow';
    return { cx: layer.x * W, cy: layer.y * H, w: layer.w * W, h: line ? minH : Math.max(layer.h * H, minH), rot: layer.rotation || 0 };
  }
  if (layer.type === 'blur') {
    const a = blurArea(layer, W, H);
    return a ? { cx: (a.x0 + a.x1) / 2, cy: (a.y0 + a.y1) / 2, w: a.x1 - a.x0, h: a.y1 - a.y0, rot: 0 } : null;
  }
  if (layer.type === 'mono') {
    if (layer.shape === 'rect' || layer.shape === 'ellipse') return { cx: layer.cx * W, cy: layer.cy * H, w: layer.w * W, h: layer.h * H, rot: 0 };
    const src = layer._live ? { w: layer._live.w, h: layer._live.h, data: layer._live.data } : layer.mask && layer.mask.rle ? { w: layer.mask.w, h: layer.mask.h, data: unpackMaskCached(layer.mask) } : null;
    if (!src) return null;
    const b = maskBounds(src.data, src.w, src.h, 8);
    if (!b) return null;
    const sx = W / src.w;
    const sy = H / src.h;
    return { cx: ((b.x0 + b.x1) / 2) * sx, cy: ((b.y0 + b.y1) / 2) * sy, w: (b.x1 - b.x0) * sx, h: (b.y1 - b.y0) * sy, rot: 0 };
  }
  if (layer.type === 'watermark' && !layer.tiled) {
    const c = wmContent(layer, sources, W);
    if (!c) return null;
    const { cx, cy } = wmPosition(layer, c, W, H);
    return { cx, cy, w: c.w, h: c.h, rot: layer.rotation || 0 };
  }
  return null;
}

// ---------- Main entry ----------

// sources: { photo: CanvasImageSource|null, assets: Map(assetId -> CanvasImageSource) }
// opts: { scale = 1, original = false, untilLayerId } - untilLayerId draws only the layers below that layer
export function renderRecipe(target, recipe, sources, opts = {}) {
  const scale = opts.scale || 1;
  const W = Math.max(1, Math.round(recipe.canvas.width * scale));
  const H = Math.max(1, Math.round(recipe.canvas.height * scale));
  target.width = W;
  target.height = H;
  const ctx = target.getContext('2d');
  ctx.fillStyle = recipe.canvas.background || '#000000';
  ctx.fillRect(0, 0, W, H);
  const src = { photo: sources.photo, assets: sources.assets || new Map() };

  for (const layer of recipe.layers) {
    if (opts.untilLayerId && layer.id === opts.untilLayerId) break;
    if (!layer.visible) continue;
    if (opts.original && layer.type !== 'photo') continue;
    ctx.save();
    ctx.globalAlpha = layer.opacity == null ? 1 : layer.opacity;
    if (layer.type === 'photo') renderPhoto(ctx, layer, recipe, src.photo, W, H, !!opts.original);
    else if (layer.type === 'text') drawText(ctx, layer, W, H);
    else if (layer.type === 'shape') drawShape(ctx, layer, W, H);
    else if (layer.type === 'watermark') drawWatermark(ctx, layer, src, W, H);
    else if (layer.type === 'blur') drawBlur(ctx, layer, W, H);
    else if (layer.type === 'mono') drawMono(ctx, layer, W, H, opts.selectionPreviewId === layer.id);
    ctx.restore();
  }
  return target;
}

export function renderToCanvas(recipe, sources, scale, opts = {}) {
  const canvas = createCanvas(recipe.canvas.width * scale, recipe.canvas.height * scale);
  return renderRecipe(canvas, recipe, sources, { ...opts, scale });
}