// js/components/TemplateCard.js

import { IconButton } from './IconButton.js';
import { injectStyle } from '../utils/dom.js';
import { formatDimensions } from '../utils/format.js';

const CSS = `
.tcard { position: relative; overflow: hidden; border: 1px solid var(--color-border); border-radius: var(--radius-lg); background: var(--color-surface-2); }
.tcard__open { display: block; position: relative; width: 100%; text-align: left; }
.tcard__media { width: 100%; aspect-ratio: var(--ratio, 1); background: var(--color-surface-3); }
.tcard__media img { width: 100%; height: 100%; object-fit: cover; }
.tcard__meta { position: absolute; inset: auto 0 0 0; display: flex; flex-direction: column; align-items: flex-start; gap: 2px;
  padding: var(--space-6) 52px var(--space-2) var(--space-3); background: var(--color-scrim-bottom); color: #f1f7f3; }
.tcard__name { max-width: 100%; font-size: var(--text-body); font-weight: var(--weight-semibold); }
.tcard__size { max-width: 100%; color: rgba(241,247,243,0.8); font-size: var(--text-tiny); font-weight: var(--weight-medium); }
.tcard__tag { position: absolute; top: var(--space-2); left: var(--space-2); padding: 2px var(--space-2); border-radius: var(--radius-pill);
  background: rgba(0,0,0,0.55); color: #f1f7f3; font-size: var(--text-tiny); font-weight: var(--weight-semibold); }
.tcard__more { position: absolute; right: 0; bottom: 0; color: #f1f7f3; }`;

// Width divided by height of the card picture (kept within a sensible range).
export function cardAspect(template) {
  const ratio = template.width / template.height;
  return Math.min(1.8, Math.max(0.55, ratio || 1));
}

// Returns { el, dispose }. Call dispose when the card is removed (frees the thumbnail URL).
export function TemplateCard({ template, onOpen, onMore } = {}) {
  injectStyle('template-card', CSS);
  const el = document.createElement('article');
  el.className = 'tcard';
  const open = document.createElement('button');
  open.type = 'button';
  open.className = 'tcard__open';
  open.setAttribute('aria-label', 'Open template ' + template.name);
  if (onOpen) open.addEventListener('click', () => onOpen(template));
  const media = document.createElement('div');
  media.className = 'tcard__media';
  media.style.setProperty('--ratio', String(cardAspect(template)));
  let url = null;
  if (template.thumbnail instanceof Blob) {
    url = URL.createObjectURL(template.thumbnail);
    const img = document.createElement('img');
    img.alt = '';
    img.decoding = 'async';
    img.src = url;
    media.append(img);
  }
  const meta = document.createElement('div');
  meta.className = 'tcard__meta';
  const name = document.createElement('div');
  name.className = 'tcard__name truncate';
  name.textContent = template.name;
  const size = document.createElement('div');
  size.className = 'tcard__size truncate';
  size.textContent = formatDimensions(template.width, template.height);
  meta.append(name, size);
  open.append(media, meta);
  if (template.builtin) {
    const tag = document.createElement('span');
    tag.className = 'tcard__tag';
    tag.textContent = 'Built-in';
    open.append(tag);
  }
  const more = IconButton({ icon: 'more', label: 'More actions for ' + template.name, onClick: () => { if (onMore) onMore(template); } });
  more.classList.add('tcard__more');
  el.append(open, more);
  return { el, dispose() { if (url) URL.revokeObjectURL(url); } };
}