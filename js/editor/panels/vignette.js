// js/editor/panels/vignette.js

import { Slider } from '../../components/Slider.js';
import { Toggle } from '../../components/Toggle.js';
import { Button } from '../../components/Button.js';
import { tabs } from '../panels-ui.js';
import { h } from '../../utils/dom.js';

const DEFAULTS = { strength: 60, amount: 50, soft: 60, round: 50, x: 0, y: 0, light: false };

// Darkens (or lightens) the edges of the photo.
//  Strength: how dark the edges get.   Amount: how far the effect reaches in from the edges.
//  Softness: how gradual the change is. Roundness: follow the photo's shape or a circle.
//  Horizontal / Vertical: move the centre of the effect.
export function VignettePanel(api) {
  const photo = () => api.photoLayer();

  // A vignette set with the Adjust tool in an earlier version is taken over here, so there is one place to change it
  api.change(() => {
    const p = photo();
    if (p.vignette) return;
    const old = p.adjust.vignette || 0;
    if (old > 0.5) {
      p.vignette = { strength: Math.min(90, Math.round(old * 0.85)), amount: 68, soft: 100, round: 100, x: 0, y: 0, light: false };
      p.adjust.vignette = 0;
    } else {
      p.vignette = { ...DEFAULTS };
    }
  });

  const get = (key) => {
    const v = photo().vignette;
    return v && v[key] != null ? v[key] : DEFAULTS[key];
  };
  const set = (key, value) => api.change(() => {
    const p = photo();
    if (!p.vignette) p.vignette = { ...DEFAULTS };
    p.vignette[key] = value;
  });
  const pct = (v) => v + '%';
  const signed = (v) => (v > 0 ? '+' + v : String(v));

  const sliders = {
    strength: Slider({ label: 'Strength', min: 0, max: 100, step: 1, value: get('strength'), resetValue: DEFAULTS.strength, format: pct, onInput: (v) => set('strength', v) }),
    amount: Slider({ label: 'Amount', min: 0, max: 100, step: 1, value: get('amount'), resetValue: DEFAULTS.amount, format: pct, onInput: (v) => set('amount', v) }),
    soft: Slider({ label: 'Softness', min: 0, max: 100, step: 1, value: get('soft'), resetValue: DEFAULTS.soft, format: pct, onInput: (v) => set('soft', v) }),
    round: Slider({ label: 'Roundness', min: 0, max: 100, step: 1, value: get('round'), resetValue: DEFAULTS.round, format: pct, onInput: (v) => set('round', v) }),
    x: Slider({ label: 'Move left or right', min: -100, max: 100, step: 1, value: get('x'), resetValue: 0, format: signed, onInput: (v) => set('x', v) }),
    y: Slider({ label: 'Move up or down', min: -100, max: 100, step: 1, value: get('y'), resetValue: 0, format: signed, onInput: (v) => set('y', v) }),
  };
  const light = Toggle({ label: 'Light edges (white instead of dark)', checked: !!get('light'), onChange: (v) => set('light', v) });

  const main = h('div', { class: 'stack stack--tight' }, sliders.strength.el, sliders.amount.el, sliders.soft.el);
  const shape = h('div', { class: 'stack stack--tight' }, sliders.round.el, sliders.x.el, sliders.y.el);
  const t = tabs([{ id: 'main', label: 'Main', el: main }, { id: 'shape', label: 'Shape', el: shape }], 'main');

  const reset = Button({
    label: 'Reset', variant: 'secondary', small: true,
    onClick() {
      api.change(() => { photo().vignette = { ...DEFAULTS }; });
      Object.keys(sliders).forEach((k) => sliders[k].setValue(DEFAULTS[k]));
      light.setChecked(false);
    },
  });
  const remove = Button({
    label: 'Remove vignette', variant: 'secondary', small: true,
    onClick() {
      api.change(() => { delete photo().vignette; photo().adjust.vignette = 0; });
      api.toast('Vignette removed');
    },
  });

  return {
    title: 'Vignette',
    el: h('div', { class: 'stack' }, t.el, light.el, h('div', { class: 'row' }, reset, remove)),
  };
}