// js/store/settings.js

import { dbGet, dbPut } from './db.js';

// The theme is not stored here: it must be known before first paint (see utils/theme.js).
const DEFAULTS = { exportFormat: 'jpeg', exportQuality: 0.9, socialPreset: 'none' };

export async function getSetting(key) {
  const record = await dbGet('settings', key);
  return record && record.value !== undefined ? record.value : DEFAULTS[key];
}

export async function setSetting(key, value) {
  await dbPut('settings', { key, value, updatedAt: Date.now(), deleted: false });
}
