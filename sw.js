// ==========================================================================
// cash-map — Offline-First Service Worker (GitHub Pages Subpath Compatible)
// ==========================================================================

const CACHE_NAME = 'cash-map-v1.2.2';

const PRECACHE_ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/favicon.svg',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './css/tokens.css',
  './css/base.css',
  './css/components.css',
  './css/charts.css',
  './js/app.js',
  './js/ui.js',
  './js/store.js',
  './js/defaults.js',
  './js/finance.js',
  './js/format.js',
  './js/icons.js',
  './js/backup.js',
  './js/charts.js',
  './js/views/overview.js',
  './js/views/transactions.js',
  './js/views/analytics.js',
  './js/views/budgets.js',
  './js/views/modals.js',
  './js/views/settings.js',
  './js/views/onboarding.js',
  './js/views/monthpicker.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Navigation requests: network-first with offline cache fallback to ./index.html
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put('./index.html', copy));
          }
          return res;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // Code, styles & manifest: network-first so ES module updates on GitHub Pages are always atomic,
  // falling back immediately to precache when offline (airplane mode / poor reception).
  const isCodeOrStyle = /\.(js|mjs|css|webmanifest|json)$/i.test(url.pathname);
  if (isCodeOrStyle) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.status === 200 && res.type === 'basic') {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // Binary assets (icons/images): cache-first with background refresh
  event.respondWith(
    caches.match(req).then((cached) => {
      const networkFetch = fetch(req)
        .then((res) => {
          if (res && res.status === 200 && res.type === 'basic') {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);

      return cached || networkFetch;
    })
  );
});
