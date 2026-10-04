// js/components/StatusHint.js

import { icon } from '../icons.js';
import { injectStyle } from '../utils/dom.js';

const CSS = `
.status-hint { display: flex; align-items: center; gap: var(--space-1); min-height: 20px; font-size: var(--text-caption);
  font-weight: var(--weight-medium); color: var(--color-text-secondary); }
.status-hint--success { color: var(--color-success); }
.status-hint--danger { color: var(--color-danger); }`;

// kind: 'success' | 'danger' | 'neutral'. Empty text hides the hint.
// Success and danger also carry an icon, so state is not shown by color alone.
export function StatusHint() {
  injectStyle('status-hint', CSS);
  const el = document.createElement('p');
  el.className = 'status-hint';
  el.setAttribute('role', 'status');
  el.hidden = true;
  function set(kind, text) {
    if (!text) { el.hidden = true; el.className = 'status-hint'; el.replaceChildren(); return; }
    el.className = 'status-hint status-hint--' + kind;
    el.innerHTML = kind === 'success' ? icon('check', 'icon--sm') : kind === 'danger' ? icon('close', 'icon--sm') : '';
    const span = document.createElement('span');
    span.textContent = text;
    el.append(span);
    el.hidden = false;
  }
  return { el, set };
}
