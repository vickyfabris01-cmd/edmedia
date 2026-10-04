// js/engine/render.js

import { createCanvas, sourceSize } from './canvas.js';
import { mergeValues } from './filters.js';
import { applyPixelOps, hasPixelEffect, blurImageData } from './pixels.js';

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
    if ((v.vignette || 0) > 0.5) {
      if (out === base) { out = createCanvas(sp.w, sp.h); out.getContext('2d').drawImage(base, 0, 0); }
      drawVignette(out, v.vignette);
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
// opts: { scale = 1, original = false }
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
    if (!layer.visible) continue;
    if (opts.original && layer.type !== 'photo') continue;
    ctx.save();
    ctx.globalAlpha = layer.opacity == null ? 1 : layer.opacity;
    if (layer.type === 'photo') renderPhoto(ctx, layer, recipe, src.photo, W, H, !!opts.original);
    else if (layer.type === 'text') drawText(ctx, layer, W, H);
    else if (layer.type === 'shape') drawShape(ctx, layer, W, H);
    else if (layer.type === 'watermark') drawWatermark(ctx, layer, src, W, H);
    ctx.restore();
  }
  return target;
}

export function renderToCanvas(recipe, sources, scale, opts = {}) {
  const canvas = createCanvas(recipe.canvas.width * scale, recipe.canvas.height * scale);
  return renderRecipe(canvas, recipe, sources, { ...opts, scale });
}
