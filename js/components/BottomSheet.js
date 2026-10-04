// js/components/BottomSheet.js

import { IconButton } from './IconButton.js';
import { injectStyle } from '../utils/dom.js';

const CSS = `
.sheet-scrim { position: fixed; inset: 0; z-index: var(--z-sheet-scrim); background: var(--color-overlay); opacity: 0; transition: opacity var(--transition-normal); }
.sheet-scrim--in { opacity: 1; }
.sheet { position: fixed; left: 0; right: 0; bottom: 0; z-index: var(--z-sheet); display: flex; flex-direction: column; width: 100%;
  max-width: var(--content-max); max-height: var(--sheet-max-h); margin-inline: auto; padding-bottom: var(--safe-bottom);
  background: var(--color-surface); color: var(--color-text); border-radius: var(--radius-xl) var(--radius-xl) 0 0;
  box-shadow: var(--shadow-sheet); transform: translateY(100%); transition: transform var(--transition-slow); }
.sheet--in { transform: translateY(0); }
.sheet--tall { max-height: 88dvh; }
.sheet__handle { flex: none; width: var(--sheet-handle-w); height: 4px; margin: var(--space-2) auto 0; border-radius: var(--radius-pill); background: var(--color-border-strong); }
.sheet__head { display: flex; flex: none; align-items: center; min-height: 48px; padding: 0 var(--space-2) 0 var(--space-4); }
.sheet__title { flex: 1; min-width: 0; font-size: var(--text-h2); font-weight: var(--weight-semibold); }
.sheet__body { overflow-y: auto; overscroll-behavior: contain; padding: var(--space-2) var(--space-4) var(--space-4); }`;

const openSheets = new Set();
let listening = false;

export function closeAllSheets() {
  Array.from(openSheets).forEach((close) => close());
}

// body: a DOM node. Returns { el, body, close }.
export function openSheet({ title = '', body, tall = false, onClose } = {}) {
  injectStyle('bottom-sheet', CSS);
  if (!listening) { listening = true; window.addEventListener('hashchange', closeAllSheets); }
  const previousFocus = document.activeElement;
  const titleId = 'sheet-title-' + Math.random().toString(36).slice(2, 8);
  const scrim = document.createElement('div');
  scrim.className = 'sheet-scrim';
  const sheet = document.createElement('section');
  sheet.className = 'sheet' + (tall ? ' sheet--tall' : '');
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.setAttribute('aria-labelledby', titleId);
  sheet.tabIndex = -1;
  const handle = document.createElement('div');
  handle.className = 'sheet__handle';
  const head = document.createElement('div');
  head.className = 'sheet__head';
  const heading = document.createElement('h2');
  heading.className = 'sheet__title truncate';
  heading.id = titleId;
  heading.textContent = title;
  const bodyWrap = document.createElement('div');
  bodyWrap.className = 'sheet__body';
  if (body) bodyWrap.append(body);
  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    openSheets.delete(close);
    document.removeEventListener('keydown', onKey);
    scrim.classList.remove('sheet-scrim--in');
    sheet.classList.remove('sheet--in');
    setTimeout(() => { scrim.remove(); sheet.remove(); }, 320);
    if (previousFocus && previousFocus.focus && document.contains(previousFocus)) previousFocus.focus({ preventScroll: true });
    if (onClose) onClose();
  }
  function onKey(e) {
    if (Array.from(openSheets).pop() !== close) return;
    if (e.key === 'Escape') { close(); return; }
    if (e.key === 'Tab') {
      const focusable = sheet.querySelectorAll('button:not(:disabled), input:not(:disabled), [href], select, textarea, [tabindex]:not([tabindex="-1"])');
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }
  head.append(heading, IconButton({ icon: 'close', label: 'Close', onClick: close }));
  sheet.append(handle, head, bodyWrap);
  scrim.addEventListener('click', close);
  document.body.append(scrim, sheet);
  openSheets.add(close);
  document.addEventListener('keydown', onKey);
  requestAnimationFrame(() => requestAnimationFrame(() => {
    scrim.classList.add('sheet-scrim--in');
    sheet.classList.add('sheet--in');
    sheet.focus({ preventScroll: true });
  }));
  return { el: sheet, body: bodyWrap, close };
}
