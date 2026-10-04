// js/components/SegmentedControl.js

import { injectStyle } from '../utils/dom.js';

const CSS = `
.seg { display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; gap: var(--space-1); padding: var(--space-1);
  border: 1px solid var(--color-border); border-radius: var(--radius-md); background: var(--color-surface-2); }
.seg__item { min-height: 40px; padding: 0 var(--space-2); border: 1px solid transparent; border-radius: var(--radius-sm);
  color: var(--color-text-secondary); font-size: var(--text-body); font-weight: var(--weight-semibold);
  transition: background-color var(--transition-fast), color var(--transition-fast); }
.seg__item[aria-checked="true"] { background: var(--color-accent-soft); border-color: var(--color-accent); color: var(--color-accent); }`;

// options: [{ value, label }]. Returns { el, setValue }.
export function SegmentedControl({ options, value, onChange, ariaLabel } = {}) {
  injectStyle('segmented-control', CSS);
  const el = document.createElement('div');
  el.className = 'seg';
  el.setAttribute('role', 'radiogroup');
  if (ariaLabel) el.setAttribute('aria-label', ariaLabel);
  const items = new Map();
  let current = value;
  function mark() {
    items.forEach((btn, key) => {
      const on = key === current;
      btn.setAttribute('aria-checked', String(on));
      btn.tabIndex = on ? 0 : -1;
    });
  }
  function select(next, notify) {
    if (next === current) return;
    current = next;
    mark();
    if (notify && onChange) onChange(next);
  }
  options.forEach((opt, index) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'seg__item';
    btn.setAttribute('role', 'radio');
    btn.textContent = opt.label;
    btn.addEventListener('click', () => select(opt.value, true));
    btn.addEventListener('keydown', (e) => {
      let target = null;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') target = options[(index + 1) % options.length];
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') target = options[(index - 1 + options.length) % options.length];
      if (!target) return;
      e.preventDefault();
      select(target.value, true);
      items.get(target.value).focus();
    });
    items.set(opt.value, btn);
    el.append(btn);
  });
  mark();
  return { el, setValue(next) { select(next, false); } };
}
