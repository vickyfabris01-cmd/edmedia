// js/components/Toast.js

import { icon } from '../icons.js';
import { injectStyle } from '../utils/dom.js';

const CSS = `
.toasts { position: fixed; left: var(--space-4); right: var(--space-4); z-index: var(--z-toast); display: flex; flex-direction: column; align-items: center; gap: var(--space-2); pointer-events: none; }
.toast { display: flex; align-items: center; gap: var(--space-3); max-width: 420px; padding: var(--space-3) var(--space-4);
  border: 1px solid #1f3027; border-radius: var(--radius-md); background: #0e1814; color: #f1f7f3; font-size: var(--text-body);
  font-weight: var(--weight-medium); box-shadow: var(--shadow-raised); opacity: 0; transform: translateY(8px);
  transition: opacity var(--transition-normal), transform var(--transition-normal); }
.toast--in { opacity: 1; transform: translateY(0); }
.toast__icon { display: grid; place-items: center; flex: none; width: 24px; height: 24px; border-radius: var(--radius-pill); color: #04210f; }
.toast__icon--success { background: #4ade80; }
.toast__icon--danger { background: #f87171; }`;

let container = null;

function getContainer() {
  if (!container) {
    container = document.createElement('div');
    container.className = 'toasts';
    container.setAttribute('role', 'status');
    container.setAttribute('aria-live', 'polite');
    document.body.append(container);
  }
  return container;
}

// kind: 'success' | 'danger' | 'info'
export function showToast(message, kind = 'success') {
  injectStyle('toast', CSS);
  const host = getContainer();
  const nav = document.getElementById('nav');
  const navVisible = nav && !nav.hidden;
  host.style.bottom = navVisible ? 'calc(var(--nav-h) + var(--safe-bottom) + var(--space-3))' : 'calc(var(--safe-bottom) + var(--space-3))';
  const el = document.createElement('div');
  el.className = 'toast';
  if (kind === 'success' || kind === 'danger') {
    const badge = document.createElement('span');
    badge.className = 'toast__icon toast__icon--' + kind;
    badge.innerHTML = icon(kind === 'success' ? 'check' : 'close', 'icon--sm');
    el.append(badge);
  }
  const text = document.createElement('span');
  text.textContent = message;
  el.append(text);
  host.append(el);
  requestAnimationFrame(() => el.classList.add('toast--in'));
  setTimeout(() => { el.classList.remove('toast--in'); setTimeout(() => el.remove(), 250); }, kind === 'danger' ? 4000 : 2800);
}
