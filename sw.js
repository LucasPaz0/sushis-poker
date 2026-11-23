// Service worker: guarda os arquivos do app para funcionar offline.
// Ao mudar qualquer arquivo do app, aumente a versão abaixo para os celulares baixarem a nova versão.
const CACHE = 'sushis-poker-v14';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './img/logo.webp',
  './img/logo-128.png',
  './vendor/qrcode.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

// Rede primeiro (pega atualizações), cache como reserva quando estiver offline
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  // A API da mesa ao vivo sempre vai direto para a rede (nada de cache)
  if (new URL(e.request.url).pathname.startsWith('/api/')) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
