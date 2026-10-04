// js/sync/cloud.js

import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config.js';
import { getAccessToken } from './auth.js';
import { BUCKET } from './limits.js';

export class CloudError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

async function call(path, { method = 'GET', body, headers = {}, raw = false } = {}) {
  const token = await getAccessToken();
  if (!token) throw new CloudError('Not signed in', 401);
  const isJson = body !== undefined && !(body instanceof Blob);
  const res = await fetch(SUPABASE_URL + path, {
    method,
    headers: {
      apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + token,
      ...(isJson ? { 'Content-Type': 'application/json' } : {}), ...headers,
    },
    body: body === undefined ? undefined : isJson ? JSON.stringify(body) : body,
  });
  if (!res.ok) {
    let message = 'Sync request failed (' + res.status + ')';
    let code = res.status;
    try {
      const data = await res.json();
      message = data.message || data.error || data.hint || message;
      if (data.statusCode) code = Number(data.statusCode) || code;
    } catch { /* no body */ }
    throw new CloudError(message, code);
  }
  if (raw) return res;
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

export const rest = (path, options) => call('/rest/v1' + path, options);
export const rpc = (name) => call('/rest/v1/rpc/' + name, { method: 'POST', body: {} });

const objectPath = (path) => path.split('/').map(encodeURIComponent).join('/');

// A file that is already there counts as uploaded (the same photo is never changed).
export async function uploadObject(path, blob) {
  try {
    await call('/storage/v1/object/' + BUCKET + '/' + objectPath(path), { method: 'POST', body: blob, headers: { 'Content-Type': blob.type || 'application/octet-stream', 'x-upsert': 'false' } });
  } catch (err) {
    if (err.status === 409 || /already exists/i.test(err.message)) return;
    throw err;
  }
}

export async function downloadObject(path) {
  const res = await call('/storage/v1/object/authenticated/' + BUCKET + '/' + objectPath(path), { raw: true });
  return res.blob();
}

export async function removeObjects(paths) {
  if (!paths.length) return;
  await call('/storage/v1/object/' + BUCKET, { method: 'DELETE', body: { prefixes: paths } });
}

export async function listObjects(prefix) {
  const rows = await call('/storage/v1/object/list/' + BUCKET, { method: 'POST', body: { prefix, limit: 1000, offset: 0 } });
  return (rows || []).filter((r) => r.name).map((r) => prefix + '/' + r.name);
}

