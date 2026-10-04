// js/components/SettingsGroup.js

import { injectStyle } from '../utils/dom.js';

const CSS = `
.sgroup__title { padding: 0 var(--space-1) var(--space-2); color: var(--color-text-secondary); font-size: var(--text-caption);
  font-weight: var(--weight-semibold); letter-spacing: 0.02em; }
.sgroup__card { overflow: hidden; border: 1px solid var(--color-border); border-radius: var(--radius-lg); background: var(--color-surface); }
.sgroup__card > * + * { border-top: 1px solid var(--color-border); }
.sgroup__pad { padding: var(--space-4); }`;

// items: array of DOM elements. padded: true gives free-form content its own padding.
export function SettingsGroup({ title, items = [], padded = false } = {}) {
  injectStyle('settings-group', CSS);
  const el = document.createElement('section');
  if (title) {
    const heading = document.createElement('h2');
    heading.className = 'sgroup__title';
    heading.textContent = title;
    el.append(heading);
  }
  const card = document.createElement('div');
  card.className = 'sgroup__card' + (padded ? ' sgroup__pad' : '');
  card.append(...items);
  el.append(card);
  return el;
}
