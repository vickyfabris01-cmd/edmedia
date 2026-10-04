// js/components/TextField.js

import { StatusHint } from './StatusHint.js';
import { injectStyle } from '../utils/dom.js';

const CSS = `
.field { display: flex; flex-direction: column; gap: var(--space-1); }
.field__label { font-size: var(--text-caption); font-weight: var(--weight-semibold); color: var(--color-text-secondary); }
.field__input { width: 100%; min-height: var(--tap-target); padding: 0 var(--space-3); border: 1px solid var(--color-border); border-radius: var(--radius-md);
  outline: none; background: var(--color-surface-2); color: var(--color-text); font-size: 16px;
  transition: border-color var(--transition-fast), box-shadow var(--transition-fast); }
textarea.field__input { padding: var(--space-3); min-height: 72px; resize: none; line-height: 1.35; }
.field__input:focus { border-color: var(--color-accent); box-shadow: 0 0 0 3px var(--color-accent-soft); }
.field__input::placeholder { color: var(--color-text-muted); }
.field--invalid .field__input { border-color: var(--color-danger); }`;

let counter = 0;

// Returns { el, input, hint, setInvalid }. hint.set(kind, text) shows live status text.
export function TextField({ label, value = '', placeholder = '', maxLength, onInput, type = 'text', autocomplete = 'off', multiline = false } = {}) {
  injectStyle('text-field', CSS);
  counter++;
  const inputId = 'field-' + counter;
  const hintId = 'field-hint-' + counter;
  const el = document.createElement('div');
  el.className = 'field';
  const labelEl = document.createElement('label');
  labelEl.className = 'field__label';
  labelEl.htmlFor = inputId;
  labelEl.textContent = label;
  const input = document.createElement(multiline ? 'textarea' : 'input');
  input.className = 'field__input';
  input.id = inputId;
  if (!multiline) input.type = type;
  input.value = value;
  input.placeholder = placeholder;
  input.autocomplete = autocomplete;
  input.spellcheck = false;
  if (maxLength) input.maxLength = maxLength;
  input.setAttribute('aria-describedby', hintId);
  const hint = StatusHint();
  hint.el.id = hintId;
  function setInvalid(invalid) {
    el.classList.toggle('field--invalid', invalid);
    input.setAttribute('aria-invalid', String(invalid));
  }
  input.addEventListener('input', () => { if (onInput) onInput(input.value); });
  el.append(labelEl, input, hint.el);
  return { el, input, hint, setInvalid };
}
