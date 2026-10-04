// js/components/EmptyState.js

import { injectStyle } from '../utils/dom.js';

const CSS = `
.empty { display: flex; flex-direction: column; align-items: center; gap: var(--space-2); padding: var(--space-8) var(--space-4); text-align: center; }
.empty__title { font-size: var(--text-h2); font-weight: var(--weight-semibold); }
.empty__text { max-width: 30ch; color: var(--color-text-secondary); }`;

export function EmptyState({ title, text, action } = {}) {
  injectStyle('empty-state', CSS);
  const el = document.createElement('div');
  el.className = 'empty';
  const heading = document.createElement('h2');
  heading.className = 'empty__title';
  heading.textContent = title || '';
  el.append(heading);
  if (text) {
    const p = document.createElement('p');
    p.className = 'empty__text';
    p.textContent = text;
    el.append(p);
  }
  if (action) el.append(action);
  return el;
}
