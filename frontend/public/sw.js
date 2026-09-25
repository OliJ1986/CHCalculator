const CACHE_NAME = 'chill-m0.1-v2'
const APP_SHELL = ['/', '/manifest.webmanifest', '/app-icon.svg']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return
  const requestUrl = new URL(event.request.url)
  if (requestUrl.pathname.startsWith('/api/')) return
  event.respondWith(caches.match(event.request).then((cached) => cached ?? fetch(event.request).then((response) => {
    const copy = response.clone()
    void caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy))
    return response
  })))
})
