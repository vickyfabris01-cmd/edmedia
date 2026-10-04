// js/editor/panels/text.js

import { Slider } from '../../components/Slider.js';
import { TextField } from '../../components/TextField.js';
import { ColorField } from '../../components/ColorField.js';
import { newTextLayer } from '../../engine/recipe.js';
import { FONTS } from '../../engine/render.js';
import { chipRow, tabs, iconToggle } from '../panels-ui.js';
import { h, injectStyle } from '../../utils/dom.js';

const CSS = `.text-row { display: flex; align-items: center; gap: var(--space-1); }`;

export function TextPanel(api) {
  injectStyle('panel-text', CSS);
  let layer = api.selected();
  if (!layer || layer.type !== 'text') {
    layer = newTextLayer();
    api.addLayer(layer);
  }
  const id = layer.id;
  const L = () => api.recipe.layers.find((l) => l.id === id);
  const set = (patch) => api.change(() => Object.assign(L(), patch));

  // Text page
  const content = TextField({ label: 'Text', value: layer.content, multiline: true, onInput(v) { set({ content: v }); } });
  const font = chipRow(Object.entries(FONTS).map(([value, f]) => ({ value, label: f.label })), layer.font, (v) => set({ font: v }));
  const size = Slider({ label: 'Size', min: 2, max: 30, step: 0.5, value: Math.round(layer.size * 200) / 2, resetValue: 7, format: (v) => v + '%', onInput(v) { set({ size: v / 100 }); } });
  const bold = iconToggle({ icon: 'bold', label: 'Bold', pressed: layer.bold, onClick() { const v = !L().bold; set({ bold: v }); bold.setAttribute('aria-pressed', String(v)); } });
  const italic = iconToggle({ icon: 'italic', label: 'Italic', pressed: layer.italic, onClick() { const v = !L().italic; set({ italic: v }); italic.setAttribute('aria-pressed', String(v)); } });
  const aligns = ['left', 'center', 'right'].map((a) => {
    const btn = iconToggle({
      icon: 'align' + a[0].toUpperCase() + a.slice(1), label: 'Align ' + a, pressed: layer.align === a,
      onClick() { set({ align: a }); aligns.forEach(([k, b]) => b.setAttribute('aria-pressed', String(k === a))); },
    });
    return [a, btn];
  });
  const textPage = h('div', { class: 'stack' }, content.el, font.el, size.el,
    h('div', { class: 'text-row' }, bold, italic, h('span', { class: 'fill' }), ...aligns.map(([, b]) => b)));

  // Style page
  const color = ColorField({ label: 'Text color', value: layer.color, onChange: (v) => set({ color: v }) });
  const bg = ColorField({ label: 'Background', value: layer.bg || '', allowNone: true, onChange: (v) => set({ bg: v }) });
  const bgOpacity = Slider({ label: 'Background opacity', min: 0, max: 100, step: 1, value: Math.round((layer.bgOpacity ?? 0.7) * 100), resetValue: 70, format: (v) => v + '%', onInput(v) { set({ bgOpacity: v / 100 }); } });
  const stylePage = h('div', { class: 'stack' }, color.el, bg.el, bgOpacity.el);

  // Effects page
  const outlineColor = ColorField({ label: 'Outline color', value: layer.outline.color, onChange: (v) => set({ outline: { ...L().outline, color: v } }) });
  const outlineWidth = Slider({ label: 'Outline', min: 0, max: 25, step: 1, value: Math.round(layer.outline.width * 100), resetValue: 0, format: (v) => v + '%', onInput(v) { set({ outline: { ...L().outline, width: v / 100 } }); } });
  const shadow = Slider({ label: 'Shadow', min: 0, max: 100, step: 1, value: Math.round(layer.shadow * 100), resetValue: 0, format: (v) => v + '%', onInput(v) { set({ shadow: v / 100 }); } });
  const opacity = Slider({ label: 'Opacity', min: 5, max: 100, step: 1, value: Math.round(layer.opacity * 100), resetValue: 100, format: (v) => v + '%', onInput(v) { set({ opacity: v / 100 }); } });
  const rotation = Slider({ label: 'Rotation', min: -180, max: 180, step: 1, value: layer.rotation, resetValue: 0, format: (v) => v + '\u00b0', onInput(v) { set({ rotation: v }); } });
  const fxPage = h('div', { class: 'stack' }, outlineColor.el, outlineWidth.el, shadow.el, opacity.el, rotation.el);

  const t = tabs([{ id: 'text', label: 'Text', el: textPage }, { id: 'style', label: 'Style', el: stylePage }, { id: 'fx', label: 'Effects', el: fxPage }], 'text');
  return { title: 'Text', el: t.el };
}
