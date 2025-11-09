
const CACHE_NAME = 'toku-com-cache-v1';
const urlsToCache = [
  './',
  './index.html',
  './manifest.json',
  './smartpay_app_js.js',
  './logo.PNG'
];
/*
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});
*/
self.addEventListener("install", event => {
  self.skipWaiting();
});
self.addEventListener("activate", event => {
  clients.claim();
});

self.addEventListener('fetch', event => {
  // network-first for CSV (so latest data), cache-first for app shell
  const requestUrl = new URL(event.request.url);
  if (requestUrl.pathname.endsWith('/pub') || requestUrl.search.includes('output=csv') || requestUrl.pathname.endsWith('.csv')) {
    event.respondWith(fetch(event.request).catch(()=> caches.match(event.request)));
    return;
  }

  event.respondWith(
    caches.match(event.request).then(response => {
      return response || fetch(event.request);
    })
  );
});
