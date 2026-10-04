// js/components/SettingsRow.js

import { icon } from '../icons.js';
import { injectStyle } from '../utils/dom.js';

const CSS = `
.srow { display: flex; align-items: center; gap: var(--space-3); width: 100%; min-height: 52px; padding: var(--space-2) var(--space-4);
  color: var(--color-text); font-size: var(--text-body); text-align: left; }
button.srow:active { background: var(--color-surface-2); }
.srow__label { flex: 1; min-width: 0; font-weight: var(--weight-medium); }
.srow__value { max-width: 55%; color: var(--color-text-secondary); font-size: var(--text-body); text-align: right; }
.srow__chevron { color: var(--color-text-muted); }
.srow--danger .srow__label { color: var(--color-danger); }`;

// Rows with onClick are buttons, others are plain information rows. Returns { el, setValue }.
export function SettingsRow({ label, value = '', onClick, danger = false } = {}) {
  injectStyle('settings-row', CSS);
  const el = document.createElement(onClick ? 'button' : 'div');
  el.className = 'srow' + (danger ? ' srow--danger' : '');
  if (onClick) { el.type = 'button'; el.addEventListener('click', onClick); }
  const labelEl = document.createElement('span');
  labelEl.className = 'srow__label truncate';
  labelEl.textContent = label;
  const valueEl = document.createElement('span');
  valueEl.className = 'srow__value truncate';
  valueEl.textContent = value;
  el.append(labelEl, valueEl);
  if (onClick) {
    const chevron = document.createElement('span');
    chevron.className = 'srow__chevron';
    chevron.innerHTML = icon('chevron');
    el.append(chevron);
  }
  return { el, setValue(text) { valueEl.textContent = text; }, setLabel(text) { labelEl.textContent = text; } };
}
