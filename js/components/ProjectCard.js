// js/components/ProjectCard.js

import { IconButton } from './IconButton.js';
import { formatRelative } from '../utils/format.js';
import { injectStyle } from '../utils/dom.js';

const CSS = `
.pcard { display: flex; align-items: center; gap: var(--space-1); padding: var(--space-2) var(--space-1) var(--space-2) var(--space-2);
  border: 1px solid var(--color-border); border-radius: var(--radius-lg); background: var(--color-surface); }
.pcard__open { display: flex; flex: 1; align-items: center; gap: var(--space-3); min-width: 0; min-height: 56px; text-align: left; }
.pcard__thumb { flex: none; width: 56px; height: 56px; overflow: hidden; border-radius: var(--radius-md); background: var(--color-surface-3); }
.pcard__thumb img { width: 100%; height: 100%; object-fit: cover; }
.pcard__text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.pcard__name { font-size: var(--text-body); font-weight: var(--weight-semibold); }
.pcard__line { color: var(--color-text-secondary); font-size: var(--text-caption); font-weight: var(--weight-medium); }`;

// Returns { el, dispose }. Call dispose when the card is removed (frees the thumbnail URL).
export function ProjectCard({ project, onOpen, onMore } = {}) {
  injectStyle('project-card', CSS);
  const el = document.createElement('article');
  el.className = 'pcard';
  const open = document.createElement('button');
  open.type = 'button';
  open.className = 'pcard__open';
  if (onOpen) open.addEventListener('click', () => onOpen(project));
  const thumb = document.createElement('div');
  thumb.className = 'pcard__thumb';
  let url = null;
  if (project.thumbnail instanceof Blob) {
    url = URL.createObjectURL(project.thumbnail);
    const img = document.createElement('img');
    img.alt = '';
    img.decoding = 'async';
    img.src = url;
    thumb.append(img);
  }
  const text = document.createElement('div');
  text.className = 'pcard__text';
  const name = document.createElement('div');
  name.className = 'pcard__name truncate';
  name.textContent = project.name;
  text.append(name);
  if (project.templateName) {
    const based = document.createElement('div');
    based.className = 'pcard__line truncate';
    based.textContent = 'Based on: ' + project.templateName;
    text.append(based);
  }
  const edited = document.createElement('div');
  edited.className = 'pcard__line';
  edited.textContent = 'Edited ' + formatRelative(project.updatedAt);
  text.append(edited);
  open.append(thumb, text);
  const more = IconButton({ icon: 'more', label: 'More actions for ' + project.name, onClick: () => { if (onMore) onMore(project); } });
  el.append(open, more);
  return { el, dispose() { if (url) URL.revokeObjectURL(url); } };
}
