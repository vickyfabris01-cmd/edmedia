// js/editor/panels/adjust.js

import { Slider } from '../../components/Slider.js';
import { Button } from '../../components/Button.js';
import { tabs } from '../panels-ui.js';
import { h } from '../../utils/dom.js';

const PAGES = [
  { id: 'light', label: 'Light', items: [['exposure', 'Exposure'], ['brightness', 'Brightness'], ['contrast', 'Contrast'], ['highlights', 'Highlights'], ['shadows', 'Shadows']] },
  { id: 'color', label: 'Color', items: [['saturation', 'Saturation'], ['temperature', 'Temperature'], ['tint', 'Tint'], ['hue', 'Hue', -180, 180]] },
  { id: 'detail', label: 'Detail', items: [['sharpen', 'Sharpen', 0, 100], ['clarity', 'Clarity'], ['blur', 'Blur', 0, 100]] },
  { id: 'effects', label: 'Effects', items: [['grayscale', 'Black and white', 0, 100], ['sepia', 'Sepia', 0, 100], ['invert', 'Invert', 0, 100], ['vignette', 'Vignette', 0, 100]] },
];

export function AdjustPanel(api) {
  const sliders = [];
  const pages = PAGES.map((page) => {
    const list = h('div', { class: 'stack stack--tight' });
    page.items.forEach(([key, label, min = -100, max = 100]) => {
      const slider = Slider({
        label, min, max, step: 1, value: api.photoLayer().adjust[key] || 0, resetValue: 0,
        format: (v) => (v > 0 && min < 0 ? '+' + v : String(v)),
        onInput(v) { api.change(() => { api.photoLayer().adjust[key] = v; }); },
      });
      sliders.push([key, slider]);
      list.append(slider.el);
    });
    return { id: page.id, label: page.label, el: list };
  });
  const t = tabs(pages, 'light');
  const resetAll = Button({
    label: 'Reset all adjustments', variant: 'ghost', small: true,
    onClick() { api.change(() => { api.photoLayer().adjust = {}; }); sliders.forEach(([, s]) => s.setValue(0)); },
  });
  return { title: 'Adjust', el: h('div', { class: 'stack' }, t.el, resetAll) };
}
