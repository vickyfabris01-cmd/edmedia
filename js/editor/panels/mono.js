// js/editor/panels/mono.js

import { Slider } from '../../components/Slider.js';
import { Toggle } from '../../components/Toggle.js';
import { Button } from '../../components/Button.js';
import { newMonoLayer } from '../../engine/recipe.js';
import { renderRecipe } from '../../engine/render.js';
import { createCanvas } from '../../engine/canvas.js';
import {
  maskSize, packMask, unpackMask, resampleMask, paintDisk, paintLine, smartDab,
  mergeMask, refineProbability, isEmptyMask,
} from '../../engine/maskops.js';
import { segmentPerson, closeSegmenter } from '../../engine/segment.js';
import { chipRow } from '../panels-ui.js';
import { hitCorner, toCanvasFraction, ovalSize } from '../handles.js';
import { h, injectStyle } from '../../utils/dom.js';

const CSS = `.mono-hint { color: var(--color-text-secondary); font-size: var(--text-caption); }
.mono-label { color: var(--color-text-secondary); font-size: var(--text-caption); font-weight: var(--weight-semibold); }`;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// Selective black and white: pick part of the photo, then turn that part (or everything else) black and white.
// Ways to pick: smart brush (stops at edges), brush, select person (automatic), rectangle, ellipse.
export function MonoPanel(api) {
  injectStyle('panel-mono', CSS);
  let layer = api.selected();
  if (!layer || layer.type !== 'mono') {
    layer = newMonoLayer();
    api.addLayer(layer);
  }
  const id = layer.id;
  const L = () => api.recipe.layers.find((l) => l.id === id);
  const W = () => api.recipe.canvas.width;
  const H = () => api.recipe.canvas.height;
  const set = (patch) => { if (L()) api.change(() => Object.assign(L(), patch)); };
  const grid = () => maskSize(W(), H());

  let mode = layer.shape === 'rect' || layer.shape === 'ellipse' ? layer.shape : 'smart';
  let brushSize = 0.07; // brush width as a fraction of the canvas width
  let sensitivity = 50;
  let erasing = false;
  let showSel = true;
  let work = null; // the selection while editing: one 0-255 value per grid cell
  let changed = false;
  let undo = []; // earlier saved selections, newest last
  let under = null; // the picture below this layer, at selection-grid size
  let stroking = false;
  let last = null;
  let lastPt = null;
  let pending = null;
  let handle = -1;
  let busy = false;
  let closed = false;

  const isPaint = (m) => m === 'smart' || m === 'brush';

  // ---------- The selection ----------
  function publish() {
    const l = L();
    const g = grid();
    if (!l || !work) return;
    // Hidden from saving and copying; the drawing code reads it so strokes show instantly
    Object.defineProperty(l, '_live', { value: { w: g.w, h: g.h, data: work }, enumerable: false, writable: true, configurable: true });
  }
  function ensureWork() {
    const g = grid();
    const l = L();
    if (work && work.length === g.w * g.h) return;
    work = l && l.mask && l.mask.rle ? resampleMask(unpackMask(l.mask), l.mask.w, l.mask.h, g.w, g.h) : new Uint8Array(g.w * g.h);
    publish();
  }
  // Saves the selection into the layer (this is what gets stored and exported)
  function commit() {
    const l = L();
    if (!l || !work) return;
    const g = grid();
    const packed = isEmptyMask(work) ? null : packMask(work, g.w, g.h);
    api.change(() => { l.mask = packed; });
    changed = false;
  }
  function pushUndo() {
    const l = L();
    undo.push(l && l.mask ? l.mask : null);
    if (undo.length > 25) undo.shift();
  }

  // The photo as it looks right below this layer: the smart brush follows its edges and the person detector looks at it
  function getUnder() {
    const g = grid();
    if (under && under.w === g.w && under.h === g.h) return under;
    const tmp = createCanvas(1, 1);
    renderRecipe(tmp, api.recipe, api.sources, { scale: g.w / W(), untilLayerId: id });
    const canvas = createCanvas(g.w, g.h);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(tmp, 0, 0, g.w, g.h);
    under = { w: g.w, h: g.h, canvas, data: ctx.getImageData(0, 0, g.w, g.h).data };
    return under;
  }

  // ---------- Painting ----------
  function radius() { return Math.max(1, (brushSize * grid().w) / 2); }
  function dabAt(gx, gy) {
    const g = grid();
    if (mode === 'smart') smartDab(work, g.w, g.h, getUnder().data, gx, gy, radius(), erasing, sensitivity);
    else paintDisk(work, g.w, g.h, gx, gy, radius(), erasing);
  }
  function paintTo(frac, first) {
    const g = grid();
    const gx = frac.x * g.w;
    const gy = frac.y * g.h;
    api.change(() => {
      if (first || !last) dabAt(gx, gy);
      else paintLine(dabAt, last.x, last.y, gx, gy, radius());
    });
    last = { x: gx, y: gy };
    lastPt = frac;
    changed = true;
  }
  function beginStroke() {
    if (stroking) return;
    ensureWork();
    pushUndo();
    stroking = true;
    last = null;
  }
  function endStroke() {
    if (!stroking) return;
    stroking = false;
    last = null;
    commit();
  }

  // ---------- Person detection ----------
  async function detectPerson() {
    if (busy) return;
    busy = true;
    personBtn.disabled = true;
    status('Looking for people. The first time can take a few seconds.');
    try {
      ensureWork();
      const u = getUnder();
      const res = await segmentPerson(u.canvas);
      if (closed) return;
      const g = grid();
      const alpha = res.w === g.w && res.h === g.h ? res.alpha : resampleMask(res.alpha, res.w, res.h, g.w, g.h);
      const found = refineProbability(alpha);
      if (isEmptyMask(found, 60)) {
        status('No person found. Try the smart brush instead.');
        api.toast('No person found in this photo.', 'danger');
        return;
      }
      pushUndo();
      api.change(() => { mergeMask(work, found, false); });
      commit();
      status('Person selected. Use the smart brush or brush to fix the edges.');
    } catch (err) {
      status('');
      api.toast((err && err.message) || 'Could not find the person.', 'danger');
    } finally {
      busy = false;
      personBtn.disabled = false;
    }
  }

  // ---------- Controls ----------
  const modes = chipRow(
    [
      { value: 'smart', label: 'Smart brush' }, { value: 'brush', label: 'Brush' }, { value: 'person', label: 'Person' },
      { value: 'rect', label: 'Rectangle' }, { value: 'ellipse', label: 'Ellipse' },
    ],
    mode,
    (v) => setMode(v)
  );
  const target = chipRow(
    [{ value: 'inside', label: 'Selected area' }, { value: 'outside', label: 'Everything else' }],
    layer.target,
    (v) => set({ target: v })
  );
  const amount = Slider({ label: 'Black and white', min: 0, max: 100, step: 1, value: layer.amount, resetValue: 100, format: (v) => v + '%', onInput(v) { set({ amount: v }); } });
  const feather = Slider({ label: 'Soft edge', min: 0, max: 100, step: 1, value: layer.feather, resetValue: 20, format: (v) => v + '%', onInput(v) { set({ feather: v }); } });
  const boost = Slider({ label: 'Make the rest more vivid', min: 0, max: 100, step: 1, value: layer.boost, resetValue: 0, format: (v) => v + '%', onInput(v) { set({ boost: v }); } });
  const showToggle = Toggle({ label: 'Show selection in red', checked: showSel, onChange(v) { showSel = v; api.render(); } });

  // Brush options
  const size = Slider({ label: 'Brush size', min: 1, max: 30, step: 1, value: Math.round(brushSize * 100), resetValue: 7, format: (v) => v + '%', onInput(v) { brushSize = v / 100; } });
  const sens = Slider({ label: 'Edge sensitivity', min: 0, max: 100, step: 1, value: sensitivity, resetValue: 50, format: (v) => v + '%', onInput(v) { sensitivity = v; } });
  const erase = Toggle({ label: 'Erase mode', checked: false, onChange(v) { erasing = v; } });
  function undoLast() {
    const l = L();
    if (!l || !undo.length) return;
    const prev = undo.pop();
    const g = grid();
    work = prev && prev.rle ? resampleMask(unpackMask(prev), prev.w, prev.h, g.w, g.h) : new Uint8Array(g.w * g.h);
    publish();
    api.change(() => { l.mask = prev || null; });
    changed = false;
  }
  function clearAll() {
    ensureWork();
    if (isEmptyMask(work)) return;
    pushUndo();
    api.change(() => { work.fill(0); });
    commit();
  }
  // The same two buttons appear for the brushes and for Person, so each gets its own copy
  const editButtons = () => h('div', { class: 'row' },
    Button({ label: 'Undo last step', variant: 'secondary', small: true, onClick: undoLast }),
    Button({ label: 'Clear selection', variant: 'secondary', small: true, onClick: clearAll }));
  const hint = h('p', { class: 'mono-hint' });
  const brushBox = h('div', { class: 'stack' }, size.el, sens.el, erase.el, editButtons(), hint);

  // Person options
  const personBtn = Button({ label: 'Select person', variant: 'primary', full: true, onClick: detectPerson });
  const statusEl = h('p', { class: 'mono-hint' }, 'Finds the people in the photo for you. It works on the phone and nothing is uploaded.');
  function status(text) { statusEl.textContent = text; }
  const personBox = h('div', { class: 'stack' }, personBtn, statusEl, editButtons());

  // Rectangle and ellipse options
  const lock = Toggle({
    label: 'Perfect circle or square', checked: layer.lock,
    onChange(v) {
      set({ lock: v });
      const l = L();
      if (v && l) {
        const s = Math.min((l.w * W() + l.h * H()) / 2, 1.5 * Math.min(W(), H()));
        api.change(() => { l.w = s / W(); l.h = s / H(); });
      }
    },
  });
  const shapeBox = h('div', { class: 'stack' }, lock.el,
    h('p', { class: 'mono-hint' }, 'Drag to move. Drag a corner dot to reshape it. Pinch to resize.'));

  function syncUi() {
    brushBox.hidden = !isPaint(mode);
    sens.el.hidden = mode !== 'smart';
    personBox.hidden = mode !== 'person';
    shapeBox.hidden = !(mode === 'rect' || mode === 'ellipse');
    hint.textContent = mode === 'smart'
      ? 'Paint over the object. The brush stops at edges, so it follows the outline. Pinch to zoom in for detail.'
      : 'Paint over the area you want. Pinch to zoom in for detail.';
    api.refresh();
  }
  function setMode(m) {
    mode = m;
    if (m === 'rect' || m === 'ellipse') set({ shape: m });
    else { set({ shape: 'mask' }); ensureWork(); }
    modes.set(m);
    syncUi();
  }

  // ---------- Gestures ----------
  const gestures = {
    down(e) {
      const l = L();
      stroking = false;
      handle = -1;
      pending = null;
      if (!l) return;
      const pos = { x: e.clientX, y: e.clientY };
      if (isPaint(mode)) { if (e.isPrimary !== false) pending = pos; return; }
      if (mode === 'rect' || mode === 'ellipse') handle = hitCorner(api.stageRect(), l, pos);
    },
    drag(dx, dy, e) {
      const l = L();
      if (!l) return true;
      const rect = api.stageRect();
      const here = toCanvasFraction(rect, { x: e.clientX, y: e.clientY });
      if (isPaint(mode)) {
        if (!stroking) {
          beginStroke();
          paintTo(toCanvasFraction(rect, pending || { x: e.clientX, y: e.clientY }), true);
        }
        paintTo(here, false);
        return true;
      }
      if (mode === 'person') return false; // move around the zoomed photo
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
      if (!l || isPaint(mode) || mode === 'person') return false; // zoom the view
      api.change(() => { l.w = clamp(l.w * ratio, 0.02, 1.5); l.h = clamp(l.h * ratio, 0.02, 1.5); });
      return true;
    },
    // A tap with a brush paints one dot. Taps never change the selected layer while this tool is open.
    tap(pos) {
      if (isPaint(mode)) {
        beginStroke();
        paintTo(toCanvasFraction(api.stageRect(), pos), true);
        endStroke();
      }
      return true;
    },
    doubleTap(pos) { return gestures.tap(pos); },
    end() {
      endStroke();
      pending = null;
      handle = -1;
    },
  };

  // ---------- Start ----------
  if (isPaint(mode)) ensureWork();
  syncUi();

  const el = h('div', { class: 'stack' },
    modes.el, brushBox, personBox, shapeBox,
    h('div', { class: 'mono-label' }, 'Turn black and white'), target.el,
    amount.el, feather.el, boost.el, showToggle.el);

  return {
    title: 'Selective B&W',
    el,
    gestures,
    selectionPreview: () => (showSel ? id : null),
    // A dashed box for rectangle and ellipse, and a ring showing the brush size where you last touched
    overlay() {
      const l = L();
      if (!l) return [];
      if (mode === 'rect' || mode === 'ellipse') {
        return [{ kind: mode === 'ellipse' ? 'ellipse' : 'rect', cx: l.cx, cy: l.cy, w: l.w, h: l.h, rot: 0, handles: true }];
      }
      if (isPaint(mode) && lastPt) {
        return [{ kind: 'ellipse', cx: lastPt.x, cy: lastPt.y, w: brushSize, h: (brushSize * W()) / H(), rot: 0 }];
      }
      return [];
    },
    onClose() {
      closed = true;
      closeSegmenter();
      const l = L();
      if (!l) return;
      if (changed) commit();
      delete l._live;
      // Leaving with nothing selected removes the empty layer
      if (l.shape === 'mask' && !(l.mask && l.mask.rle)) api.removeLayer(id);
    },
  };
}