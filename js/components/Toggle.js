// js/components/Toggle.js

import { injectStyle } from '../utils/dom.js';

const CSS = `
.toggle { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); width: 100%; min-height: var(--tap-target); text-align: left; }
.toggle__label { font-size: var(--text-body); font-weight: var(--weight-medium); }
.toggle__track { position: relative; flex: none; width: 46px; height: 28px; border-radius: 14px; background: var(--color-surface-3);
  border: 1px solid var(--color-border-strong); transition: background-color var(--transition-fast); }
.toggle__knob { position: absolute; top: 2px; left: 2px; width: 22px; height: 22px; border-radius: 50%; background: #fff;
  box-shadow: 0 1px 3px rgba(0,0,0,0.4); transition: transform var(--transition-fast); }
.toggle[aria-checked="true"] .toggle__track { background: var(--color-accent); border-color: var(--color-accent); }
.toggle[aria-checked="true"] .toggle__knob { transform: translateX(18px); }`;

export function Toggle({ label, checked = false, onChange } = {}) {
  injectStyle('toggle', CSS);
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'toggle';
  el.setAttribute('role', 'switch');
  const text = document.createElement('span');
  text.className = 'toggle__label';
  text.textContent = label;
  const track = document.createElement('span');
  track.className = 'toggle__track';
  track.innerHTML = '<span class="toggle__knob"></span>';
  el.append(text, track);
  function set(v) { el.setAttribute('aria-checked', String(!!v)); }
  set(checked);
  el.addEventListener('click', () => {
    const next = el.getAttribute('aria-checked') !== 'true';
    set(next);
    if (onChange) onChange(next);
  });
  return { el, setChecked: set };
}
