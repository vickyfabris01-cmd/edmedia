// js/components/IconButton.js

import { icon } from '../icons.js';
import { injectStyle } from '../utils/dom.js';

const CSS = `
.icon-btn { display: inline-grid; place-items: center; flex: none; width: var(--tap-target); height: var(--tap-target);
  border-radius: var(--radius-pill); color: inherit; transition: background-color var(--transition-fast), opacity var(--transition-fast); }
.icon-btn:active:not(:disabled) { background: var(--color-accent-soft); }
.icon-btn:disabled { opacity: 0.35; }
.icon-btn[aria-pressed="true"] { background: var(--color-accent-soft); color: var(--color-accent); }
@media (hover: hover) { .icon-btn:hover:not(:disabled) { background: var(--color-surface-2); } }`;

// label is required: it becomes the accessible name of the icon-only button.
// pressed: true/false makes it a toggle (aria-pressed); leave undefined for a plain button.
export function IconButton({ icon: iconName, label, onClick, pressed, disabled = false, iconClass = '' } = {}) {
  injectStyle('icon-button', CSS);
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'icon-btn';
  el.disabled = disabled;
  el.setAttribute('aria-label', label);
  el.title = label;
  el.innerHTML = icon(iconName, iconClass);
  if (pressed !== undefined) el.setAttribute('aria-pressed', String(pressed));
  if (onClick) el.addEventListener('click', onClick);
  return el;
}

export function setPressed(el, value) {
  el.setAttribute('aria-pressed', String(value));
}
