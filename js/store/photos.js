// js/store/photos.js

import { dbGet, dbPut, dbDelete } from './db.js';
import { newId } from '../utils/ids.js';

export async function savePhoto(blob, width, height) {
  const id = newId();
  await dbPut('photos', { id, blob, width, height, createdAt: Date.now() });
  return id;
}

export function getPhoto(id) {
  return dbGet('photos', id);
}

export function deletePhoto(id) {
  return dbDelete('photos', id);
}
