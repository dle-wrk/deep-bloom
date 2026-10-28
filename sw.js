// Offline support for the installed web app. Game files are network-first (so an update
// shows up the next time you open the game online) with the cache as the offline fallback.
// Bump VERSION whenever game files change so the new build is cached fresh.
const VERSION = 'deep-bloom-v8';
const SHELL = ['./', 'index.html', 'style.css', 'audio.js', 'game.js', 'manifest.json',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'];

self.addEventListener('install', (e) => {
  // cache: 'reload' skips the browser's HTTP cache, which could otherwise hand back the
  // previous build's files for a few minutes after a deploy.
  e.waitUntil(caches.open(VERSION)
    .then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const sameOrigin = new URL(e.request.url).origin === self.location.origin;
  e.respondWith(caches.open(VERSION).then(async (cache) => {
    const hit = await cache.match(e.request, { ignoreSearch: true });
    // Fonts and other outside files: cache first, they never change.
    if (!sameOrigin && hit) return hit;
    try {
      const res = await fetch(e.request, sameOrigin ? { cache: 'no-cache' } : undefined);
      if (res.ok || res.type === 'opaque') cache.put(e.request, res.clone());
      return res;
    } catch (err) {
      return hit || Response.error();
    }
  }));
});
