// js/editor/panels/resize.js

import { Toggle } from '../../components/Toggle.js';
import { ColorField } from '../../components/ColorField.js';
import { fixPhotoPosition } from '../../engine/render.js';
import { MAX_SIDE, MIN_SIDE } from '../../engine/recipe.js';
import { SOCIAL_PRESETS } from '../../utils/social-presets.js';
import { chipRow } from '../panels-ui.js';
import { h, injectStyle } from '../../utils/dom.js';

const CSS = `
.rs-fields { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3); }
.rs-field { display: flex; flex-direction: column; gap: var(--space-1); }
.rs-field span { font-size: var(--text-caption); font-weight: var(--weight-semibold); color: var(--color-text-secondary); }
.rs-field input { width: 100%; min-height: var(--tap-target); padding: 0 var(--space-3); border: 1px solid var(--color-border); border-radius: var(--radius-md);
  background: var(--color-surface-2); color: var(--color-text); font-size: 16px; outline: none; }
.rs-field input:focus { border-color: var(--color-accent); box-shadow: 0 0 0 3px var(--color-accent-soft); }
.rs-hint { color: var(--color-text-secondary); font-size: var(--text-caption); }`;

const clamp = (v) => Math.min(MAX_SIDE, Math.max(MIN_SIDE, Math.round(v) || MIN_SIDE));

export function ResizePanel(api) {
  injectStyle('panel-resize', CSS);
  const c = () => api.recipe.canvas;
  let lock = true;

  const wIn = h('input', { type: 'number', inputmode: 'numeric', min: String(MIN_SIDE), max: String(MAX_SIDE), 'aria-label': 'Width in pixels' });
  const hIn = h('input', { type: 'number', inputmode: 'numeric', min: String(MIN_SIDE), max: String(MAX_SIDE), 'aria-label': 'Height in pixels' });
  function paint() { wIn.value = c().width; hIn.value = c().height; }

  function apply(width, height) {
    api.change((r) => { r.canvas.width = clamp(width); r.canvas.height = clamp(height); fixPhotoPosition(r, api.sources.photo); });
    paint();
  }

  wIn.addEventListener('input', () => {
    const w = Number(wIn.value);
    if (!w || w < MIN_SIDE) return;
    const ratio = c().height / c().width;
    apply(w, lock ? w * ratio : c().height);
    if (lock) hIn.value = c().height;
  });
  hIn.addEventListener('input', () => {
    const hh = Number(hIn.value);
    if (!hh || hh < MIN_SIDE) return;
    const ratio = c().width / c().height;
    apply(lock ? hh * ratio : c().width, hh);
    if (lock) wIn.value = c().width;
  });

  const presets = chipRow(
    SOCIAL_PRESETS.filter((p) => p.width).map((p) => ({ value: p.value, label: p.label })), '',
    (v) => { const p = SOCIAL_PRESETS.find((x) => x.value === v); apply(p.width, p.height); }
  );
  const keep = Toggle({ label: 'Keep proportions', checked: true, onChange(v) { lock = v; } });
  const bg = ColorField({ label: 'Background color', value: c().background, onChange(v) { api.change((r) => { r.canvas.background = v; }); } });

  paint();
  const el = h('div', { class: 'stack' },
    h('div', { class: 'rs-fields' }, h('label', { class: 'rs-field' }, h('span', {}, 'Width (px)'), wIn), h('label', { class: 'rs-field' }, h('span', {}, 'Height (px)'), hIn)),
    keep.el, presets.el, bg.el,
    h('p', { class: 'rs-hint' }, 'Changing the proportions may crop part of the photo. Use Crop to reposition it afterwards.')
  );
  return { title: 'Resize', el };
}
