const CACHE_NAME = 'japan-travel-v3';
const TILE_CACHE_NAME = 'japan-map-tiles-v1';
const TILE_MAX = 500;
const LOCAL_ASSETS = [
  './', './index.html', './style.css', './app.js',
  './data.json', './manifest.json', './icon.svg'
];
const TRANSPARENT_PNG = Uint8Array.from(atob(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQYV2NkYGD4DwABBAEAcCBlCwAAAABJRU5ErkJggg=='
), c => c.charCodeAt(0));

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(LOCAL_ASSETS);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => {
      if (key !== CACHE_NAME && key !== TILE_CACHE_NAME) return caches.delete(key);
    }));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 策略 A：OSM 瓦片 —— CacheFirst + LRU 上限
  if (url.hostname === 'tile.openstreetmap.org' ||
      url.hostname.endsWith('.tile.openstreetmap.org')) {
    event.respondWith((async () => {
      const cache = await caches.open(TILE_CACHE_NAME);
      const cached = await cache.match(event.request);
      if (cached) return cached;
      try {
        const res = await fetch(event.request);
        if (res && res.status === 200) {
          await cache.put(event.request, res.clone());
          const keys = await cache.keys();
          const excess = keys.length - TILE_MAX;
          for (let i = 0; i < excess; i++) await cache.delete(keys[i]);
        }
        return res;
      } catch {
        return new Response(TRANSPARENT_PNG, {
          status: 200,
          headers: { 'Content-Type': 'image/png' }
        });
      }
    })());
    return;
  }

  // 策略 B：HTML 导航 —— NetworkFirst（在线最新，离线回退）
  if (event.request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const res = await fetch(event.request);
        caches.open(CACHE_NAME).then((c) => c.put(event.request, res.clone()));
        return res;
      } catch {
        const cache = await caches.open(CACHE_NAME);
        return (await cache.match(event.request, { ignoreSearch: true }))
            || (await cache.match('./index.html'))
            || (await cache.match('./'));
      }
    })());
    return;
  }

  // 策略 C：其他静态资源 & CDN —— CacheFirst + 动态回填
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(event.request, { ignoreSearch: true });
    if (cached) return cached;
    try {
      const res = await fetch(event.request);
      if (res && (res.status === 200 || res.type === 'opaque')) {
        cache.put(event.request, res.clone());
      }
      return res;
    } catch {
      return new Response('', { status: 504 });
    }
  })());
});
