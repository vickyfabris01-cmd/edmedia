// sw.js

importScripts('./precache.js');

const VERSION = self.PRECACHE_VERSION;
// Large optional files (the person detector) get their own cache so an app update does not delete them
const VENDOR = 'edmedia-vendor-1';

// On localhost always try the network first so edits show up immediately
const DEV = ['localhost', '127.0.0.1'].includes(self.location.hostname);

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => Promise.allSettled(self.PRECACHE_FILES.map((url) => cache.add(url))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION && k !== VENDOR).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function store(request, response) {
  if (response && response.ok && response.type === 'basic') {
    const cache = await caches.open(VERSION);
    cache.put(request, response.clone());
  }
  return response;
}

// Saved the first time they are used, then always served from the device (they never change)
async function cacheFirst(request) {
  const cache = await caches.open(VENDOR);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response && response.ok && response.type === 'basic') cache.put(request, response.clone());
  return response;
}

async function networkFirst(request, fallbackKey) {
  try {
    return await store(request, await fetch(request));
  } catch {
    const cached = (await caches.match(request)) || (fallbackKey && (await caches.match(fallbackKey)));
    return cached || Response.error();
  }
}

async function staleWhileRevalidate(request, fallbackKey) {
  const cached = (await caches.match(request)) || (fallbackKey && (await caches.match(fallbackKey)));
  const refresh = fetch(request).then((res) => store(request, res)).catch(() => null);
  return cached || (await refresh) || Response.error();
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // Supabase and other origins pass through
  if (url.pathname.includes('/assets/vendor/')) { event.respondWith(cacheFirst(request).catch(() => Response.error())); return; }
  const fallbackKey = request.mode === 'navigate' ? './index.html' : null;
  event.respondWith(DEV ? networkFirst(request, fallbackKey) : staleWhileRevalidate(request, fallbackKey));
});