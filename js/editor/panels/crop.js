// js/editor/panels/crop.js

import { Slider } from '../../components/Slider.js';
import { Button } from '../../components/Button.js';
import { IconButton } from '../../components/IconButton.js';
import { fixPhotoPosition } from '../../engine/render.js';
import { MAX_SIDE } from '../../engine/recipe.js';
import { chipRow } from '../panels-ui.js';
import { h, injectStyle } from '../../utils/dom.js';

const CSS = `.crop-actions { display: flex; align-items: center; gap: var(--space-2); }
.crop-hint { color: var(--color-text-secondary); font-size: var(--text-caption); }`;

const ASPECTS = [
  { value: 'orig', label: 'Original' }, { value: '1', label: '1:1' }, { value: '0.8', label: '4:5' },
  { value: '0.75', label: '3:4' }, { value: '1.7778', label: '16:9' }, { value: '0.5625', label: '9:16' },
];

export function CropPanel(api) {
  injectStyle('panel-crop', CSS);
  const photo = () => api.photoLayer();

  function refit(r) { fixPhotoPosition(r, api.sources.photo); }

  function setAspect(value) {
    api.change((r) => {
      let ratio;
      if (value === 'orig') {
        const s = api.photoSize();
        const swap = photo().rot % 180 !== 0;
        ratio = swap ? s.h / s.w : s.w / s.h;
      } else {
        ratio = Number(value);
      }
      const long = Math.min(MAX_SIDE, Math.max(r.canvas.width, r.canvas.height));
      if (ratio >= 1) { r.canvas.width = Math.round(long); r.canvas.height = Math.round(long / ratio); }
      else { r.canvas.height = Math.round(long); r.canvas.width = Math.round(long * ratio); }
      refit(r);
    });
    sync();
  }

  const zoom = Slider({
    label: 'Zoom', min: 100, max: 400, step: 1, value: Math.round(photo().zoom * 100), resetValue: 100,
    format: (v) => v + '%',
    onInput(v) { api.change((r) => { api.photoLayer().zoom = v / 100; refit(r); }); },
  });
  const straighten = Slider({
    label: 'Straighten', min: -45, max: 45, step: 0.5, value: photo().straighten || 0, resetValue: 0,
    format: (v) => v + '\u00b0',
    onInput(v) { api.change((r) => { api.photoLayer().straighten = v; refit(r); }); },
  });

  function sync() {
    zoom.setValue(Math.round(photo().zoom * 100));
    straighten.setValue(photo().straighten || 0);
  }

  const rotL = IconButton({ icon: 'rotate', label: 'Rotate left', onClick() { api.change((r) => { const p = api.photoLayer(); p.rot = (p.rot + 270) % 360; refit(r); }); } });
  const rotR = IconButton({ icon: 'rotate', iconClass: 'icon--mirror', label: 'Rotate right', onClick() { api.change((r) => { const p = api.photoLayer(); p.rot = (p.rot + 90) % 360; refit(r); }); } });
  const flipH = IconButton({ icon: 'flip', label: 'Flip horizontal', onClick() { api.change(() => { const p = api.photoLayer(); p.flipH = !p.flipH; }); } });
  const flipV = IconButton({ icon: 'flip', iconClass: 'icon--rot90', label: 'Flip vertical', onClick() { api.change(() => { const p = api.photoLayer(); p.flipV = !p.flipV; }); } });
  const reset = Button({ label: 'Reset position', variant: 'secondary', small: true, onClick() { api.change(() => { const p = api.photoLayer(); p.ox = 0; p.oy = 0; p.zoom = 1; }); sync(); } });

  const el = h('div', { class: 'stack' },
    chipRow(ASPECTS, '', setAspect).el,
    h('div', { class: 'crop-actions' }, rotL, rotR, flipH, flipV, h('span', { class: 'fill' }), reset),
    zoom.el, straighten.el,
    h('p', { class: 'crop-hint' }, 'Drag the photo to reposition it. Pinch to zoom. Changing the shape may crop part of the photo.')
  );
  return { title: 'Crop', el };
}
