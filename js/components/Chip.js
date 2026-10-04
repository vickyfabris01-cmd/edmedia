// js/components/Chip.js

import { injectStyle } from '../utils/dom.js';

const CSS = `
.chip { position: relative; display: inline-flex; align-items: center; height: 36px; padding: 0 var(--space-4);
  border: 1px solid var(--color-border); border-radius: var(--radius-pill); background: var(--color-surface-2);
  color: var(--color-text-secondary); font-size: var(--text-caption); font-weight: var(--weight-semibold); white-space: nowrap;
  transition: background-color var(--transition-fast), color var(--transition-fast); }
.chip::after { content: ""; position: absolute; inset: -4px -2px; }
.chip[aria-pressed="true"] { background: var(--gradient-accent); border-color: transparent; color: var(--color-on-accent); }`;

export function Chip({ label, selected = false, onClick } = {}) {
  injectStyle('chip', CSS);
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'chip';
  el.textContent = label;
  el.setAttribute('aria-pressed', String(selected));
  if (onClick) el.addEventListener('click', onClick);
  return el;
}

export function setChipSelected(el, value) {
  el.setAttribute('aria-pressed', String(value));
}
