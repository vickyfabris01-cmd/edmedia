// js/components/TopBar.js

import { IconButton } from './IconButton.js';
import { injectStyle } from '../utils/dom.js';

const CSS = `
.top-bar__title { flex: 1; min-width: 0; font-size: var(--text-h2); font-weight: var(--weight-semibold); line-height: var(--leading-tight); }
.top-bar__title--large { font-size: var(--text-h1); font-weight: var(--weight-bold); }
.top-bar__title--flush { padding-left: var(--space-2); }
.top-bar__actions { display: flex; align-items: center; gap: var(--space-1); flex: none; }`;

// large: bigger left-aligned title for tab pages. actions: array of elements on the right.
export function TopBar({ title, onBack, large = false, actions = [] } = {}) {
  injectStyle('top-bar', CSS);
  const bar = document.createElement('header');
  bar.className = 'bar-top top-bar';
  if (onBack) bar.append(IconButton({ icon: 'back', label: 'Back', onClick: onBack }));
  const heading = document.createElement('h1');
  heading.className = 'top-bar__title truncate' + (large ? ' top-bar__title--large' : '') + (onBack ? '' : ' top-bar__title--flush');
  heading.textContent = title || '';
  bar.append(heading);
  if (actions.length) {
    const group = document.createElement('div');
    group.className = 'top-bar__actions';
    group.append(...actions);
    bar.append(group);
  }
  return bar;
}
