/* eslint-disable no-restricted-globals */

// This is the service worker template that workbox will inject the manifest into
// The self.__WB_MANIFEST placeholder will be replaced with the actual manifest

import { clientsClaim } from 'workbox-core';
import { ExpirationPlugin } from 'workbox-expiration';
import { precacheAndRoute, createHandlerBoundToURL } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { CacheFirst, StaleWhileRevalidate, NetworkFirst, NetworkOnly } from 'workbox-strategies';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';
import { BackgroundSyncPlugin } from 'workbox-background-sync';

clientsClaim();

// This must be present for workbox to inject the manifest
// eslint-disable-next-line no-undef
precacheAndRoute(self.__WB_MANIFEST);

// App Shell routing - handle navigation requests
// Since index.html is excluded from precaching, we use NetworkFirst strategy
const fileExtensionRegexp = new RegExp('/[^/?]+\\.[^/]+$');
registerRoute(
  ({ request, url }) => {
    if (request.mode !== 'navigate') return false;
    if (url.pathname.startsWith('/_')) return false;
    if (url.pathname.match(fileExtensionRegexp)) return false;
    return true;
  },
  new NetworkFirst({
    cacheName: 'html-cache',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 1, maxAgeSeconds: 60 }), // Cache for 1 minute only
    ],
  })
);

// Static assets - Stale While Revalidate (always check for updates)
registerRoute(
  ({ request }) => request.destination === 'script' || request.destination === 'style',
  new StaleWhileRevalidate({
    cacheName: 'static-assets',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 60, maxAgeSeconds: 7 * 24 * 60 * 60 }), // 7 days
    ],
  })
);

// Images - Cache First
registerRoute(
  ({ request }) => request.destination === 'image',
  new CacheFirst({
    cacheName: 'images',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: 60 * 24 * 60 * 60 }),
    ],
  })
);

// Fonts - Cache First
registerRoute(
  ({ request }) => request.destination === 'font',
  new CacheFirst({
    cacheName: 'fonts',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 20, maxAgeSeconds: 365 * 24 * 60 * 60 }),
    ],
  })
);

// API Documents - Stale While Revalidate
registerRoute(
  ({ url }) => url.pathname === '/api/documents',
  new StaleWhileRevalidate({
    cacheName: 'api-documents',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 1, maxAgeSeconds: 5 * 60 }),
    ],
  })
);

// API Stats - Stale While Revalidate
registerRoute(
  ({ url }) => url.pathname === '/api/documents/stats',
  new StaleWhileRevalidate({
    cacheName: 'api-stats',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 1, maxAgeSeconds: 5 * 60 }),
    ],
  })
);

// API Health - Network First
registerRoute(
  ({ url }) => url.pathname.startsWith('/api/health'),
  new NetworkFirst({
    cacheName: 'api-health',
    networkTimeoutSeconds: 3,
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 1, maxAgeSeconds: 60 }),
    ],
  })
);

// API Search - Network First
registerRoute(
  ({ url }) => url.pathname === '/api/search',
  new NetworkFirst({
    cacheName: 'api-search',
    networkTimeoutSeconds: 10,
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 50, maxAgeSeconds: 24 * 60 * 60 }),
    ],
  })
);

// API Threads - Stale While Revalidate
registerRoute(
  ({ url }) => url.pathname === '/api/threads' || url.pathname.startsWith('/api/threads/'),
  new StaleWhileRevalidate({
    cacheName: 'api-threads',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 20, maxAgeSeconds: 60 * 60 }),
    ],
  })
);

// Background Sync for uploads
const bgSyncPlugin = new BackgroundSyncPlugin('uploadQueue', { maxRetentionTime: 24 * 60 });
registerRoute(
  ({ url }) => url.pathname === '/api/upload',
  new NetworkOnly({ plugins: [bgSyncPlugin] }),
  'POST'
);

// Message handler
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  // Handle cache clearing
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => caches.delete(cacheName))
        ).then(() => {
          return { success: true };
        });
      })
    );
  }
  
  // Handle cache size request
  if (event.data && event.data.type === 'GET_CACHE_SIZE') {
    event.waitUntil(
      caches.keys().then(async (cacheNames) => {
        let totalSize = 0;
        for (const cacheName of cacheNames) {
          const cache = await caches.open(cacheName);
          const keys = await cache.keys();
          for (const request of keys) {
            const response = await cache.match(request);
            if (response) {
              const blob = await response.blob();
              totalSize += blob.size;
            }
          }
        }
        return { size: totalSize };
      })
    );
  }
});

// Activate new service worker immediately
self.addEventListener('install', (event) => {
  // Force immediate activation
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      // Take control of all clients immediately
      self.clients.claim(),
      // Clean up ALL old caches on activation to prevent stale content
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            // Delete all caches except the current workbox precache
            if (!cacheName.startsWith('workbox-precache')) {
              console.log('Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
    ]).then(() => {
      console.log('Service worker activated and caches cleaned');
      // Force reload all clients to get fresh content
      return self.clients.matchAll({ type: 'window' }).then(clients => {
        clients.forEach(client => {
          client.postMessage({ type: 'CACHE_CLEARED' });
        });
      });
    })
  );
});

// Push notifications
self.addEventListener('push', (event) => {
  if (!event.data) return;
  const data = event.data.json();
  event.waitUntil(
    self.registration.showNotification(data.title || 'Second Brain', {
      body: data.body || 'New update available',
      icon: '/icons/icon-192x192.png',
      badge: '/icons/badge-72x72.png',
      data: { url: data.url || '/' },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const urlToOpen = event.notification.data?.url || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if (client.url === urlToOpen && 'focus' in client) return client.focus();
      }
      return self.clients.openWindow(urlToOpen);
    })
  );
});
