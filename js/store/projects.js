// js/store/projects.js

import { dbGet, dbGetAll, dbPut, dbDelete } from './db.js';
import { newId } from '../utils/ids.js';

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

// Project names are free text and may repeat, so no uniqueness check is needed here.
export async function duplicateProject(id) {
  const current = await dbGet('projects', id);
  if (!current || current.deleted) throw new Error('not-found');
  const now = Date.now();
  const copy = structuredClone(current);
  copy.id = newId();
  copy.name = current.name + ' copy';
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
