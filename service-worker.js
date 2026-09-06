const CACHE_NAME = 'fuzio-capture-dashboard-v3';
const APP_SHELL = [
    '/capture-dashboard.html',
    '/capture-login.html',
    '/manifest.webmanifest',
    '/assets/styles.css',
    '/assets/capture-dashboard.js',
    '/assets/capture-login.js',
    '/assets/firebase.js',
    '/assets/install-dashboard.js',
    '/assets/images/Fuzio logo.jpg'
];

self.addEventListener('install', (event) => {
    event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((names) => Promise.all(
            names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name))
        ))
    );
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);
    if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;

    if (event.request.mode === 'navigate') {
        event.respondWith(
            fetch(event.request)
                .then((response) => {
                    const copy = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
                    return response;
                })
                .catch(async () => (await caches.match(event.request)) || caches.match('/capture-dashboard.html'))
        );
        return;
    }

    // Code assets must be network-first: a cache-first copy can pin stale JS/CSS
    // against freshly deployed HTML and break the page.
    if (/\.(?:js|css|webmanifest)$/i.test(url.pathname)) {
        event.respondWith(
            fetch(event.request)
                .then((response) => {
                    const copy = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
                    return response;
                })
                .catch(() => caches.match(event.request))
        );
        return;
    }

    event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request)));
});