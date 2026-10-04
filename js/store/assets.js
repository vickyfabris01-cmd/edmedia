// js/store/assets.js

import { dbGet, dbGetAll, dbPut } from './db.js';
import { newId } from '../utils/ids.js';
import { nameKey, checkName } from '../utils/naming.js';
import { createCanvas, canvasToBlob, loadBitmap, sourceSize } from '../engine/canvas.js';

const MAX_SIDE = 1024;

export async function listAssets() {
  const all = await dbGetAll('assets');
  return all.filter((a) => !a.deleted).sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getAsset(id) {
  return dbGet('assets', id);
}

// Downscales large logos and keeps transparency (PNG).
export async function addAsset(file, name) {
  const bitmap = await loadBitmap(file);
  const { w, h } = sourceSize(bitmap);
  const scale = Math.min(1, MAX_SIDE / Math.max(w, h));
  const canvas = createCanvas(w * scale, h * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  if (bitmap.close) bitmap.close();
  const blob = await canvasToBlob(canvas, 'image/png');

  const all = await dbGetAll('assets');
  let finalName = name;
  let n = 2;
  while (checkName(finalName, all) !== 'available') finalName = name + ' ' + n++;

  const now = Date.now();
  const asset = {
    id: newId(), name: finalName, nameKey: nameKey(finalName), blob,
    width: canvas.width, height: canvas.height, createdAt: now, updatedAt: now, deleted: false,
  };
  await dbPut('assets', asset);
  return asset;
}

export async function renameAsset(id, name) {
  const all = await dbGetAll('assets');
  const current = all.find((a) => a.id === id && !a.deleted);
  if (!current) throw new Error('not-found');
  if (checkName(name, all, id) !== 'available') throw new Error('name-taken');
  const updated = { ...current, name, nameKey: nameKey(name), updatedAt: Date.now() };
  await dbPut('assets', updated);
  return updated;
}

export async function deleteAsset(id) {
  const current = await dbGet('assets', id);
  if (!current) return;
  await dbPut('assets', { ...current, deleted: true, updatedAt: Date.now() });
}
