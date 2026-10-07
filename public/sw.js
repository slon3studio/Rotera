// Service worker for the installable web version.
//
// Deliberately network-first, not cache-first. A restaurant schedule changes
// during a shift, and the app's own JavaScript changes whenever we deploy —
// serving either from cache while the phone has signal is how somebody ends up
// reading yesterday's roster and believing it. The cache exists only so the
// app opens at all with no signal, and so the browser considers it installable.
//
// Supabase requests are never cached: those are live data and go to a
// different origin.

const CACHE = 'rotera-v1';
const SHELL = ['/', '/manifest.json', '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      // One missing file must not fail the whole install.
      .then((cache) => Promise.allSettled(SHELL.map((url) => cache.add(url))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      // Take over open tabs straight away, so a deploy does not leave someone
      // on the previous version until they close every tab.
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        // Keep a copy of whatever the network just gave us, for the next
        // time there is no network.
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request);
        if (cached) return cached;

        // A navigation with nothing cached still has to render something, or
        // the app looks broken rather than offline.
        if (request.mode === 'navigate') {
          const shell = await caches.match('/');
          if (shell) return shell;
        }
        return new Response('Ni povezave.', {
          status: 503,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
      }),
  );
});
