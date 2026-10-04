// js/editor/panels/layers.js

import { Slider } from '../../components/Slider.js';
import { IconButton } from '../../components/IconButton.js';
import { openActionSheet } from '../../components/ActionSheet.js';
import { layerLabel } from '../../engine/recipe.js';
import { h, injectStyle } from '../../utils/dom.js';

const CSS = `
.lrow { display: flex; align-items: center; border: 1px solid var(--color-border); border-radius: var(--radius-md); background: var(--color-surface-2); }
.lrow[aria-current="true"] { border-color: var(--color-accent); background: var(--color-accent-soft); }
.lrow__name { flex: 1; min-width: 0; min-height: var(--tap-target); padding: 0 var(--space-2); text-align: left; font-size: var(--text-body); font-weight: var(--weight-semibold); }
.lrow__type { display: block; color: var(--color-text-muted); font-size: var(--text-tiny); font-weight: var(--weight-medium); }
.lrow--hidden .lrow__name { opacity: 0.5; }`;

export function LayersPanel(api) {
  injectStyle('panel-layers', CSS);
  const list = h('div', { class: 'stack stack--tight' });
  const opacityHost = h('div', {});

  function render() {
    list.replaceChildren();
    const layers = api.recipe.layers;
    [...layers].reverse().forEach((layer) => {
      const row = h('div', { class: 'lrow' + (layer.visible ? '' : ' lrow--hidden'), 'aria-current': String(api.selected() && api.selected().id === layer.id) });
      const eye = IconButton({
        icon: layer.visible ? 'visible' : 'hidden', label: (layer.visible ? 'Hide ' : 'Show ') + layerLabel(layer),
        onClick() { api.change(() => { layer.visible = !layer.visible; }); render(); },
      });
      const name = h('button', { type: 'button', class: 'lrow__name truncate' }, layerLabel(layer), h('span', { class: 'lrow__type' }, layer.type));
      name.addEventListener('click', () => { api.select(layer.id); render(); });
      const idx = layers.findIndex((l) => l.id === layer.id);
      const up = IconButton({ icon: 'up', label: 'Move up', disabled: idx === layers.length - 1, onClick() { api.moveLayer(layer.id, 1); render(); } });
      const down = IconButton({ icon: 'down', label: 'Move down', disabled: idx === 0, onClick() { api.moveLayer(layer.id, -1); render(); } });
      const more = IconButton({
        icon: 'more', label: 'More actions for ' + layerLabel(layer),
        onClick() {
          const actions = [];
          if (layer.type !== 'photo') {
            actions.push({ label: 'Duplicate', onSelect: () => { api.duplicateLayer(layer.id); render(); } });
            actions.push({ label: 'Delete', danger: true, onSelect: () => { api.removeLayer(layer.id); render(); } });
          } else {
            actions.push({ label: layer.visible ? 'Hide photo' : 'Show photo', onSelect: () => { api.change(() => { layer.visible = !layer.visible; }); render(); } });
          }
          openActionSheet({ title: layerLabel(layer), actions });
        },
      });
      row.append(eye, name, up, down, more);
      list.append(row);
    });
    const sel = api.selected();
    opacityHost.replaceChildren();
    if (sel) {
      opacityHost.append(Slider({
        label: 'Opacity of ' + layerLabel(sel), min: 5, max: 100, step: 1, value: Math.round((sel.opacity ?? 1) * 100), resetValue: 100,
        format: (v) => v + '%', onInput(v) { api.change(() => { sel.opacity = v / 100; }); },
      }).el);
    }
  }
  render();
  return { title: 'Layers', el: h('div', { class: 'stack' }, list, opacityHost) };
}
