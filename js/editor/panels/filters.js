// js/editor/panels/filters.js

import { Slider } from '../../components/Slider.js';
import { Button } from '../../components/Button.js';
import { openNameSheet } from '../../components/NameSheet.js';
import { PRESETS, mergeValues } from '../../engine/filters.js';
import { applyPixelOps } from '../../engine/pixels.js';
import { createCanvas, sourceSize } from '../../engine/canvas.js';
import { listPresets, addPreset, deletePreset } from '../../store/presets.js';
import { h, injectStyle } from '../../utils/dom.js';

const CSS = `
.fstrip { display: flex; gap: var(--space-2); overflow-x: auto; scrollbar-width: none; padding: 2px; }
.fstrip::-webkit-scrollbar { display: none; }
.fcard { display: flex; flex-direction: column; align-items: center; gap: 4px; flex: none; width: 72px; }
.fcard__img { width: 72px; height: 72px; border-radius: var(--radius-md); border: 2px solid transparent; overflow: hidden; background: var(--color-surface-3); }
.fcard__img canvas { width: 100%; height: 100%; display: block; }
.fcard[aria-pressed="true"] .fcard__img { border-color: var(--color-accent); }
.fcard__name { max-width: 72px; font-size: var(--text-tiny); font-weight: var(--weight-semibold); color: var(--color-text-secondary); text-align: center; }
.fcard[aria-pressed="true"] .fcard__name { color: var(--color-accent); }
.filters-actions { display: flex; gap: var(--space-2); }`;

function smallPhoto(img) {
  const size = 72;
  const c = createCanvas(size, size);
  const { w, h: hh } = sourceSize(img);
  const s = Math.max(size / w, size / hh);
  c.getContext('2d').drawImage(img, (size - w * s) / 2, (size - hh * s) / 2, w * s, hh * s);
  return c;
}

export function FiltersPanel(api) {
  injectStyle('panel-filters', CSS);
  const photo = () => api.photoLayer();
  const strip = h('div', { class: 'fstrip' });
  const cards = new Map();
  let userPresets = [];

  const intensity = Slider({
    label: 'Intensity', min: 0, max: 100, step: 1, value: Math.round((photo().filter.intensity ?? 1) * 100), resetValue: 100,
    format: (v) => v + '%',
    onInput(v) { api.change(() => { photo().filter.intensity = v / 100; }); },
  });

  function mark() {
    const current = photo().filter.preset;
    cards.forEach((card, id) => card.setAttribute('aria-pressed', String(id === current)));
    deleteBtn.hidden = !String(current).startsWith('user:');
  }

  function addCard(id, label, values) {
    const card = h('button', { type: 'button', class: 'fcard', 'aria-label': label });
    const box = h('div', { class: 'fcard__img' });
    card.append(box, h('div', { class: 'fcard__name truncate' }, label));
    card.addEventListener('click', () => {
      api.change(() => {
        const p = photo();
        p.filter = id.startsWith('user:') ? { preset: id, intensity: 1, values } : { preset: id, intensity: 1 };
        if (id.startsWith('user:')) p.adjust = {};
      });
      intensity.setValue(100);
      mark();
    });
    cards.set(id, card);
    strip.append(card);
    // Preview thumbnails are drawn one at a time so the panel opens instantly
    setTimeout(() => {
      if (!api.sources.photo) return;
      const c = smallPhoto(api.sources.photo);
      const ctx = c.getContext('2d');
      const data = ctx.getImageData(0, 0, c.width, c.height);
      applyPixelOps(data, mergeValues({}, { preset: id, intensity: 1, values }));
      ctx.putImageData(data, 0, 0);
      box.append(c);
    }, 20 * cards.size);
  }

  PRESETS.forEach((p) => addCard(p.id, p.label, p.values));

  const deleteBtn = Button({
    label: 'Delete this look', variant: 'danger', small: true, hidden: true,
    async onClick() {
      const id = String(photo().filter.preset).slice(5);
      try { await deletePreset(id); } catch (err) { console.error(err); }
      api.change(() => { photo().filter = { preset: 'original', intensity: 1 }; });
      const card = cards.get('user:' + id);
      if (card) { card.remove(); cards.delete('user:' + id); }
      userPresets = userPresets.filter((p) => p.id !== id);
      mark();
    },
  });
  deleteBtn.hidden = true;

  const saveBtn = Button({
    label: 'Save as look', variant: 'secondary', small: true,
    async onClick() {
      const name = await openNameSheet({ title: 'Save look', label: 'Look name', confirmLabel: 'Save', templates: userPresets });
      if (!name) return;
      const values = mergeValues(photo().adjust, photo().filter);
      try {
        const preset = await addPreset(name, values);
        userPresets.unshift(preset);
        addCard('user:' + preset.id, preset.name, preset.values);
        api.change(() => { photo().filter = { preset: 'user:' + preset.id, intensity: 1, values: preset.values }; photo().adjust = {}; });
        intensity.setValue(100);
        mark();
      } catch (err) {
        console.error(err);
        api.toast(err && err.message === 'name-taken' ? 'That name is already taken.' : 'Could not save this look.', 'danger');
      }
    },
  });

  listPresets().then((list) => {
    userPresets = list;
    list.slice().reverse().forEach((p) => addCard('user:' + p.id, p.name, p.values));
    mark();
  }).catch((err) => console.warn('Could not load saved looks', err));

  mark();
  return { title: 'Filters', el: h('div', { class: 'stack' }, strip, intensity.el, h('div', { class: 'filters-actions' }, saveBtn, deleteBtn)) };
}
