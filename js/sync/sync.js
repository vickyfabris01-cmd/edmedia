// js/sync/sync.js

import { dbGetAll, dbGet, dbPut as dbPutLoud, dbDelete, setWriteHook } from '../store/db.js';
import { isConfigured, getSession, onAuthChange } from './auth.js';
import { rest, rpc, uploadObject, downloadObject, removeObjects, listObjects } from './cloud.js';
import { fitUnderLimit } from './media.js';
import { buildThumbnail } from './thumbs.js';
import { QUOTA_BYTES, AUTO_DELETE_AT } from './limits.js';

// What syncs:
//  - templates (settings only, no pictures), saved looks, settings: small records
//  - brand logos: the record plus the image file (2 MB at most)
//  - projects: the recipe plus a copy of the photo (2 MB at most), within the user's cloud space
// Every synced record carries two local-only fields: cloud (what the cloud has) and syncOff
// ('manual' | 'quota' | 'expired' | 'size': this record is not synced and is not uploaded again by itself).
const ORDER = ['assets', 'presets', 'settings', 'templates', 'projects'];
const PAGE = 100;
const SKEW_MS = 5000;
const FORMAT = 2;

export class SyncError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

let state = { status: 'off', at: 0, message: '' };
const listeners = new Set();
let running = null;
let chain = Promise.resolve();
let quota = { used: 0, limit: QUOTA_BYTES };

export function getSyncState() { return state; }
export function getQuota() { return quota; }

export function onSyncState(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function setState(status, message = '') {
  state = { status, message, at: status === 'ok' ? Date.now() : state.at };
  listeners.forEach((fn) => fn(state));
}

// Sync, manual sync and unsync never run at the same time.
function exclusive(fn) {
  const run = chain.then(fn);
  chain = run.catch(() => {});
  return run;
}

// The engine's own writes must not queue another sync
const dbPut = (store, value) => dbPutLoud(store, value, { silent: true });

const idOf = (store, rec) => String(store === 'settings' ? rec.key : rec.id);
const uid = () => getSession().user.id;
const mediaPath = (kind, id) => uid() + '/' + kind + '/' + id;
const isNetworkError = (err) => !navigator.onLine || err.name === 'TypeError';

const isSynced = (rec) => !!rec.cloud && rec.cloud.v === FORMAT && rec.cloud.uid === uid() && rec.cloud.updatedAt === (rec.updatedAt || 0);

// The record as it goes to the cloud: no local-only fields and no pictures (those travel as files).
function plain(rec) {
  const out = { ...rec };
  delete out.cloud; delete out.syncOff; delete out.thumbnail; delete out.blob;
  return out;
}

async function patchLocal(store, id, fn) {
  const fresh = await dbGet(store, id);
  if (!fresh) return null;
  const next = fn({ ...fresh });
  await dbPut(store, next);
  return next;
}

// ---------- Cloud space ----------

export async function refreshQuota() {
  try {
    const q = await rpc('sync_quota');
    quota = { used: Number(q.used) || 0, limit: Number(q.limit) || QUOTA_BYTES };
  } catch (err) { console.warn('Could not read cloud usage', err); }
  return quota;
}

// Makes room for `need` bytes. Automatic sync removes the oldest synced projects (older than the one coming in)
// once the space would pass 98%. A manual sync never removes anything.
async function ensureRoom(need, incoming, manual) {
  const ceiling = quota.limit * AUTO_DELETE_AT;
  if (quota.used + need <= ceiling) return true;
  if (manual) return false;
  const older = (await dbGetAll('projects'))
    .filter((p) => !p.deleted && !p.syncOff && p.cloud && p.id !== incoming.id && (p.updatedAt || 0) < (incoming.updatedAt || 0))
    .sort((a, b) => (a.updatedAt || 0) - (b.updatedAt || 0));
  for (const old of older) {
    await unsyncCloud('projects', old, 'quota');
    await refreshQuota();
    if (quota.used + need <= ceiling) return true;
  }
  return false;
}

// ---------- Local bookkeeping ----------

function metaKey() {
  const s = getSession();
  return 'edmedia-sync-' + (s && s.user ? s.user.id : 'none');
}
function readMeta() {
  try { return JSON.parse(localStorage.getItem(metaKey())) || { pull: 0 }; } catch { return { pull: 0 }; }
}
function writeMeta(meta) {
  try { localStorage.setItem(metaKey(), JSON.stringify(meta)); } catch { /* storage unavailable */ }
}
export function resetSyncMeta() {
  try { localStorage.removeItem(metaKey()); } catch { /* storage unavailable */ }
}

// ---------- Pull ----------

function decode(value) {
  // Older versions stored pictures inside the record as base64
  if (value && value.__blob) {
    const bin = atob(value.data);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: value.type });
  }
  if (Array.isArray(value)) return value.map(decode);
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value)) out[key] = decode(value[key]);
    return out;
  }
  return value;
}

// Rows written by an older version still hold pictures inline. They are read, then rewritten in the new form.
const isLegacy = (store, row) => (store === 'assets' && !(row.data && row.data.media)) || (store === 'templates' && !!(row.data && row.data.thumbnail));

function cloudFlag(store, row) {
  const flag = { v: FORMAT, uid: uid(), updatedAt: row.updated_at };
  const d = row.data || {};
  if (store === 'assets' && d.media) { flag.media = d.media.path; flag.size = d.media.size; }
  if (store === 'projects' && d.photo) { flag.photoId = d.photoId; flag.photo = d.photo; flag.size = d.photo.size; }
  return flag;
}

async function importRow(store, row) {
  const data = decode(row.data || {});
  const record = { ...data, deleted: false, updatedAt: row.updated_at };
  delete record.syncOff;
  if (!isLegacy(store, row)) record.cloud = cloudFlag(store, row); else delete record.cloud;

  if (store === 'assets' && data.media) {
    record.blob = await downloadObject(data.media.path);
    delete record.media;
  }
  if (store === 'templates' && !(record.thumbnail instanceof Blob)) {
    record.thumbnail = await buildThumbnail(record.recipe, null, 360);
  }
  if (store === 'projects') {
    const photo = data.photo;
    delete record.photo;
    if (photo && !(await dbGet('photos', record.photoId))) {
      const blob = await downloadObject(photo.path);
      await dbPut('photos', { id: record.photoId, blob, width: photo.width, height: photo.height, createdAt: record.createdAt || Date.now() });
    }
    const local = await dbGet('photos', record.photoId);
    record.thumbnail = await buildThumbnail(record.recipe, local ? local.blob : null, 240);
  }
  await dbPut(store, record);
}

async function removeLocal(store, local, updatedAt) {
  await dbPut(store, { ...local, deleted: true, updatedAt, cloud: { v: FORMAT, uid: uid(), updatedAt } });
  if (store === 'projects' && local.photoId) {
    const all = await dbGetAll('projects');
    if (!all.some((p) => !p.deleted && p.id !== local.id && p.photoId === local.photoId)) await dbDelete('photos', local.photoId);
  }
}

async function applyRow(store, row) {
  const local = await dbGet(store, row.id);

  if (row.sync_state === 'off') {
    if (local && local.syncOff !== (row.off_reason || 'manual')) await dbPut(store, { ...local, syncOff: row.off_reason || 'manual', cloud: null });
    return;
  }
  if (!local && row.deleted) return;
  if (row.deleted) {
    if ((row.updated_at || 0) > (local.updatedAt || 0)) await removeLocal(store, local, row.updated_at);
    return;
  }
  if (local && local.syncOff && local.cloud) return; // an unsync here is waiting to be sent

  const localTime = local ? local.updatedAt || 0 : -1;
  if (local && localTime >= row.updated_at) {
    // Same or newer here. Another device may have turned sync back on, so follow that.
    const next = { ...local };
    delete next.syncOff;
    if (localTime === row.updated_at && !isLegacy(store, row)) next.cloud = cloudFlag(store, row);
    if (local.syncOff || (localTime === row.updated_at && !isSynced(local))) await dbPut(store, next);
    return;
  }
  await importRow(store, row);
}

async function pull(meta) {
  const since = Math.max(0, (meta.pull || 0) - SKEW_MS);
  let maxSeen = meta.pull || 0;
  let failed = 0;
  if (!meta.pull) setState('syncing', 'Getting your data');
  for (const store of ORDER) {
    for (let offset = 0; ; offset += PAGE) {
      const rows = await rest(
        '/sync_records?select=id,data,updated_at,deleted,sync_state,off_reason,changed_at&store=eq.' + store +
          '&changed_at=gte.' + since + '&order=changed_at.asc,id.asc&limit=' + PAGE + '&offset=' + offset
      );
      if (!rows || !rows.length) break;
      for (const row of rows) {
        try {
          await applyRow(store, row);
          if (row.changed_at > maxSeen) maxSeen = row.changed_at;
        } catch (err) {
          if (isNetworkError(err)) throw err;
          if (err.status === 404) { console.warn('A synced file is missing, skipping', store, row.id); if (row.changed_at > maxSeen) maxSeen = row.changed_at; continue; }
          failed++;
          console.warn('Could not restore', store, row.id, err);
        }
      }
      if (rows.length < PAGE) break;
    }
  }
  if (!failed) meta.pull = maxSeen;
  else throw new Error(failed + ' item(s) could not be restored. Will try again.');
}

// ---------- Push ----------

async function removeMedia(store, rec) {
  if (store === 'projects') {
    if (!rec.photoId) return;
    const path = rec.cloud && rec.cloud.photo ? rec.cloud.photo.path : mediaPath('photos', rec.photoId);
    const shared = (await dbGetAll('projects')).some((p) => p.id !== rec.id && !p.deleted && !p.syncOff && p.photoId === rec.photoId && p.cloud && p.cloud.photo);
    if (!shared) await removeObjects([path]);
  } else if (store === 'assets') {
    await removeObjects([rec.cloud && rec.cloud.media ? rec.cloud.media : mediaPath('assets', rec.id)]);
  }
}

const upsert = (row) => rest('/sync_records?on_conflict=user_id,store,id', {
  method: 'POST', body: [{ user_id: uid(), deleted: false, sync_state: 'synced', off_reason: null, size_bytes: 0, ...row }],
  headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
});

// Takes a record out of the cloud and keeps it from being uploaded again by itself.
async function unsyncCloud(store, rec, reason) {
  await upsert({ store, id: idOf(store, rec), data: {}, updated_at: rec.updatedAt || 0, sync_state: 'off', off_reason: reason });
  await removeMedia(store, rec);
  await patchLocal(store, idOf(store, rec), (r) => ({ ...r, syncOff: reason, cloud: null }));
}

async function skip(store, rec, reason, manual, message) {
  if (manual) throw new SyncError(reason, message);
  await patchLocal(store, idOf(store, rec), (r) => ({ ...r, syncOff: reason }));
  return false;
}

const isSpaceError = (err) => err.status === 403 || /row-level security|exceeded|too large/i.test(err.message);

async function pushRecord(store, rec, { manual = false } = {}) {
  const id = idOf(store, rec);
  const cloud = { v: FORMAT, uid: uid(), updatedAt: rec.updatedAt || 0 };
  const mine = rec.cloud && rec.cloud.v === FORMAT && rec.cloud.uid === uid();
  let data = plain(rec);
  let bytes = 0;

  if (rec.deleted) {
    data = {};
    await removeMedia(store, rec);
  } else if (store === 'assets') {
    if (mine && rec.cloud.media) {
      cloud.media = rec.cloud.media; cloud.size = rec.cloud.size;
    } else {
      const blob = rec.blob ? await fitUnderLimit(rec.blob, { keepAlpha: true }) : null;
      if (!blob) return skip(store, rec, 'size', manual, 'This logo is over 2 MB and could not be made smaller.');
      if (!(await ensureRoom(blob.size, { id: null, updatedAt: Infinity }, manual))) return skip(store, rec, 'quota', manual, 'Not enough cloud space.');
      const path = mediaPath('assets', id);
      try { await uploadObject(path, blob); } catch (err) { if (isSpaceError(err)) return skip(store, rec, 'quota', manual, 'Not enough cloud space.'); throw err; }
      quota.used += blob.size;
      cloud.media = path; cloud.size = blob.size;
    }
    data.media = { path: cloud.media, size: cloud.size };
    bytes = cloud.size;
  } else if (store === 'projects') {
    let photo = mine && rec.cloud.photoId === rec.photoId ? rec.cloud.photo : null;
    if (!photo) {
      const shared = (await dbGetAll('projects')).find((p) => p.id !== rec.id && !p.deleted && !p.syncOff && p.photoId === rec.photoId && p.cloud && p.cloud.uid === uid() && p.cloud.photo);
      if (shared) {
        photo = shared.cloud.photo; // a duplicated project uses the same cloud photo
      } else {
        const local = await dbGet('photos', rec.photoId);
        if (!local) { if (manual) throw new SyncError('photo', 'The photo for this project is missing on this device.'); return false; }
        const blob = await fitUnderLimit(local.blob);
        if (!blob) return skip(store, rec, 'size', manual, 'This photo could not be made smaller than 2 MB.');
        if (!(await ensureRoom(blob.size, rec, manual))) return skip(store, rec, 'quota', manual, 'Not enough cloud space.');
        const path = mediaPath('photos', rec.photoId);
        try { await uploadObject(path, blob); } catch (err) { if (isSpaceError(err)) return skip(store, rec, 'quota', manual, 'Not enough cloud space.'); throw err; }
        quota.used += blob.size;
        photo = { path, width: local.width, height: local.height, size: blob.size };
      }
    }
    cloud.photoId = rec.photoId; cloud.photo = photo; cloud.size = photo.size;
    data.photo = photo;
    bytes = photo.size;
  }

  await upsert({ store, id, data, updated_at: rec.updatedAt || 0, deleted: !!rec.deleted, size_bytes: bytes });
  await patchLocal(store, id, (r) => { delete r.syncOff; r.cloud = cloud; return r; });
  return true;
}

async function pushOne(store, rec) {
  if (rec.syncOff) { if (rec.cloud) await unsyncCloud(store, rec, rec.syncOff); return; }
  if (isSynced(rec)) return;
  if (rec.deleted && store === 'projects' && !rec.cloud) return; // never uploaded, nothing to remove
  await pushRecord(store, rec);
}

async function push() {
  let problem = null;
  for (const store of ORDER) {
    const list = await dbGetAll(store);
    if (store === 'projects') list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)); // newest first
    for (const rec of list) {
      try { await pushOne(store, rec); } catch (err) {
        if (isNetworkError(err) || err.status === 401) throw err;
        console.warn('Could not sync', store, idOf(store, rec), err);
        problem = problem || err;
      }
    }
  }
  if (problem) throw problem;
}

async function runSync() {
  setState('syncing');
  try {
    const meta = readMeta();
    await refreshQuota();
    await pull(meta);
    await push();
    await refreshQuota();
    writeMeta(meta);
    setState('ok');
  } catch (err) {
    console.warn('Sync failed', err);
    if (isNetworkError(err)) setState('offline');
    else setState('error', err.message);
  }
}

export function syncNow() {
  if (!isConfigured() || !getSession()) return Promise.resolve();
  if (running) return running;
  if (!navigator.onLine) { setState('offline'); return Promise.resolve(); }
  running = exclusive(runSync).finally(() => { running = null; });
  return running;
}

// Sync soon, but not on every small change
let queued = 0;
export function queueSync(delay = 20000) {
  if (!isConfigured() || !getSession()) return;
  clearTimeout(queued);
  queued = setTimeout(() => syncNow(), delay);
}

// ---------- Manage page: what is synced, sync and unsync one item ----------

export const syncStatusOf = (rec) => (rec.syncOff ? 'off' : isSynced(rec) ? 'synced' : 'waiting');

// kind: 'projects' | 'templates'
export async function listSyncItems(kind) {
  const all = (await dbGetAll(kind)).filter((r) => !r.deleted).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  return all.map((r) => ({
    id: r.id, name: r.name, thumbnail: r.thumbnail, updatedAt: r.updatedAt || 0,
    status: syncStatusOf(r), reason: r.syncOff || null, size: r.cloud && r.cloud.photo ? r.cloud.photo.size : 0,
  }));
}

function needOnline() {
  if (!getSession()) throw new SyncError('auth', 'Sign in to use cloud sync.');
  if (!navigator.onLine) throw new SyncError('offline', 'You are offline.');
}

// Removes the cloud copy. The item stays on this device and is not synced again until you sync it.
export function unsyncItem(kind, id) {
  return exclusive(async () => {
    const rec = await dbGet(kind, id);
    if (!rec) return;
    await patchLocal(kind, id, (r) => ({ ...r, syncOff: 'manual' })); // remembered even if we go offline now
    if (!getSession() || !navigator.onLine) return;
    await unsyncCloud(kind, { ...rec, syncOff: 'manual' }, 'manual');
    await refreshQuota();
    listeners.forEach((fn) => fn(state));
  });
}

export function syncItem(kind, id) {
  return exclusive(async () => {
    needOnline();
    const rec = await dbGet(kind, id);
    if (!rec || rec.deleted) return;
    await refreshQuota();
    await pushRecord(kind, rec, { manual: true });
    await refreshQuota();
    listeners.forEach((fn) => fn(state));
  });
}

// ---------- Account ----------

// Removes this account's copies from the cloud. Data on this device is not touched.
// Projects and templates are not uploaded again until you sync them from the Manage page.
export function deleteCloudData() {
  return exclusive(async () => {
    const s = getSession();
    if (!s) return;
    const paths = [...(await listObjects(s.user.id + '/photos')), ...(await listObjects(s.user.id + '/assets'))];
    for (let i = 0; i < paths.length; i += 100) await removeObjects(paths.slice(i, i + 100));
    await rest('/sync_records?user_id=eq.' + encodeURIComponent(s.user.id), { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
    for (const store of ['projects', 'templates']) {
      for (const rec of await dbGetAll(store)) await dbPut(store, { ...rec, cloud: null, syncOff: 'manual' });
    }
    for (const store of ['assets', 'presets', 'settings']) {
      for (const rec of await dbGetAll(store)) if (rec.cloud) await dbPut(store, { ...rec, cloud: null });
    }
    resetSyncMeta();
    await refreshQuota();
    listeners.forEach((fn) => fn(state));
  });
}

export function initSync() {
  if (!isConfigured()) { setState('off'); return; }
  setWriteHook(() => queueSync());
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