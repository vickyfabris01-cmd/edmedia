// js/sync/sync.js

import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config.js';
import { dbGetAll, dbGet, dbPut } from '../store/db.js';
import { isConfigured, getSession, getAccessToken, onAuthChange } from './auth.js';

// What syncs: templates, brand assets, saved looks, and settings.
// Projects and their photos stay on the device (photos are large).
const STORES = ['templates', 'assets', 'presets', 'settings'];
const PAGE = 500;
const SKEW_MS = 60000;

let state = { status: 'off', at: 0, message: '' };
const listeners = new Set();
let running = false;

export function getSyncState() { return state; }

export function onSyncState(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function setState(status, message = '') {
  state = { status, message, at: status === 'ok' ? Date.now() : state.at };
  listeners.forEach((fn) => fn(state));
}

const idOf = (store, record) => (store === 'settings' ? record.key : record.id);

// ---------- Blob <-> JSON ----------

async function blobToBase64(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

function base64ToBlob(data, type) {
  const bin = atob(data);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}

async function encode(value) {
  if (value instanceof Blob) return { __blob: true, type: value.type, data: await blobToBase64(value) };
  if (Array.isArray(value)) return Promise.all(value.map(encode));
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value)) out[key] = await encode(value[key]);
    return out;
  }
  return value;
}

function decode(value) {
  if (value && value.__blob) return base64ToBlob(value.data, value.type);
  if (Array.isArray(value)) return value.map(decode);
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value)) out[key] = decode(value[key]);
    return out;
  }
  return value;
}

// ---------- Cloud table access ----------

async function rest(path, { method = 'GET', body, headers = {} } = {}) {
  const token = await getAccessToken();
  if (!token) throw new Error('Not signed in');
  const res = await fetch(SUPABASE_URL + '/rest/v1' + path, {
    method,
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let message = 'Sync request failed (' + res.status + ')';
    try { const data = await res.json(); message = data.message || data.hint || message; } catch { /* no body */ }
    throw new Error(message);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// ---------- Local bookkeeping ----------

function metaKey() {
  const s = getSession();
  return 'edmedia-sync-' + (s && s.user ? s.user.id : 'none');
}

function readMeta() {
  try { return JSON.parse(localStorage.getItem(metaKey())) || { pull: 0, push: 0 }; } catch { return { pull: 0, push: 0 }; }
}

function writeMeta(meta) {
  try { localStorage.setItem(metaKey(), JSON.stringify(meta)); } catch { /* storage unavailable */ }
}

export function resetSyncMeta() {
  try { localStorage.removeItem(metaKey()); } catch { /* storage unavailable */ }
}

// ---------- Pull and push (newest edit wins per record) ----------

async function pull(meta) {
  const since = Math.max(0, (meta.pull || 0) - SKEW_MS);
  let offset = 0;
  let maxSeen = meta.pull || 0;
  for (;;) {
    const rows = await rest(
      '/sync_records?select=store,id,data,updated_at,deleted&updated_at=gte.' + since +
        '&order=updated_at.asc&limit=' + PAGE + '&offset=' + offset
    );
    if (!rows || !rows.length) break;
    for (const row of rows) {
      if (!STORES.includes(row.store)) continue;
      const key = row.id;
      const local = await dbGet(row.store, key);
      if (!local || row.updated_at > (local.updatedAt || 0)) {
        const record = decode(row.data);
        record.deleted = !!row.deleted;
        record.updatedAt = row.updated_at;
        await dbPut(row.store, record);
      }
      if (row.updated_at > maxSeen) maxSeen = row.updated_at;
    }
    if (rows.length < PAGE) break;
    offset += PAGE;
  }
  meta.pull = maxSeen;
}

async function push(meta, startedAt) {
  const session = getSession();
  for (const store of STORES) {
    const changed = (await dbGetAll(store)).filter((r) => (r.updatedAt || 0) > (meta.push || 0));
    for (let i = 0; i < changed.length; i += 25) {
      const batch = changed.slice(i, i + 25);
      const rows = [];
      for (const record of batch) {
        rows.push({
          user_id: session.user.id,
          store,
          id: String(idOf(store, record)),
          data: await encode(record),
          updated_at: record.updatedAt || 0,
          deleted: !!record.deleted,
        });
      }
      await rest('/sync_records?on_conflict=user_id,store,id', {
        method: 'POST',
        body: rows,
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      });
    }
  }
  meta.push = startedAt;
}

export async function syncNow() {
  if (!isConfigured() || !getSession()) return;
  if (running) return;
  if (!navigator.onLine) { setState('offline'); return; }
  running = true;
  setState('syncing');
  try {
    const startedAt = Date.now();
    const meta = readMeta();
    await pull(meta);
    await push(meta, startedAt);
    writeMeta(meta);
    setState('ok');
  } catch (err) {
    console.warn('Sync failed', err);
    if (!navigator.onLine || err.name === 'TypeError') setState('offline');
    else setState('error', err.message);
  } finally {
    running = false;
  }
}

// Removes this account's copies from the cloud. Data on this device is not touched.
export async function deleteCloudData() {
  const session = getSession();
  if (!session) return;
  await rest('/sync_records?user_id=eq.' + encodeURIComponent(session.user.id), { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
  resetSyncMeta();
}

export function initSync() {
  if (!isConfigured()) { setState('off'); return; }
  setState(getSession() ? 'idle' : 'off');
  if (getSession()) syncNow();
  onAuthChange((session) => {
    if (session) syncNow();
    else setState('off');
  });
  window.addEventListener('online', () => syncNow());
  window.addEventListener('offline', () => { if (getSession()) setState('offline'); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && getSession() && Date.now() - state.at > 120000) syncNow();
  });
}
