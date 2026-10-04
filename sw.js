// sw.js

importScripts('./precache.js');

const VERSION = self.PRECACHE_VERSION;

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
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
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
  const fallbackKey = request.mode === 'navigate' ? './index.html' : null;
  event.respondWith(DEV ? networkFirst(request, fallbackKey) : staleWhileRevalidate(request, fallbackKey));
});
