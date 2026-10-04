// js/components/Slider.js

import { injectStyle } from '../utils/dom.js';

const CSS = `
.slider { display: flex; flex-direction: column; gap: 2px; }
.slider__head { display: flex; align-items: center; justify-content: space-between; min-height: 28px; }
.slider__label { font-size: var(--text-caption); font-weight: var(--weight-semibold); color: var(--color-text-secondary); }
.slider__value { min-width: 56px; min-height: 28px; padding: 0 var(--space-2); border-radius: var(--radius-sm); text-align: right;
  font-size: var(--text-caption); font-weight: var(--weight-semibold); color: var(--color-text); font-variant-numeric: tabular-nums; }
.slider__input { -webkit-appearance: none; appearance: none; width: 100%; height: 32px; margin: 0; background: transparent; touch-action: pan-y; }
.slider__input::-webkit-slider-runnable-track { height: 6px; border-radius: 3px;
  background: var(--gradient-accent) left / var(--p, 0%) 100% no-repeat, var(--color-surface-3); }
.slider__input::-moz-range-track { height: 6px; border-radius: 3px; background: var(--color-surface-3); }
.slider__input::-moz-range-progress { height: 6px; border-radius: 3px; background: var(--color-accent); }
.slider__input::-webkit-slider-thumb { -webkit-appearance: none; width: 24px; height: 24px; margin-top: -9px; border-radius: 50%;
  background: #fff; border: 2px solid var(--color-accent); box-shadow: 0 1px 4px rgba(0,0,0,0.35); }
.slider__input::-moz-range-thumb { width: 20px; height: 20px; border-radius: 50%; background: #fff; border: 2px solid var(--color-accent); }
.slider__input:disabled { opacity: 0.4; }`;

// Returns { el, input, setValue }. Tap the value to reset to resetValue.
export function Slider({ label, min = 0, max = 100, step = 1, value = 0, resetValue, format, onInput, onChange } = {}) {
  injectStyle('slider', CSS);
  const el = document.createElement('div');
  el.className = 'slider';
  const head = document.createElement('div');
  head.className = 'slider__head';
  const labelEl = document.createElement('span');
  labelEl.className = 'slider__label';
  labelEl.textContent = label;
  const valueEl = document.createElement('button');
  valueEl.type = 'button';
  valueEl.className = 'slider__value';
  valueEl.setAttribute('aria-label', 'Reset ' + label);
  const input = document.createElement('input');
  input.type = 'range';
  input.className = 'slider__input';
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.setAttribute('aria-label', label);
  const fmt = format || ((v) => String(Math.round(v * 100) / 100));
  function paint() {
    const v = Number(input.value);
    input.style.setProperty('--p', ((v - min) / (max - min)) * 100 + '%');
    valueEl.textContent = fmt(v);
  }
  function setValue(v) { input.value = String(v); paint(); }
  input.addEventListener('input', () => { paint(); if (onInput) onInput(Number(input.value)); });
  input.addEventListener('change', () => { if (onChange) onChange(Number(input.value)); });
  valueEl.addEventListener('click', () => {
    if (resetValue === undefined) return;
    setValue(resetValue);
    if (onInput) onInput(resetValue);
    if (onChange) onChange(resetValue);
  });
  head.append(labelEl, valueEl);
  el.append(head, input);
  setValue(value);
  return { el, input, setValue };
}
