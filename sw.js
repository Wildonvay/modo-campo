/* Modo Campo · service worker: o app funciona sem sinal (cache do próprio app) e guarda as imagens
   de satélite e fontes já vistas. A versão muda a cada build para o app atualizar. */
const VERSAO = 'v2.5.202610221817';
const CACHE_APP = 'modo-campo-app-' + VERSAO;
const CACHE_RT = 'modo-campo-runtime';
const APP_FILES = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './icon-maskable-512.png', './apple-touch-icon.png'];
const RT_MAX = 2500; // itens guardados (imagens de satélite e fontes)

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE_APP).then((c) => c.addAll(APP_FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('modo-campo-app-') && k !== CACHE_APP).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

async function trim(cache) {
  const keys = await cache.keys();
  if (keys.length > RT_MAX) for (const k of keys.slice(0, keys.length - RT_MAX)) await cache.delete(k);
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const same = url.origin === self.location.origin;
  if (same) {
    // app: cache primeiro; atualiza em segundo plano
    e.respondWith(caches.open(CACHE_APP).then(async (c) => {
      const hit = await c.match(req, { ignoreSearch: true });
      const net = fetch(req).then((r) => { if (r && r.ok) c.put(req, r.clone()); return r; }).catch(() => null);
      return hit || (await net) || new Response('Sem conexão e sem cópia guardada.', { status: 503 });
    }));
    return;
  }
  const isTile = /arcgisonline\.com/.test(url.host), isFont = /fonts\.(googleapis|gstatic)\.com/.test(url.host);
  if (!isTile && !isFont) return;
  // imagens de satélite e fontes: rede primeiro (imagem atual), cache como reserva sem sinal
  e.respondWith(caches.open(CACHE_RT).then(async (c) => {
    try {
      const r = await fetch(req);
      if (r && (r.ok || r.type === 'opaque')) { c.put(req, r.clone()); trim(c); }
      return r;
    } catch (err) {
      const hit = await c.match(req);
      return hit || new Response('', { status: 504 });
    }
  }));
});
