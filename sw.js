/* ПДА-2М // офлайн-кэш */
const CACHE_NAME = 'stalker-pda-v1.58.254';
const APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './map.jpg',
  './electra-bg.svg',
  './chemistry-bg.svg',
  './acid-wear.svg',
  './manifest.webmanifest',
  './items-catalog.html',
  './app-catalog.json',
  './items-catalog.json',
  './icons/favicon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Жёсткий cache-first: успешная навигация больше не перезаписывает index.html.
  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then(async (response) => {
          if (response && response.ok) {
            const copy = response.clone();
            const cache = await caches.open(CACHE_NAME);
            await cache.put(request, copy);
          }
          return response;
        })
        .catch(() => {
          if (request.mode === 'navigate') return caches.match('./index.html');
          return new Response('', { status: 503, statusText: 'Offline' });
        });
    })
  );
});
