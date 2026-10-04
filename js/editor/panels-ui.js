// js/editor/panels-ui.js

import { Chip, setChipSelected } from '../components/Chip.js';
import { IconButton } from '../components/IconButton.js';
import { h } from '../utils/dom.js';

// A row of chips where one is selected. Returns { el, set }.
export function chipRow(options, value, onChange) {
  const row = h('div', { class: 'scroll-x', role: 'group' });
  const map = new Map();
  options.forEach((o) => {
    const chip = Chip({
      label: o.label, selected: o.value === value,
      onClick: () => { map.forEach((el, k) => setChipSelected(el, k === o.value)); onChange(o.value); },
    });
    map.set(o.value, chip);
    row.append(chip);
  });
  return { el: row, set(v) { map.forEach((el, k) => setChipSelected(el, k === v)); } };
}

// Chips that swap the content below them. pages: [{ id, label, el }]
export function tabs(pages, initial) {
  const host = h('div', { class: 'stack' });
  const body = h('div', { class: 'stack' });
  const bar = chipRow(pages.map((p) => ({ value: p.id, label: p.label })), initial || pages[0].id, show);
  function show(id) {
    const page = pages.find((p) => p.id === id) || pages[0];
    body.replaceChildren(page.el);
  }
  show(initial || pages[0].id);
  host.append(bar.el, body);
  return { el: host, show(id) { bar.set(id); show(id); } };
}

export function iconToggle({ icon, label, pressed, onClick, iconClass }) {
  return IconButton({ icon, label, pressed, onClick, iconClass });
}

export function group(...kids) {
  return h('div', { class: 'stack' }, ...kids);
}
