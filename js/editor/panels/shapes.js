// js/editor/panels/shapes.js

import { Slider } from '../../components/Slider.js';
import { Toggle } from '../../components/Toggle.js';
import { ColorField } from '../../components/ColorField.js';
import { Button } from '../../components/Button.js';
import { icon } from '../../icons.js';
import { newShapeLayer, SHAPE_LABELS } from '../../engine/recipe.js';
import { h, injectStyle } from '../../utils/dom.js';

const CSS = `
.shape-row { display: flex; gap: var(--space-2); }
.shape-pick { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; flex: 1; min-height: 56px;
  border-radius: var(--radius-md); border: 1px solid var(--color-border); background: var(--color-surface-2); color: var(--color-text-secondary);
  font-size: var(--text-tiny); font-weight: var(--weight-semibold); }
.shape-pick[aria-pressed="true"] { border-color: var(--color-accent); background: var(--color-accent-soft); color: var(--color-accent); }`;

export function ShapesPanel(api) {
  injectStyle('panel-shapes', CSS);
  let id = null;
  const current = api.selected();
  if (current && current.type === 'shape') id = current.id;
  const L = () => api.recipe.layers.find((l) => l.id === id);
  const set = (patch) => { if (L()) api.change(() => Object.assign(L(), patch)); };

  const picks = new Map();
  const row = h('div', { class: 'shape-row', role: 'group', 'aria-label': 'Shape' });
  Object.entries(SHAPE_LABELS).forEach(([shape, label]) => {
    const btn = h('button', { type: 'button', class: 'shape-pick', 'aria-pressed': 'false' });
    btn.innerHTML = icon(shape === 'rect' ? 'rect' : shape);
    btn.append(h('span', {}, label));
    btn.addEventListener('click', () => {
      if (L() && L().shape !== shape) {
        // Switch the type of the selected shape
        const fresh = newShapeLayer(shape);
        set({ shape, name: fresh.name, w: fresh.w, h: fresh.h, thickness: shape === 'frame' ? fresh.thickness : L().thickness });
      } else if (!L()) {
        const layer = newShapeLayer(shape);
        api.addLayer(layer);
        id = layer.id;
      }
      mark();
      syncControls();
      api.refresh();
    });
    picks.set(shape, btn);
    row.append(btn);
  });

  const color = ColorField({ label: 'Color', value: L() ? L().color : '#ffffff', onChange: (v) => set({ color: v }) });
  const thickness = Slider({ label: 'Thickness', min: 0, max: 60, step: 1, value: L() ? Math.round(L().thickness * 1000) : 8, resetValue: 8, format: (v) => v / 10 + '%', onInput(v) { set({ thickness: v / 1000 }); } });
  const opacity = Slider({ label: 'Opacity', min: 5, max: 100, step: 1, value: L() ? Math.round(L().opacity * 100) : 100, resetValue: 100, format: (v) => v + '%', onInput(v) { set({ opacity: v / 100 }); } });
  const rotation = Slider({ label: 'Rotation', min: -180, max: 180, step: 1, value: L() ? L().rotation : 0, resetValue: 0, format: (v) => v + '\u00b0', onInput(v) { set({ rotation: v }); } });
  const fill = Toggle({ label: 'Filled', checked: L() ? L().fill : false, onChange(v) { set({ fill: v }); } });
  const addAnother = Button({
    label: 'Add another shape', variant: 'secondary', small: true,
    onClick() { id = null; mark(); syncControls(); api.select(null); },
  });
  const controls = h('div', { class: 'stack' }, color.el, thickness.el, opacity.el, rotation.el, fill.el, addAnother);

  function mark() {
    picks.forEach((btn, shape) => btn.setAttribute('aria-pressed', String(L() && L().shape === shape)));
  }
  function syncControls() {
    controls.hidden = !L();
    if (!L()) return;
    color.setValue(L().color);
    thickness.setValue(Math.round(L().thickness * 1000));
    opacity.setValue(Math.round(L().opacity * 100));
    rotation.setValue(L().rotation);
    fill.setChecked(L().fill);
    fill.el.hidden = !['rect', 'ellipse'].includes(L().shape);
    rotation.el.hidden = L().shape === 'frame';
  }
  mark();
  syncControls();

  const hint = h('p', { class: 'text-caption text-secondary' }, 'Pick a shape to add it. Drag it to move, pinch to resize.');
  return { title: 'Shapes', el: h('div', { class: 'stack' }, row, hint, controls) };
}
