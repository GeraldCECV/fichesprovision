const CACHE = 'provision-vo-__VERSION__';
const PRECACHE = __PRECACHE__;
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('provision-vo-') && key !== CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (
    event.request.method !== 'GET' ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith('/api/')
  )
    return;
  if (event.request.mode === 'navigate') {
    event.respondWith(
      caches.open(CACHE).then(async (cache) => (await cache.match('/')) || fetch(event.request)),
    );
  } else if (PRECACHE.includes(url.pathname)) {
    event.respondWith(
      caches
        .open(CACHE)
        .then(async (cache) => (await cache.match(url.pathname)) || fetch(event.request)),
    );
  }
});
