// js/editor/panels/mask.js

import { Slider } from '../../components/Slider.js';
import { Toggle } from '../../components/Toggle.js';
import { chipRow } from '../panels-ui.js';
import { h, injectStyle } from '../../utils/dom.js';

const CSS = `.mask-hint { color: var(--color-text-secondary); font-size: var(--text-caption); }`;

export function MaskPanel(api) {
  injectStyle('panel-mask', CSS);
  const photo = () => api.photoLayer();
  const current = photo().mask ? photo().mask.shape : 'off';

  const feather = Slider({
    label: 'Soft edge', min: 0, max: 100, step: 1, value: photo().mask ? photo().mask.feather : 20, resetValue: 20,
    format: (v) => v + '%',
    onInput(v) { api.change(() => { if (photo().mask) photo().mask.feather = v; }); },
  });
  const invert = Toggle({
    label: 'Apply outside the shape', checked: photo().mask ? photo().mask.invert : false,
    onChange(v) { api.change(() => { if (photo().mask) photo().mask.invert = v; }); },
  });

  function setShape(value) {
    api.change(() => {
      const p = photo();
      if (value === 'off') { p.mask = null; return; }
      if (!p.mask) p.mask = { shape: value, cx: 0.5, cy: 0.5, rx: 0.3, ry: 0.3, feather: feather.input.value * 1, invert: false };
      else p.mask.shape = value;
    });
    api.refresh();
  }

  const el = h('div', { class: 'stack' },
    chipRow([{ value: 'off', label: 'Off' }, { value: 'rect', label: 'Rectangle' }, { value: 'ellipse', label: 'Ellipse' }], current, setShape).el,
    feather.el, invert.el,
    h('p', { class: 'mask-hint' }, 'Adjustments and filters apply only inside the shape. Drag to move it, pinch to resize it. Turn on "outside" to keep the shape in its original color.')
  );
  return { title: 'Mask', el };
}
