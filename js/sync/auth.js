// js/sync/auth.js

import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config.js';

const KEY = 'edmedia-session';
const listeners = new Set();

export function isConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

function load() {
  try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; }
}

function save(session) {
  try {
    if (session) localStorage.setItem(KEY, JSON.stringify(session));
    else localStorage.removeItem(KEY);
  } catch { /* storage unavailable */ }
}

function emit() {
  const s = getSession();
  listeners.forEach((fn) => fn(s));
}

export function getSession() {
  return load();
}

export function onAuthChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

async function authFetch(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(SUPABASE_URL + '/auth/v1' + path, {
    method,
    headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* not json */ }
  if (!res.ok) {
    const message = (data && (data.msg || data.error_description || data.message || data.error)) || 'Request failed (' + res.status + ')';
    const err = new Error(message);
    err.status = res.status;
    throw err;
  }
  return data;
}

function sessionFrom(data, fallbackUser) {
  const user = data.user || fallbackUser || {};
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: data.expires_at || Math.floor(Date.now() / 1000) + (data.expires_in || 3600),
    user: { id: user.id, email: user.email },
  };
}

function redirectUrl() {
  return location.origin + location.pathname;
}

export async function signIn(email, password) {
  const data = await authFetch('/token?grant_type=password', { method: 'POST', body: { email, password } });
  save(sessionFrom(data));
  emit();
}

// Returns { needsConfirm }: true when the user must open the confirmation email first.
export async function signUp(email, password) {
  const data = await authFetch('/signup?redirect_to=' + encodeURIComponent(redirectUrl()), { method: 'POST', body: { email, password } });
  if (data && data.access_token) {
    save(sessionFrom(data));
    emit();
    return { needsConfirm: false };
  }
  return { needsConfirm: true };
}

export async function recover(email) {
  await authFetch('/recover?redirect_to=' + encodeURIComponent(redirectUrl()), { method: 'POST', body: { email } });
}

export async function updatePassword(password) {
  const token = await getAccessToken();
  await authFetch('/user', { method: 'PUT', token, body: { password } });
}

export function signOut() {
  save(null);
  emit();
}

// Returns a valid access token, refreshing it when it is about to expire.
export async function getAccessToken() {
  const s = load();
  if (!s) return null;
  if (s.expires_at - 60 > Date.now() / 1000) return s.access_token;
  try {
    const data = await authFetch('/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: s.refresh_token } });
    const next = sessionFrom(data, s.user);
    save(next);
    return next.access_token;
  } catch (err) {
    if (err.status === 400 || err.status === 401) { save(null); emit(); }
    throw err;
  }
}

function parseJwt(token) {
  try {
    const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(decodeURIComponent(escape(atob(payload))));
  } catch { return null; }
}

// Handles the links in confirmation and password-reset emails. Returns the link type or null.
export function consumeAuthRedirect() {
  const hash = location.hash.replace(/^#/, '');
  if (!hash.includes('access_token=')) return null;
  const p = new URLSearchParams(hash);
  const access = p.get('access_token');
  const refresh = p.get('refresh_token');
  if (!access || !refresh) return null;
  const claims = parseJwt(access) || {};
  save({
    access_token: access,
    refresh_token: refresh,
    expires_at: Number(p.get('expires_at')) || claims.exp || Math.floor(Date.now() / 1000) + 3600,
    user: { id: claims.sub, email: claims.email },
  });
  history.replaceState(null, '', location.pathname + location.search + '#/');
  emit();
  return p.get('type') || 'signup';
}
