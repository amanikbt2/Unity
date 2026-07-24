/* ============================================================
   UNITY PWA SERVICE WORKER
   ============================================================ */

const CACHE_NAME = 'unity-pwa-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/manifest.json',
  '/admin',
  '/admin/index.html',
  '/icons/icon-192.svg',
  '/icons/icon-512.svg'
];

// 1. INSTALL EVENT — Pre-cache static assets
self.addEventListener('install', (event) => {
  console.log('[SW] Installing Unity Service Worker...');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Pre-caching core static assets...');
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('[SW] Pre-cache partial failure:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// 2. ACTIVATE EVENT — Clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating Unity Service Worker...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => {
            console.log('[SW] Removing old cache:', name);
            return caches.delete(name);
          })
      );
    }).then(() => self.clients.claim())
  );
});

// 3. FETCH EVENT — Intelligent Network-first with Cache Fallback
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Always bypass API calls & external dynamic resources directly to network
  if (
    url.pathname.startsWith('/api/') ||
    url.hostname.includes('gnews.io') ||
    url.hostname.includes('clearbit.com') ||
    url.hostname.includes('unsplash.com') ||
    event.request.method !== 'GET'
  ) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      // Stale-While-Revalidate Strategy for static assets (.css, .js, .svg, fonts)
      const fetchPromise = fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          // If offline and requesting page, return cached index.html
          if (event.request.mode === 'navigate') {
            return caches.match('/index.html') || caches.match('/');
          }
        });

      return cachedResponse || fetchPromise;
    })
  );
});

// 4. PUSH NOTIFICATIONS (Ready for Web Push)
self.addEventListener('push', (event) => {
  let data = { title: 'Unity News', body: 'New update available!' };
  if (event.data) {
    try {
      data = event.data.json();
    } catch (_) {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body,
    icon: '/icons/icon-192.svg',
    badge: '/icons/icon-192.svg',
    vibrate: [100, 50, 100],
    data: { url: data.url || '/' }
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow(event.notification.data.url || '/')
  );
});
