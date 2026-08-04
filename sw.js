const CACHE = 'fortis-golf-2026-08-04-03';

const ASSETS = [
  '/index.html',
  '/manifest.webmanifest',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);

    for (const asset of ASSETS) {
      try {
        const response = await fetch(asset, { cache: 'reload' });
        if (response.ok) {
          await cache.put(asset, response.clone());
        }
      } catch (e) {
        console.log('Precache failed:', asset);
      }
    }

    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {

    // Delete every previous cache
    const keys = await caches.keys();

    await Promise.all(
      keys
        .filter(key => key !== CACHE)
        .map(key => caches.delete(key))
    );

    await self.clients.claim();

    // Force every open Fortis Golf window to reload
    const clients = await self.clients.matchAll({
      includeUncontrolled: true,
      type: 'window'
    });

    clients.forEach(client => {
      client.postMessage({
        type: 'FORTIS_UPDATE_READY'
      });
    });

  })());
});

self.addEventListener('message', event => {

  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

});

self.addEventListener('fetch', event => {

  const request = event.request;

  const url = new URL(request.url);

  if (request.method !== 'GET')
    return;

  if (url.pathname.startsWith('/api/'))
    return;

  // Never cache MP4 videos
  if (
    url.pathname.endsWith('.mp4') ||
    request.headers.has('range')
  ) {
    event.respondWith(
      fetch(request, {
        cache: 'no-store'
      })
    );
    return;
  }

  // ALWAYS load latest HTML
  if (
    request.mode === 'navigate' ||
    url.pathname === '/' ||
    url.pathname === '/index.html'
  ) {

    event.respondWith((async () => {

      try {

        const response = await fetch(request, {
          cache: 'no-store'
        });

        if (response.ok) {

          const cache = await caches.open(CACHE);

          await cache.put('/index.html', response.clone());

        }

        return response;

      } catch {

        return (
          await caches.match('/index.html')
        ) || Response.error();

      }

    })());

    return;

  }

  // Static assets
  event.respondWith((async () => {

    const cached = await caches.match(request);

    const networkFetch = fetch(request, {
      cache: 'no-cache'
    }).then(async response => {

      if (response.ok && response.status === 200) {

        const cache = await caches.open(CACHE);

        cache.put(request, response.clone());

      }

      return response;

    }).catch(() => null);

    if (cached) {

      event.waitUntil(networkFetch);

      return cached;

    }

    return (await networkFetch) || Response.error();

  })());

});
