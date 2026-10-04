// js/components/SearchField.js

import { icon } from '../icons.js';
import { IconButton } from './IconButton.js';
import { injectStyle } from '../utils/dom.js';

const CSS = `
.search { display: flex; align-items: center; gap: var(--space-2); min-height: var(--tap-target); padding-left: var(--space-3);
  border: 1px solid var(--color-border); border-radius: var(--radius-md); background: var(--color-surface-2);
  transition: border-color var(--transition-fast), box-shadow var(--transition-fast); }
.search:focus-within { border-color: var(--color-accent); box-shadow: 0 0 0 3px var(--color-accent-soft); }
.search__icon { color: var(--color-text-muted); }
.search__input { flex: 1; min-width: 0; height: var(--tap-target); padding: 0; border: 0; outline: none; background: transparent;
  color: var(--color-text); font-size: 16px; }
.search__input::placeholder { color: var(--color-text-muted); }`;

export function SearchField({ placeholder = 'Search', label = 'Search', onInput } = {}) {
  injectStyle('search-field', CSS);
  const el = document.createElement('div');
  el.className = 'search';
  el.insertAdjacentHTML('beforeend', icon('search', 'search__icon'));
  const input = document.createElement('input');
  input.className = 'search__input';
  input.type = 'text';
  input.inputMode = 'search';
  input.enterKeyHint = 'search';
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.placeholder = placeholder;
  input.setAttribute('aria-label', label);
  const clear = IconButton({
    icon: 'close', label: 'Clear search',
    onClick: () => { input.value = ''; sync(); fire(); input.focus(); },
  });
  clear.hidden = true;
  function sync() { clear.hidden = !input.value; }
  function fire() { if (onInput) onInput(input.value); }
  input.addEventListener('input', () => { sync(); fire(); });
  el.append(input, clear);
  return { el, input };
}
