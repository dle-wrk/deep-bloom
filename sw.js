// Offline support for the installed web app: serve the game from cache, update in the
// background. Bump VERSION whenever game files change so players get the new build.
const VERSION = 'deep-bloom-v1';
const SHELL = ['./', 'index.html', 'style.css', 'audio.js', 'game.js', 'manifest.json',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Cache first, then refresh the cached copy from the network (fonts included).
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.open(VERSION).then(async (cache) => {
    const hit = await cache.match(e.request);
    const fresh = fetch(e.request).then((res) => {
      if (res.ok || res.type === 'opaque') cache.put(e.request, res.clone());
      return res;
    }).catch(() => hit);
    return hit || fresh;
  }));
});
