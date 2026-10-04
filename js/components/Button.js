// js/components/Button.js

import { icon } from '../icons.js';
import { injectStyle } from '../utils/dom.js';

const CSS = `
.btn { display: inline-flex; align-items: center; justify-content: center; gap: var(--space-2); min-height: var(--tap-target);
  padding: 0 var(--space-4); border: 1px solid transparent; border-radius: var(--radius-md); font-size: var(--text-body);
  font-weight: var(--weight-semibold); line-height: 1; white-space: nowrap; -webkit-user-select: none; user-select: none;
  transition: transform var(--transition-fast), opacity var(--transition-fast), background-color var(--transition-fast); }
.btn:active:not(:disabled) { transform: scale(0.98); }
.btn:disabled { opacity: 0.45; }
.btn--full { width: 100%; }
.btn--small { min-height: 36px; padding: 0 var(--space-3); font-size: var(--text-caption); }
.btn--primary { background: var(--gradient-accent); color: var(--color-on-accent); }
.btn--secondary { background: var(--color-surface-2); border-color: var(--color-border-strong); color: var(--color-text); }
.btn--ghost { background: transparent; color: var(--color-accent); }
.btn--danger { background: transparent; border-color: var(--color-danger); color: var(--color-danger); }
.btn--danger-solid { background: var(--color-danger); color: #ffffff; }
@media (hover: hover) {
  .btn--secondary:hover:not(:disabled) { background: var(--color-surface-3); }
  .btn--ghost:hover:not(:disabled) { background: var(--color-accent-soft); }
  .btn--danger:hover:not(:disabled) { background: var(--color-danger-soft); }
}`;

// variant: primary | secondary | ghost | danger | danger-solid
export function Button({ label, variant = 'secondary', icon: iconName, onClick, type = 'button', disabled = false, full = false, small = false, ariaLabel } = {}) {
  injectStyle('button', CSS);
  const el = document.createElement('button');
  el.type = type;
  el.className = 'btn btn--' + variant + (full ? ' btn--full' : '') + (small ? ' btn--small' : '');
  el.disabled = disabled;
  if (ariaLabel) el.setAttribute('aria-label', ariaLabel);
  if (iconName) el.insertAdjacentHTML('beforeend', icon(iconName));
  if (label) {
    const text = document.createElement('span');
    text.textContent = label;
    el.append(text);
  }
  if (onClick) el.addEventListener('click', onClick);
  return el;
}
