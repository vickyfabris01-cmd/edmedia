// js/components/TemplateSheet.js

import { openSheet } from './BottomSheet.js';
import { Button } from './Button.js';
import { formatDate, formatDimensions } from '../utils/format.js';
import { injectStyle } from '../utils/dom.js';

const CSS = `
.tsheet__preview { display: grid; place-items: center; height: 36dvh; border-radius: var(--radius-lg); background: var(--color-surface-3); overflow: hidden; }
.tsheet__preview img { max-width: 100%; max-height: 100%; object-fit: contain; }
.tsheet__name { font-size: var(--text-h2); font-weight: var(--weight-semibold); }
.tsheet__meta { color: var(--color-text-secondary); font-size: var(--text-caption); font-weight: var(--weight-medium); }
.tsheet__origin { margin-top: var(--space-1); font-size: var(--text-tiny); opacity: 0.75; }
.tsheet__row { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-2); }`;

export function openTemplateSheet({ template, onUse, onDuplicate, onRename, onDelete } = {}) {
  injectStyle('template-sheet', CSS);
  const body = document.createElement('div');
  body.className = 'stack';
  const preview = document.createElement('div');
  preview.className = 'tsheet__preview';
  let url = null;
  if (template.thumbnail instanceof Blob) {
    url = URL.createObjectURL(template.thumbnail);
    const img = document.createElement('img');
    img.alt = 'Preview of ' + template.name;
    img.src = url;
    preview.append(img);
  }
  const info = document.createElement('div');
  const name = document.createElement('div');
  name.className = 'tsheet__name';
  name.textContent = template.name;
  const meta = document.createElement('div');
  meta.className = 'tsheet__meta';
  meta.textContent = formatDimensions(template.width, template.height);
  const origin = document.createElement('div');
  origin.className = 'tsheet__meta tsheet__origin';
  origin.textContent = template.builtin ? 'Built-in template' : 'Created ' + formatDate(template.createdAt || template.updatedAt);
  info.append(name, meta, origin);
  function act(callback) { return () => { sheet.close(); if (callback) callback(template); }; }
  body.append(preview, info, Button({ label: 'Use template', variant: 'primary', full: true, onClick: act(onUse) }));
  if (template.builtin) {
    body.append(Button({ label: 'Duplicate as my template', variant: 'secondary', full: true, onClick: act(onDuplicate) }));
  } else {
    const row = document.createElement('div');
    row.className = 'tsheet__row';
    row.append(
      Button({ label: 'Duplicate', variant: 'secondary', onClick: act(onDuplicate) }),
      Button({ label: 'Rename', variant: 'secondary', onClick: act(onRename) })
    );
    body.append(row, Button({ label: 'Delete', variant: 'danger', full: true, onClick: act(onDelete) }));
  }
  const sheet = openSheet({ title: 'Template', body, tall: true, onClose() { if (url) URL.revokeObjectURL(url); } });
  return sheet;
}