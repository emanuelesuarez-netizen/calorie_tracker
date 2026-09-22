const CACHE_NAME = 'cal-tracker-v1.6.0';
const ASSETS = [
  './',
  './index.html',
  './app.js',
  './manifest.json'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  // Bypassa la cache per le API Gemini e Google Apps Script
  if (e.request.url.includes('generativelanguage.googleapis.com') ||
      e.request.url.includes('script.google.com')) {
    return;
  }

  e.respondWith(
    caches.match(e.request).then((res) => res || fetch(e.request))
  );
});