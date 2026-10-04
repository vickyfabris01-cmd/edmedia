// js/editor/panels/mask.js

import { Slider } from '../../components/Slider.js';
import { Toggle } from '../../components/Toggle.js';
import { chipRow } from '../panels-ui.js';
import { hitCorner, toCanvasFraction, ovalSize } from '../handles.js';
import { h, injectStyle } from '../../utils/dom.js';

const CSS = `.mask-hint { color: var(--color-text-secondary); font-size: var(--text-caption); }`;

export function MaskPanel(api) {
  injectStyle('panel-mask', CSS);
  const photo = () => api.photoLayer();
  const current = photo().mask ? photo().mask.shape : 'off';
  let handle = -1;

  // The mask is stored as fractions of the photo slot; this is the same box as fractions of the canvas
  function maskBox() {
    const s = api.recipe.slot;
    const m = photo().mask;
    return { cx: s.x + m.cx * s.w, cy: s.y + m.cy * s.h, w: m.rx * 2 * s.w, h: m.ry * 2 * s.h };
  }

  const feather = Slider({
    label: 'Soft edge', min: 0, max: 100, step: 1, value: photo().mask ? photo().mask.feather : 20, resetValue: 20,
    format: (v) => v + '%',
    onInput(v) { api.change(() => { if (photo().mask) photo().mask.feather = v; }); },
  });
  const invert = Toggle({
    label: 'Apply outside the shape', checked: photo().mask ? photo().mask.invert : false,
    onChange(v) { api.change(() => { if (photo().mask) photo().mask.invert = v; }); },
  });
  const lock = Toggle({
    label: 'Perfect circle or square', checked: photo().mask ? !!photo().mask.lock : false,
    onChange(v) {
      api.change(() => {
        const m = photo().mask;
        if (!m) return;
        m.lock = v;
        if (!v) return;
        const s = api.recipe.slot;
        const wPx = s.w * api.recipe.canvas.width;
        const hPx = s.h * api.recipe.canvas.height;
        const r = Math.min(((m.rx * wPx + m.ry * hPx) / 2), wPx, hPx);
        m.rx = r / wPx;
        m.ry = r / hPx;
      });
    },
  });

  function setShape(value) {
    api.change(() => {
      const p = photo();
      if (value === 'off') { p.mask = null; return; }
      if (!p.mask) p.mask = { shape: value, cx: 0.5, cy: 0.5, rx: 0.3, ry: 0.3, feather: feather.input.value * 1, invert: false, lock: false };
      else p.mask.shape = value;
    });
    lock.setChecked(photo().mask ? !!photo().mask.lock : false);
    api.refresh();
  }

  const gestures = {
    down(e) {
      handle = photo().mask ? hitCorner(api.stageRect(), maskBox(), { x: e.clientX, y: e.clientY }) : -1;
    },
    // Dragging a corner dot reshapes the mask. Anything else falls through to move it.
    drag(dx, dy, e) {
      const m = photo().mask;
      if (handle < 0 || !m) return false;
      const s = api.recipe.slot;
      const W = api.recipe.canvas.width;
      const H = api.recipe.canvas.height;
      const box = maskBox();
      const p = toCanvasFraction(api.stageRect(), { x: e.clientX, y: e.clientY });
      const { wPx, hPx } = ovalSize(p.x - box.cx, p.y - box.cy, W, H, m.lock, 2 * s.w * W, 2 * s.h * H);
      api.change(() => { m.rx = wPx / 2 / (s.w * W); m.ry = hPx / 2 / (s.h * H); });
      return true;
    },
    end() { handle = -1; },
  };

  const el = h('div', { class: 'stack' },
    chipRow([{ value: 'off', label: 'Off' }, { value: 'rect', label: 'Rectangle' }, { value: 'ellipse', label: 'Ellipse' }], current, setShape).el,
    feather.el, invert.el, lock.el,
    h('p', { class: 'mask-hint' }, 'Adjustments and filters apply only inside the shape. Drag to move it. Drag a corner dot to reshape it into any oval or rectangle, or switch on the lock for a perfect circle or square. Pinch to resize. Turn on "outside" to keep the shape in its original color.')
  );
  return { title: 'Mask', el, gestures };
}