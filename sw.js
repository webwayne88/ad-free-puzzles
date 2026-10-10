// Сначала сеть, при её отсутствии — кеш: обновления приходят сразу, а офлайн всё работает.
const CACHE = 'igroteka-v2';
const ASSETS = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/styles.css',
  'js/analyst/abtest.js',
  'js/analyst/correlation.js',
  'js/analyst/game.js',
  'js/analyst/metrics.js',
  'js/analyst/session.js',
  'js/analyst/slider.js',
  'js/analyst/stats.js',
  'js/analyst/view.js',
  'js/app.js',
  'js/home.js',
  'js/icons.js',
  'js/settings.js',
  'js/storage.js',
  'js/ui.js',
  'js/ricochet/engine.js',
  'js/ricochet/session.js',
  'js/ricochet/view.js',
  'js/hues/color.js',
  'js/hues/game.js',
  'js/hues/harmony.js',
  'js/hues/picker.js',
  'js/hues/session.js',
  'js/hues/view.js',
  'js/sudoku/engine.js',
  'js/sudoku/game.js',
  'js/sudoku/session.js',
  'js/sudoku/view.js',
  'data/correlations.json',
  'data/sudoku.json',
  'icons/analyst.svg',
  'icons/icon.svg',
  'icons/hues.svg',
  'icons/ricochet.svg',
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
