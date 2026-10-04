// js/components/BottomNav.js

import { icon } from '../icons.js';
import { injectStyle } from '../utils/dom.js';

const CSS = `
.nav-item { position: relative; display: flex; flex: 1; flex-direction: column; align-items: center; justify-content: center; gap: 2px;
  min-height: var(--tap-target); color: var(--color-text-muted); font-size: var(--text-tiny); font-weight: var(--weight-medium);
  transition: color var(--transition-fast); }
.nav-item[aria-current="page"] { color: var(--color-accent); font-weight: var(--weight-semibold); }
.nav-item[aria-current="page"]::before { content: ""; position: absolute; top: 0; left: 50%; width: 24px; height: 3px; margin-left: -12px;
  border-radius: 0 0 3px 3px; background: var(--color-accent); }`;

const ITEMS = [
  { name: 'templates', label: 'Templates', icon: 'templates', href: '#/' },
  { name: 'projects', label: 'Projects', icon: 'projects', href: '#/projects' },
  { name: 'profile', label: 'Profile', icon: 'profile', href: '#/profile' },
];

// Renders the nav once and returns a function that marks the active item.
export function initBottomNav(nav) {
  injectStyle('bottom-nav', CSS);
  nav.replaceChildren();
  const links = new Map();
  ITEMS.forEach((item) => {
    const link = document.createElement('a');
    link.className = 'nav-item';
    link.href = item.href;
    link.insertAdjacentHTML('beforeend', icon(item.icon));
    const label = document.createElement('span');
    label.textContent = item.label;
    link.append(label);
    nav.append(link);
    links.set(item.name, link);
  });
  return function setActive(name) {
    links.forEach((link, key) => {
      if (key === name) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
  };
}
