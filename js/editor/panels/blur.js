// js/editor/panels/blur.js

import { Slider } from '../../components/Slider.js';
import { Toggle } from '../../components/Toggle.js';
import { Button } from '../../components/Button.js';
import { newBlurLayer } from '../../engine/recipe.js';
import { chipRow } from '../panels-ui.js';
import { hitCorner, toCanvasFraction, ovalSize } from '../handles.js';
import { h, injectStyle } from '../../utils/dom.js';

const CSS = `.blur-hint { color: var(--color-text-secondary); font-size: var(--text-caption); }`;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const point = (p) => [Math.round(p.x * 10000) / 10000, Math.round(p.y * 10000) / 10000];

export function BlurPanel(api) {
  injectStyle('panel-blur', CSS);
  let layer = api.selected();
  if (!layer || layer.type !== 'blur') {
    layer = newBlurLayer();
    api.addLayer(layer);
  }
  const id = layer.id;
  const L = () => api.recipe.layers.find((l) => l.id === id);
  const set = (patch) => { if (L()) api.change(() => Object.assign(L(), patch)); };
  const W = () => api.recipe.canvas.width;
  const H = () => api.recipe.canvas.height;

  // Brush settings live in the panel; each stroke remembers its own size
  let brushSize = 0.08;
  let erasing = false;
  let stroke = null;
  let pending = null;
  let travelled = 0;
  let handle = -1;

  const modes = chipRow(
    [{ value: 'brush', label: 'Brush' }, { value: 'rect', label: 'Rectangle' }, { value: 'ellipse', label: 'Ellipse' }],
    layer.shape,
    (v) => { set({ shape: v }); paint(); }
  );
  const strength = Slider({ label: 'Blur strength', min: 1, max: 100, step: 1, value: layer.strength, resetValue: 60, format: (v) => v + '%', onInput(v) { set({ strength: v }); } });
  const feather = Slider({ label: 'Soft edge', min: 0, max: 100, step: 1, value: layer.feather, resetValue: 20, format: (v) => v + '%', onInput(v) { set({ feather: v }); } });

  // Brush options
  const size = Slider({ label: 'Brush size', min: 1, max: 30, step: 1, value: Math.round(brushSize * 100), resetValue: 8, format: (v) => v + '%', onInput(v) { brushSize = v / 100; } });
  const erase = Toggle({ label: 'Erase mode', checked: false, onChange(v) { erasing = v; } });
  const undoStroke = Button({
    label: 'Undo last stroke', variant: 'secondary', small: true,
    onClick() { const l = L(); if (l && l.strokes.length) api.change(() => { l.strokes.pop(); }); },
  });
  const brushBox = h('div', { class: 'stack' }, size.el, erase.el, undoStroke,
    h('p', { class: 'blur-hint' }, 'Drag on the photo to paint the area to blur. Pinch to zoom in for detail.'));

  // Rectangle and ellipse options
  const lock = Toggle({
    label: 'Perfect circle or square', checked: layer.lock,
    onChange(v) {
      set({ lock: v });
      if (v && L()) {
        const l = L();
        const s = Math.min((l.w * W() + l.h * H()) / 2, 1.5 * Math.min(W(), H()));
        api.change(() => { l.w = s / W(); l.h = s / H(); });
      }
    },
  });
  const shapeBox = h('div', { class: 'stack' }, lock.el,
    h('p', { class: 'blur-hint' }, 'Drag to move. Drag a corner dot to reshape it into any oval or rectangle, or switch on the lock for a perfect circle or square. Pinch to resize.'));

  function paint() {
    const l = L();
    if (!l) return;
    brushBox.hidden = l.shape !== 'brush';
    shapeBox.hidden = l.shape === 'brush';
    api.refresh();
  }

  function addStroke(p) {
    const l = L();
    stroke = { size: brushSize, erase: erasing, pts: [point(p)] };
    api.change(() => { l.strokes.push(stroke); });
  }

  const gestures = {
    down(e) {
      const l = L();
      stroke = null;
      travelled = 0;
      handle = -1;
      pending = null;
      if (!l) return;
      const pos = { x: e.clientX, y: e.clientY };
      if (l.shape === 'brush') { if (e.isPrimary !== false) pending = pos; return; }
      handle = hitCorner(api.stageRect(), l, pos);
    },
    drag(dx, dy, e) {
      const l = L();
      if (!l) return true;
      const rect = api.stageRect();
      const here = toCanvasFraction(rect, { x: e.clientX, y: e.clientY });
      if (l.shape === 'brush') {
        if (!stroke) addStroke(toCanvasFraction(rect, pending || { x: e.clientX, y: e.clientY }));
        travelled += Math.hypot(dx, dy);
        if (travelled >= 3) {
          travelled = 0;
          api.change(() => { stroke.pts.push(point(here)); });
        }
        return true;
      }
      if (handle >= 0) {
        const { wPx, hPx } = ovalSize(here.x - l.cx, here.y - l.cy, W(), H(), l.lock, 1.5 * W(), 1.5 * H());
        api.change(() => { l.w = wPx / W(); l.h = hPx / H(); });
        return true;
      }
      api.change(() => { l.cx = clamp(l.cx + dx / rect.width, 0, 1); l.cy = clamp(l.cy + dy / rect.height, 0, 1); });
      return true;
    },
    pinch(ratio) {
      const l = L();
      if (!l || l.shape === 'brush') return false; // zoom the view while painting
      api.change(() => { l.w = clamp(l.w * ratio, 0.02, 1.5); l.h = clamp(l.h * ratio, 0.02, 1.5); });
      return true;
    },
    // A tap with the brush paints a dot. Taps never change the selection while this tool is open.
    tap(pos) {
      const l = L();
      if (l && l.shape === 'brush') addStroke(toCanvasFraction(api.stageRect(), pos));
      stroke = null;
      return true;
    },
    doubleTap(pos) { return gestures.tap(pos); },
    end() { stroke = null; pending = null; handle = -1; travelled = 0; },
  };

  const el = h('div', { class: 'stack' }, modes.el, strength.el, feather.el, brushBox, shapeBox);
  paint();

  return {
    title: 'Blur',
    el,
    gestures,
    // The box with corner dots for rectangle and ellipse areas
    overlay() {
      const l = L();
      if (!l || l.shape === 'brush') return [];
      return [{ kind: l.shape === 'ellipse' ? 'ellipse' : 'rect', cx: l.cx, cy: l.cy, w: l.w, h: l.h, rot: 0, handles: true }];
    },
    // Leaving with nothing painted removes the empty layer
    onClose() {
      const l = L();
      if (l && l.shape === 'brush' && !l.strokes.some((s) => !s.erase)) api.removeLayer(id);
    },
  };
}

