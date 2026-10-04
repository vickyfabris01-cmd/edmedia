// js/components/UploadBox.js

import { icon } from '../icons.js';
import { injectStyle } from '../utils/dom.js';

const CSS = `
.upload__btn { display: flex; align-items: center; gap: var(--space-3); width: 100%; min-height: 56px; padding: var(--space-2) var(--space-3);
  border: 1.5px dashed var(--color-border-strong); border-radius: var(--radius-lg); background: var(--color-surface); text-align: left;
  transition: border-color var(--transition-fast), background-color var(--transition-fast); }
.upload__btn:active { background: var(--color-surface-2); }
.upload__icon { display: grid; place-items: center; flex: none; width: 36px; height: 36px; border-radius: var(--radius-pill);
  background: var(--color-accent-soft); color: var(--color-accent); }
.upload__text { display: flex; flex-direction: column; min-width: 0; }
.upload__title { font-size: var(--text-body); font-weight: var(--weight-semibold); }
.upload__hint { font-size: var(--text-caption); color: var(--color-text-muted); }
.upload--drag .upload__btn { border-color: var(--color-accent); background: var(--color-accent-soft); }`;

// Tap to choose a photo. Drag and drop works too (mostly a desktop extra).
export function UploadBox({ onFile, onReject } = {}) {
  injectStyle('upload-box', CSS);
  const box = document.createElement('div');
  box.className = 'upload';
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.hidden = true;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'upload__btn';
  button.innerHTML =
    '<span class="upload__icon">' + icon('upload') + '</span><span class="upload__text">' +
    '<span class="upload__title">Upload image to edit</span><span class="upload__hint">Tap to choose</span></span>';
  function accept(file) {
    if (!file) return;
    if (!file.type || !file.type.startsWith('image/')) { if (onReject) onReject('Choose an image file.'); return; }
    if (onFile) onFile(file);
  }
  button.addEventListener('click', () => input.click());
  input.addEventListener('change', () => { const file = input.files && input.files[0]; input.value = ''; accept(file); });
  box.addEventListener('dragover', (e) => { e.preventDefault(); box.classList.add('upload--drag'); });
  box.addEventListener('dragleave', () => box.classList.remove('upload--drag'));
  box.addEventListener('drop', (e) => {
    e.preventDefault();
    box.classList.remove('upload--drag');
    accept(e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]);
  });
  box.append(input, button);
  return box;
}
