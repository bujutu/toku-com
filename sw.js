// アプリ本体（HTML/JS/アイコン）を端末に保存し、オフラインでも起動できるようにする。
// オンライン時は常にネットワークの最新版を優先し、取得できないときだけ保存済みのものを返す。
// 還元率データ（Googleスプレッドシート）はここでは扱わず、アプリ側が localStorage に保存する。
//
// APP_SHELL のファイル構成を変えたときは CACHE の番号を上げること。
const CACHE = "tokucom-v1";
const APP_SHELL = [
  "./",
  "./index.html",
  "./how-to.html",
  "./privacypolicy.html",
  "./smartpay_app_js.js",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png"
];
const NETWORK_TIMEOUT_MS = 3000;

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(APP_SHELL.map(url => new Request(url, { cache: "reload" }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const request = event.request;
  // 自サイトのGETだけを扱う。スプレッドシート・Analytics・広告などはブラウザに任せる。
  if (request.method !== "GET") return;
  if (new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(networkFirst(request));
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request, { ignoreSearch: true });

  const network = fetch(request).then(response => {
    if (response.ok) cache.put(request, response.clone()).catch(() => {});
    return response;
  });

  if (!cached) {
    // 保存済みがないページへの移動は、オフラインならトップ画面を返す
    return network.catch(async err => {
      if (request.mode === "navigate") {
        const index = await cache.match("./index.html");
        if (index) return index;
      }
      throw err;
    });
  }

  // 保存済みがある場合: 通信失敗、または電波が弱く応答が遅いときは保存済みを返す
  return Promise.race([
    network.catch(() => cached),
    new Promise(resolve => setTimeout(() => resolve(cached), NETWORK_TIMEOUT_MS))
  ]);
}
