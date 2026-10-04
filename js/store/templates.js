// js/store/templates.js

import { dbGet, dbGetAll, dbPut } from './db.js';
import { nameKey, checkName } from '../utils/naming.js';
import { newId } from '../utils/ids.js';
import { BUILTIN_TEMPLATES, isBuiltinId } from '../data/builtin-templates.js';
import { makeThumbnailBlob } from '../engine/thumbnail.js';
import { samplePhoto } from '../engine/sample.js';

const builtinThumbs = new Map();

async function builtinWithThumb(def) {
  if (!builtinThumbs.has(def.id)) {
    try {
      builtinThumbs.set(def.id, await makeThumbnailBlob(def.recipe, { photo: samplePhoto(), assets: new Map() }, 360));
    } catch (err) {
      console.warn('Could not draw template preview', def.id, err);
      builtinThumbs.set(def.id, null);
    }
  }
  return { ...def, thumbnail: builtinThumbs.get(def.id) };
}

// Newest first, soft-deleted records hidden.
export async function listUserTemplates() {
  const all = await dbGetAll('templates');
  return all.filter((t) => !t.deleted).sort((a, b) => b.updatedAt - a.updatedAt);
}

// Your templates first, then the built-in ones.
export async function listAllTemplates() {
  const user = await listUserTemplates();
  const builtin = await Promise.all(BUILTIN_TEMPLATES.map(builtinWithThumb));
  return [...user, ...builtin];
}

export async function getTemplate(id) {
  if (isBuiltinId(id)) {
    const def = BUILTIN_TEMPLATES.find((t) => t.id === id);
    return def ? builtinWithThumb(def) : null;
  }
  return dbGet('templates', id);
}

// 'square' | 'portrait' | 'story' | 'wide'
export function ratioGroup(width, height) {
  const r = width / height;
  if (r >= 0.95 && r <= 1.05) return 'square';
  if (r > 1.05) return 'wide';
  if (r < 0.6) return 'story';
  return 'portrait';
}

export function suggestName(base, templates) {
  let candidate = base + ' copy';
  let i = 2;
  while (checkName(candidate, templates) !== 'available') candidate = base + ' copy ' + i++;
  return candidate;
}

// The name rule is re-checked here, so no screen can save a duplicate name.
export async function saveTemplate({ name, recipe, thumbnail }) {
  const all = await listAllTemplates();
  if (checkName(name, all) !== 'available') throw new Error('name-taken');
  const now = Date.now();
  const template = {
    id: newId(), name, nameKey: nameKey(name), width: recipe.canvas.width, height: recipe.canvas.height,
    recipe, thumbnail, createdAt: now, updatedAt: now, deleted: false,
  };
  await dbPut('templates', template);
  return template;
}

export async function renameTemplate(id, name) {
  if (isBuiltinId(id)) throw new Error('builtin');
  const all = await listAllTemplates();
  const current = all.find((t) => t.id === id);
  if (!current) throw new Error('not-found');
  if (checkName(name, all, id) !== 'available') throw new Error('name-taken');
  const updated = { ...current, name, nameKey: nameKey(name), updatedAt: Date.now() };
  await dbPut('templates', updated);
  return updated;
}

export async function duplicateTemplate(id, name) {
  const all = await listAllTemplates();
  const current = all.find((t) => t.id === id);
  if (!current) throw new Error('not-found');
  if (checkName(name, all) !== 'available') throw new Error('name-taken');
  const now = Date.now();
  const copy = structuredClone({ ...current, builtin: undefined });
  delete copy.builtin;
  copy.id = newId();
  copy.name = name;
  copy.nameKey = nameKey(name);
  copy.createdAt = now;
  copy.updatedAt = now;
  copy.deleted = false;
  await dbPut('templates', copy);
  return copy;
}

// Soft delete: the record stays so sync can carry the deletion to other devices.
export async function deleteTemplate(id) {
  if (isBuiltinId(id)) throw new Error('builtin');
  const current = await dbGet('templates', id);
  if (!current) return;
  await dbPut('templates', { ...current, deleted: true, updatedAt: Date.now() });
}
