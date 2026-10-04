// js/editor/export-sheet.js

import { openSheet } from '../components/BottomSheet.js';
import { SegmentedControl } from '../components/SegmentedControl.js';
import { Slider } from '../components/Slider.js';
import { Button } from '../components/Button.js';
import { chipRow } from './panels-ui.js';
import { renderToCanvas } from '../engine/render.js';
import { createCanvas, canvasToBlob } from '../engine/canvas.js';
import { MAX_SIDE } from '../engine/recipe.js';
import { SOCIAL_PRESETS, getSocialPreset } from '../utils/social-presets.js';
import { getSetting } from '../store/settings.js';
import { formatBytes } from '../utils/format.js';
import { downloadBlob, safeFileName } from '../utils/files.js';
import { h, injectStyle } from '../utils/dom.js';

const CSS = `
.exp-preview { display: grid; place-items: center; height: 30dvh; border-radius: var(--radius-lg); background: var(--color-surface-3); overflow: hidden; }
.exp-preview img { max-width: 100%; max-height: 100%; object-fit: contain; }
.exp-label { font-size: var(--text-caption); font-weight: var(--weight-semibold); color: var(--color-text-secondary); }
.exp-info { display: flex; align-items: center; justify-content: space-between; color: var(--color-text-secondary); font-size: var(--text-caption); font-weight: var(--weight-semibold); min-height: 20px; }
.exp-actions { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-2); }
.exp-note { color: var(--color-warning); font-size: var(--text-caption); }`;

const MIME = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const LONG = { large: 2048, medium: 1080, small: 720 };

const SIZES = [
  { value: 'orig', label: 'Original' }, { value: 'large', label: 'Large 2048' }, { value: 'medium', label: 'Medium 1080' }, { value: 'small', label: 'Small 720' },
  ...SOCIAL_PRESETS.filter((p) => p.width).map((p) => ({ value: p.value, label: p.label })),
];

function outputSize(recipe, key) {
  const W = recipe.canvas.width;
  const H = recipe.canvas.height;
  const cap = (w, hh) => { const s = Math.min(1, MAX_SIDE / Math.max(w, hh)); return { w: Math.round(w * s), h: Math.round(hh * s) }; };
  if (key === 'orig') return { ...cap(W, H), cover: false };
  if (LONG[key]) { const s = LONG[key] / Math.max(W, H); return { ...cap(W * s, H * s), cover: false }; }
  const p = getSocialPreset(key);
  return { w: p.width, h: p.height, cover: true };
}

// Draws the recipe to the final size. Social sizes fill the frame and crop the overflow from the center.
function renderOutput(recipe, sources, size) {
  if (!size.cover) return renderToCanvas(recipe, sources, size.w / recipe.canvas.width);
  const scale = Math.max(size.w / recipe.canvas.width, size.h / recipe.canvas.height);
  const full = renderToCanvas(recipe, sources, scale);
  const out = createCanvas(size.w, size.h);
  out.getContext('2d').drawImage(full, (size.w - full.width) / 2, (size.h - full.height) / 2);
  return out;
}

export async function openExportSheet({ recipe, sources, name }) {
  injectStyle('export-sheet', CSS);
  let format = 'jpeg';
  let quality = 0.9;
  let sizeKey = 'orig';
  try {
    format = await getSetting('exportFormat');
    quality = await getSetting('exportQuality');
    const preset = await getSetting('socialPreset');
    if (preset && preset !== 'none') sizeKey = preset;
  } catch { /* defaults are fine */ }

  let blob = null;
  let url = null;
  let token = 0;
  let timer = 0;
  let closed = false;

  const previewBox = h('div', { class: 'exp-preview' });
  const info = h('div', { class: 'exp-info' });
  const note = h('p', { class: 'exp-note' });
  note.hidden = true;

  const fmt = SegmentedControl({
    ariaLabel: 'Format', value: format,
    options: [{ value: 'jpeg', label: 'JPEG' }, { value: 'png', label: 'PNG' }, { value: 'webp', label: 'WebP' }],
    onChange(v) { format = v; qualitySlider.input.disabled = v === 'png'; schedule(); },
  });
  const qualitySlider = Slider({ label: 'Quality', min: 50, max: 100, step: 1, value: Math.round(quality * 100), format: (v) => v + '%', onInput(v) { quality = v / 100; schedule(); } });
  qualitySlider.input.disabled = format === 'png';
  const sizes = chipRow(SIZES, sizeKey, (v) => { sizeKey = v; schedule(); });

  const download = Button({ label: 'Download', variant: 'primary', icon: 'download', disabled: true, onClick() {
    if (!blob) return;
    downloadBlob(blob, safeFileName(name) + '.' + (EXT[blob.type] || 'jpg'));
  } });
  const canShare = typeof navigator !== 'undefined' && navigator.share && navigator.canShare;
  const share = Button({ label: 'Share', variant: 'secondary', icon: 'share', disabled: true, async onClick() {
    if (!blob) return;
    const file = new File([blob], safeFileName(name) + '.' + (EXT[blob.type] || 'jpg'), { type: blob.type });
    try {
      if (navigator.canShare({ files: [file] })) await navigator.share({ files: [file], title: name });
    } catch (err) { if (err && err.name !== 'AbortError') console.warn('Share failed', err); }
  } });

  const actions = h('div', { class: 'exp-actions' }, download);
  if (canShare) actions.append(share); else actions.style.gridTemplateColumns = '1fr';

  const body = h('div', { class: 'stack' },
    previewBox,
    h('span', { class: 'exp-label' }, 'Format'), fmt.el,
    qualitySlider.el,
    h('span', { class: 'exp-label' }, 'Size'), sizes.el,
    info, note, actions
  );

  function busy(on) {
    download.disabled = on || !blob;
    share.disabled = on || !blob;
    if (on) info.textContent = 'Preparing...';
  }

  function schedule() {
    clearTimeout(timer);
    busy(true);
    timer = setTimeout(build, 350);
  }

  async function build() {
    const mine = ++token;
    const size = outputSize(recipe, sizeKey);
    await new Promise((r) => setTimeout(r, 0));
    try {
      const canvas = renderOutput(recipe, sources, size);
      const wanted = MIME[format];
      const out = await canvasToBlob(canvas, wanted, quality);
      if (mine !== token || closed) return;
      blob = out;
      if (url) URL.revokeObjectURL(url);
      url = URL.createObjectURL(out);
      previewBox.replaceChildren(h('img', { src: url, alt: 'Export preview' }));
      info.textContent = size.w + ' \u00d7 ' + size.h + '  -  ' + formatBytes(out.size);
      note.hidden = out.type === wanted;
      if (!note.hidden) note.textContent = 'This browser cannot save ' + format.toUpperCase() + ', so ' + (EXT[out.type] || 'another format').toUpperCase() + ' is used instead.';
      busy(false);
    } catch (err) {
      console.error('Export failed', err);
      if (mine === token) { info.textContent = 'Could not prepare this export.'; busy(false); download.disabled = true; share.disabled = true; }
    }
  }

  openSheet({ title: 'Export', body, tall: true, onClose() { closed = true; clearTimeout(timer); if (url) URL.revokeObjectURL(url); } });
  schedule();
}
