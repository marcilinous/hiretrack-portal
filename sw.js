const CACHE = 'hiretrack-v5';

const SHELL = [
  '/index.html',
  '/jobs.html',
  '/profile.html',
  '/login.html',
  '/signup.html',
  '/job-alerts.html',
  '/style.css',
  '/mobile.css',
  '/js/browse-jobs.js',
  '/js/chat.js',
  '/icons/icon.svg',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Allow app.js to force-activate a waiting service worker
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', event => {
  const { request } = event;

  // Only handle GET requests for same origin
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== location.origin) return;

  // Never cache: API routes, Supabase, payment endpoints
  if (url.pathname.startsWith('/api/')) return;

  // Network-first for ALL JS files to prevent stale code
  if (url.pathname.endsWith('.js')) {
    event.respondWith(
      fetch(request)
        .then(resp => {
          if (resp.ok) {
            const copy = resp.clone();
            caches.open(CACHE).then(c => c.put(request, copy));
          }
          return resp;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  const isStaticAsset = /\.(css|js|svg|png|jpg|jpeg|webp|woff2?|ico|json)$/.test(url.pathname);

  if (isStaticAsset) {
    // Cache-first: serve from cache, fetch + update in background
    event.respondWith(
      caches.match(request).then(cached => {
        const network = fetch(request).then(resp => {
          if (resp.ok) {
            const copy = resp.clone();
            caches.open(CACHE).then(c => c.put(request, copy));
          }
          return resp;
        });
        return cached || network;
      })
    );
  } else {
    // Network-first for HTML pages: fresh content when online, cache fallback when offline
    event.respondWith(
      fetch(request)
        .then(resp => {
          if (resp.ok) {
            const copy = resp.clone();
            caches.open(CACHE).then(c => c.put(request, copy));
          }
          return resp;
        })
        .catch(() => caches.match(request) || caches.match('/index.html'))
    );
  }
});
