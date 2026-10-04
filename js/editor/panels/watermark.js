// js/editor/panels/watermark.js

import { Slider } from '../../components/Slider.js';
import { TextField } from '../../components/TextField.js';
import { ColorField } from '../../components/ColorField.js';
import { Toggle } from '../../components/Toggle.js';
import { Button } from '../../components/Button.js';
import { SegmentedControl } from '../../components/SegmentedControl.js';
import { newWatermarkLayer } from '../../engine/recipe.js';
import { listAssets, addAsset } from '../../store/assets.js';
import { pickImage } from '../../utils/files.js';
import { h, injectStyle } from '../../utils/dom.js';

const CSS = `
.wm-grid { display: grid; grid-template-columns: repeat(3, 44px); gap: 4px; }
.wm-cell { width: 44px; height: 44px; border-radius: var(--radius-sm); border: 1px solid var(--color-border-strong); background: var(--color-surface-2); display: grid; place-items: center; }
.wm-cell::after { content: ""; width: 10px; height: 10px; border-radius: 50%; background: var(--color-border-strong); }
.wm-cell[aria-pressed="true"] { border-color: var(--color-accent); background: var(--color-accent-soft); }
.wm-cell[aria-pressed="true"]::after { background: var(--color-accent); }
.wm-label { font-size: var(--text-caption); font-weight: var(--weight-semibold); color: var(--color-text-secondary); }
.wm-row { display: flex; align-items: flex-start; gap: var(--space-4); }
.wm-assets { display: flex; gap: var(--space-2); overflow-x: auto; scrollbar-width: none; align-items: center; }
.wm-assets::-webkit-scrollbar { display: none; }
.wm-asset { flex: none; width: 56px; height: 56px; border-radius: var(--radius-md); border: 2px solid var(--color-border); overflow: hidden;
  background: conic-gradient(var(--color-surface-2) 25%, var(--color-surface-3) 0 50%, var(--color-surface-2) 0 75%, var(--color-surface-3) 0) 0 0 / 12px 12px; }
.wm-asset[aria-pressed="true"] { border-color: var(--color-accent); }
.wm-asset img { width: 100%; height: 100%; object-fit: contain; }`;

const POSITIONS = ['tl', 'tc', 'tr', 'ml', 'mc', 'mr', 'bl', 'bc', 'br'];

export function WatermarkPanel(api) {
  injectStyle('panel-watermark', CSS);
  let layer = api.selected();
  if (!layer || layer.type !== 'watermark') {
    layer = newWatermarkLayer();
    api.addLayer(layer);
  }
  const id = layer.id;
  const L = () => api.recipe.layers.find((l) => l.id === id);
  const set = (patch) => api.change(() => Object.assign(L(), patch));
  const urls = [];

  const mode = SegmentedControl({
    ariaLabel: 'Watermark type', value: layer.mode,
    options: [{ value: 'text', label: 'Text' }, { value: 'logo', label: 'Logo' }],
    onChange(v) { set({ mode: v }); paint(); },
  });

  // Text options
  const text = TextField({ label: 'Watermark text', value: layer.text, maxLength: 40, onInput(v) { set({ text: v }); } });
  const color = ColorField({ label: 'Color', value: layer.color, onChange: (v) => set({ color: v }) });
  const textBox = h('div', { class: 'stack' }, text.el, color.el);

  // Logo options
  const assets = h('div', { class: 'wm-assets' });
  const logoBox = h('div', { class: 'stack' }, h('span', { class: 'wm-label' }, 'Logo from your brand library'), assets);
  const addBtn = Button({
    label: 'Add logo', variant: 'secondary', small: true,
    async onClick() {
      const file = await pickImage();
      if (!file) return;
      try {
        const asset = await addAsset(file, (file.name || 'Logo').replace(/\.[^.]+$/, '').slice(0, 40) || 'Logo');
        await api.ensureAsset(asset.id);
        set({ assetId: asset.id });
        await loadAssets();
      } catch (err) { console.error(err); api.toast('Could not add this image.', 'danger'); }
    },
  });

  async function loadAssets() {
    urls.splice(0).forEach((u) => URL.revokeObjectURL(u));
    const list = await listAssets();
    assets.replaceChildren();
    list.forEach((a) => {
      const url = URL.createObjectURL(a.blob);
      urls.push(url);
      const btn = h('button', { type: 'button', class: 'wm-asset', 'aria-label': a.name, 'aria-pressed': String(L().assetId === a.id) }, h('img', { src: url, alt: '' }));
      btn.addEventListener('click', async () => {
        await api.ensureAsset(a.id);
        set({ assetId: a.id });
        assets.querySelectorAll('.wm-asset').forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
      });
      assets.append(btn);
    });
    assets.append(addBtn);
  }

  function paint() {
    textBox.hidden = mode.el && L().mode !== 'text';
    logoBox.hidden = L().mode !== 'logo';
  }

  // Shared options
  const size = Slider({ label: 'Size', min: 5, max: 80, step: 1, value: Math.round(layer.size * 100), resetValue: 20, format: (v) => v + '%', onInput(v) { set({ size: v / 100 }); } });
  const opacity = Slider({ label: 'Opacity', min: 10, max: 100, step: 1, value: Math.round(layer.opacity * 100), resetValue: 80, format: (v) => v + '%', onInput(v) { set({ opacity: v / 100 }); } });
  const rotation = Slider({ label: 'Rotation', min: -180, max: 180, step: 1, value: layer.rotation, resetValue: 0, format: (v) => v + '\u00b0', onInput(v) { set({ rotation: v }); } });
  const tiled = Toggle({
    label: 'Repeat across the photo', checked: layer.tiled,
    onChange(v) {
      set({ tiled: v, rotation: v && L().rotation === 0 ? -25 : L().rotation });
      rotation.setValue(L().rotation);
      api.refresh();
    },
  });
  const cells = POSITIONS.map((p) => {
    const cell = h('button', { type: 'button', class: 'wm-cell', 'aria-label': 'Position ' + p, 'aria-pressed': String(layer.position === p) });
    cell.addEventListener('click', () => { set({ position: p }); cells.forEach(([k, c]) => c.setAttribute('aria-pressed', String(k === p))); api.refresh(); });
    return [p, cell];
  });
  const grid = h('div', { class: 'wm-grid', role: 'group', 'aria-label': 'Position' }, ...cells.map(([, c]) => c));
  const posBox = h('div', { class: 'wm-row' }, h('div', { class: 'stack stack--tight' }, h('span', { class: 'wm-label' }, 'Position'), grid),
    h('div', { class: 'stack fill' }, size.el, opacity.el));

  const el = h('div', { class: 'stack' }, mode.el, textBox, logoBox, posBox, rotation.el, tiled.el);
  paint();
  loadAssets().catch((err) => console.warn('Could not load logos', err));
  return { title: 'Watermark', el, onClose() { urls.forEach((u) => URL.revokeObjectURL(u)); } };
}
