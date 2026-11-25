const CACHE = 'flex-paint-v20';
const ASSETS = ['./', './index.html', './styles.css?v=20', './app.js?v=20', './voice-recognition.js?v=20', './voice-worker.js?v=20', './manifest.webmanifest', './icon.svg'];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const isDocument = request.mode === 'navigate' || request.destination === 'document';
  if (isDocument) {
    event.respondWith(
      fetch(request)
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE).then(cache => cache.put('./index.html', copy)).catch(() => {});
          return response;
        })
        .catch(() => caches.match(request).then(hit => hit || caches.match('./index.html')))
    );
    return;
  }
  event.respondWith(caches.match(request).then(hit => hit || fetch(request)));
});
