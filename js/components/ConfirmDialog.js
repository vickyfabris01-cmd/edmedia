// js/components/ConfirmDialog.js

import { Button } from './Button.js';
import { injectStyle } from '../utils/dom.js';

const CSS = `
.dialog-scrim { position: fixed; inset: 0; z-index: var(--z-dialog); display: grid; place-items: center; padding: var(--space-4); background: var(--color-overlay); }
.dialog { width: 100%; max-width: 340px; padding: var(--space-5); border-radius: var(--radius-xl); background: var(--color-surface); color: var(--color-text); box-shadow: var(--shadow-raised); text-align: center; }
.dialog__title { font-size: var(--text-h2); font-weight: var(--weight-semibold); }
.dialog__text { margin-top: var(--space-2); color: var(--color-text-secondary); }
.dialog__actions { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-2); margin-top: var(--space-5); }`;

// Resolves true when confirmed, false when cancelled or dismissed.
export function confirmDialog({ title, text = '', confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = false } = {}) {
  injectStyle('confirm-dialog', CSS);
  return new Promise((resolve) => {
    const previousFocus = document.activeElement;
    const titleId = 'dialog-title-' + Math.random().toString(36).slice(2, 8);
    const scrim = document.createElement('div');
    scrim.className = 'dialog-scrim';
    const box = document.createElement('div');
    box.className = 'dialog';
    box.setAttribute('role', 'alertdialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-labelledby', titleId);
    const heading = document.createElement('h2');
    heading.className = 'dialog__title';
    heading.id = titleId;
    heading.textContent = title;
    box.append(heading);
    if (text) {
      const p = document.createElement('p');
      p.className = 'dialog__text';
      p.textContent = text;
      box.append(p);
    }
    function finish(value) {
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('hashchange', onHash);
      scrim.remove();
      if (previousFocus && previousFocus.focus && document.contains(previousFocus)) previousFocus.focus({ preventScroll: true });
      resolve(value);
    }
    function onKey(e) { if (e.key === 'Escape') finish(false); }
    function onHash() { finish(false); }
    const cancel = Button({ label: cancelLabel, variant: 'secondary', onClick: () => finish(false) });
    const confirm = Button({ label: confirmLabel, variant: danger ? 'danger-solid' : 'primary', onClick: () => finish(true) });
    const actions = document.createElement('div');
    actions.className = 'dialog__actions';
    actions.append(cancel, confirm);
    box.append(actions);
    scrim.addEventListener('click', (e) => { if (e.target === scrim) finish(false); });
    scrim.append(box);
    document.body.append(scrim);
    document.addEventListener('keydown', onKey);
    window.addEventListener('hashchange', onHash);
    // Destructive dialogs start on Cancel so a stray tap cannot delete anything
    (danger ? cancel : confirm).focus();
  });
}
