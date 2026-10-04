// js/components/ChoiceSheet.js

import { openSheet } from './BottomSheet.js';
import { icon } from '../icons.js';
import { injectStyle } from '../utils/dom.js';

const CSS = `
.choice { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); width: 100%; min-height: var(--tap-target);
  padding: 0 var(--space-3); border-radius: var(--radius-md); color: var(--color-text); font-size: var(--text-body); text-align: left; }
.choice:active { background: var(--color-surface-2); }
.choice[aria-checked="true"] { color: var(--color-accent); font-weight: var(--weight-semibold); }
.choice__tick { width: var(--icon-md); height: var(--icon-md); }`;

// options: [{ value, label }]. Resolves the chosen value, or null when dismissed.
export function openChoiceSheet({ title, options, value } = {}) {
  injectStyle('choice-sheet', CSS);
  return new Promise((resolve) => {
    let settled = false;
    function finish(result) { if (settled) return; settled = true; resolve(result); }
    const body = document.createElement('div');
    body.setAttribute('role', 'radiogroup');
    body.setAttribute('aria-label', title);
    options.forEach((opt) => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'choice';
      row.setAttribute('role', 'radio');
      row.setAttribute('aria-checked', String(opt.value === value));
      const label = document.createElement('span');
      label.textContent = opt.label;
      row.append(label);
      const tick = document.createElement('span');
      tick.className = 'choice__tick';
      if (opt.value === value) tick.innerHTML = icon('check');
      row.append(tick);
      row.addEventListener('click', () => { finish(opt.value); sheet.close(); });
      body.append(row);
    });
    const sheet = openSheet({ title, body, onClose: () => finish(null) });
  });
}
