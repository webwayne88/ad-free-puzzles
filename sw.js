// Сначала сеть, при её отсутствии — кеш: обновления приходят сразу, а офлайн всё работает.
const CACHE = 'igroteka-v2';
const ASSETS = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/styles.css',
  'js/app.js',
  'js/home.js',
  'js/icons.js',
  'js/settings.js',
  'js/storage.js',
  'js/ui.js',
  'js/ballz/engine.js',
  'js/ballz/session.js',
  'js/ballz/view.js',
  'js/sudoku/engine.js',
  'js/sudoku/game.js',
  'js/sudoku/session.js',
  'js/sudoku/view.js',
  'data/sudoku.json',
  'icons/icon.svg',
  'icons/ballz.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    return (await cache.match(request, { ignoreSearch: true })) ?? cache.match('index.html');
  }
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== location.origin) return;
  event.respondWith(networkFirst(event.request));
});
