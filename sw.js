// 事前キャッシュは行わず、ブラウザ側で取得済みのキャッシュがあればそれを返す
self.addEventListener("install", () => {
  self.skipWaiting();
});
self.addEventListener("activate", event => {
  event.waitUntil(self.clients.claim());
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
