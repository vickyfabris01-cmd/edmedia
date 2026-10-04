// js/components/ColorField.js

import { injectStyle } from '../utils/dom.js';

const CSS = `
.color { display: flex; flex-direction: column; gap: 2px; }
.color__label { font-size: var(--text-caption); font-weight: var(--weight-semibold); color: var(--color-text-secondary); }
.color__row { display: flex; align-items: center; gap: 0; overflow-x: auto; scrollbar-width: none; }
.color__row::-webkit-scrollbar { display: none; }
.color__swatch { position: relative; flex: none; width: 44px; height: 44px; display: grid; place-items: center; }
.color__dot { width: 28px; height: 28px; border-radius: 50%; border: 2px solid var(--color-border-strong); background: var(--c, #fff); }
.color__swatch[aria-pressed="true"] .color__dot { border-color: var(--color-accent); box-shadow: 0 0 0 2px var(--color-surface), 0 0 0 4px var(--color-accent); }
.color__none { background: linear-gradient(135deg, transparent 45%, var(--color-danger) 45%, var(--color-danger) 55%, transparent 55%), var(--color-surface-2); }
.color__custom input { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer; }
.color__custom .color__dot { background: conic-gradient(#f87171, #fbbf24, #4ade80, #22d3ee, #818cf8, #f472b6, #f87171); }`;

const SWATCHES = ['#ffffff', '#000000', '#4ade80', '#16a34a', '#fde047', '#f97316', '#ef4444', '#3b82f6', '#a855f7'];

// value is a hex color, or '' for none when allowNone is set. Returns { el, setValue }.
export function ColorField({ label, value = '#ffffff', onChange, allowNone = false } = {}) {
  injectStyle('color-field', CSS);
  const el = document.createElement('div');
  el.className = 'color';
  const labelEl = document.createElement('span');
  labelEl.className = 'color__label';
  labelEl.textContent = label;
  const row = document.createElement('div');
  row.className = 'color__row';
  const buttons = new Map();
  let current = value;

  function mark() {
    buttons.forEach((btn, key) => btn.setAttribute('aria-pressed', String(key === current)));
  }
  function pick(v) {
    current = v;
    mark();
    if (onChange) onChange(v);
  }
  function add(key, name, dotClass) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'color__swatch';
    btn.setAttribute('aria-label', name);
    const dot = document.createElement('span');
    dot.className = 'color__dot' + (dotClass ? ' ' + dotClass : '');
    if (key) dot.style.setProperty('--c', key);
    btn.append(dot);
    btn.addEventListener('click', () => pick(key));
    buttons.set(key, btn);
    row.append(btn);
  }
  if (allowNone) add('', 'No color', 'color__none');
  SWATCHES.forEach((c) => add(c, c));

  const custom = document.createElement('label');
  custom.className = 'color__swatch color__custom';
  custom.setAttribute('aria-label', 'Custom color');
  const input = document.createElement('input');
  input.type = 'color';
  input.value = /^#[0-9a-f]{6}$/i.test(value) ? value : '#ffffff';
  input.addEventListener('input', () => pick(input.value));
  const dot = document.createElement('span');
  dot.className = 'color__dot';
  custom.append(input, dot);
  row.append(custom);

  mark();
  el.append(labelEl, row);
  return {
    el,
    setValue(v) {
      current = v;
      if (/^#[0-9a-f]{6}$/i.test(v)) input.value = v;
      mark();
    },
  };
}
