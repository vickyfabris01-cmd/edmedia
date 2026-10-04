// js/store/presets.js

import { dbGet, dbGetAll, dbPut } from './db.js';
import { newId } from '../utils/ids.js';
import { nameKey, checkName } from '../utils/naming.js';

export async function listPresets() {
  const all = await dbGetAll('presets');
  return all.filter((p) => !p.deleted).sort((a, b) => b.updatedAt - a.updatedAt);
}

// values: the combined adjustment values that make up the look.
export async function addPreset(name, values) {
  const all = await dbGetAll('presets');
  if (checkName(name, all) !== 'available') throw new Error('name-taken');
  const now = Date.now();
  const preset = { id: newId(), name, nameKey: nameKey(name), values, createdAt: now, updatedAt: now, deleted: false };
  await dbPut('presets', preset);
  return preset;
}

export async function deletePreset(id) {
  const current = await dbGet('presets', id);
  if (!current) return;
  await dbPut('presets', { ...current, deleted: true, updatedAt: Date.now() });
}
