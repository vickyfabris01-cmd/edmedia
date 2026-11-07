// js/store/projects.js

import { dbGet, dbGetAll, dbPut, dbDelete } from './db.js';
import { newId } from '../utils/ids.js';
import { nameKey } from '../utils/naming.js';

// Newest first, soft-deleted records hidden.
export async function listProjects() {
  const all = await dbGetAll('projects');
  return all.filter((p) => !p.deleted).sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getProject(id) {
  return dbGet('projects', id);
}

export function saveProject(project) {
  return dbPut('projects', project);
}

// Returns `base` if no live project uses it, otherwise "base 2", "base 3", ...
// Comparison ignores case and extra spaces, matching how template names are checked.
export function uniqueProjectName(base, projects, ignoreId = null) {
  const taken = new Set(
    projects.filter((p) => !p.deleted && p.id !== ignoreId).map((p) => nameKey(p.name))
  );
  if (!taken.has(nameKey(base))) return base;
  let i = 2;
  while (taken.has(nameKey(base + ' ' + i))) i++;
  return base + ' ' + i;
}

export async function duplicateProject(id) {
  const all = await dbGetAll('projects');
  const current = all.find((p) => p.id === id);
  if (!current || current.deleted) throw new Error('not-found');
  const now = Date.now();
  const copy = structuredClone(current);
  copy.id = newId();
  copy.name = uniqueProjectName(current.name + ' copy', all);
  copy.createdAt = now;
  copy.updatedAt = now;
  copy.deleted = false;
  await dbPut('projects', copy);
  return copy;
}

// Soft delete keeps the record. The photo is removed once nothing else uses it.
export async function deleteProject(id) {
  const current = await dbGet('projects', id);
  if (!current) return;
  await dbPut('projects', { ...current, deleted: true, updatedAt: Date.now() });
  if (current.photoId) {
    const all = await dbGetAll('projects');
    const stillUsed = all.some((p) => !p.deleted && p.photoId === current.photoId);
    if (!stillUsed) await dbDelete('photos', current.photoId);
  }
}
