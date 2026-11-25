const CACHE_NAME = 'quran-v15';
// App-owned data cache: shared with js/app.js for offline Quran text/editions.
const DATA_CACHE_NAME = 'quran-data-v1';
// Relative URLs so the app works on root and sub-paths (e.g. GitHub Pages)
const STATIC_ASSETS = [
  './',
  './index.html',
  './css/styles.css',
  './js/app.js',
  './js/data.js',
  './icons/icon-192.svg',
  './icons/icon-512.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './manifest.json'
];
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async cache => {
      // Add individually so one 404 doesn't fail the whole install
      await Promise.all(
        STATIC_ASSETS.map(async url => {
          try {
            await cache.add(url);
          } catch (e) {
            console.warn('[SW] skip cache:', url);
          }
        })
      );
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys
        // Only retire old app shells. App-managed caches (quran-data-*,
        // quran-audio-*) hold offline text and downloaded recitations.
        .filter(k => /^quran-v\d+$/.test(k) && k !== CACHE_NAME)
        .map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;
  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }

  // Quran JSON: network-first so updates are picked up, with offline fallback
  // from the app-owned data cache (app.js also caches on the very first load,
  // before this SW controls the page).
  if (url.href.includes('quran-api@') || url.hostname === 'api.quran.com') {
    event.respondWith(
      caches.open(DATA_CACHE_NAME).then(async cache => {
        try {
          const response = await fetch(request);
          if (response && response.ok) await cache.put(request, response.clone());
          return response;
        } catch (err) {
          const cached = await cache.match(request);
          if (cached) return cached;
          throw err;
        }
      })
    );
    return;
  }

  // Audio and fonts: audio is cached explicitly by the app in its own cache;
  // here we only handle fonts and icons.
  if (url.hostname.includes('fonts.googleapis.com') || url.hostname.includes('fonts.gstatic.com') || url.hostname.includes('db.onlinewebfonts.com') || url.hostname.includes('cdn.islamic.network')) {
    event.respondWith(
      caches.open(CACHE_NAME).then(cache =>
        cache.match(request).then(cached => {
          const fetched = fetch(request).then(response => {
            if (response && response.ok) cache.put(request, response.clone());
            return response;
          }).catch(() => cached);
          return cached || fetched;
        })
      )
    );
    return;
  }

  // Network-first: updated HTML/JS is never stuck behind an old SW cache.
  // Offline falls back to any cached copy (shell, audio, etc.).
  event.respondWith(
    fetch(request)
      .then(response => {
        if (response && response.ok && url.origin === self.location.origin) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
        }
        return response;
      })
      .catch(() =>
        caches.match(request).then(cached =>
          cached || (request.mode === 'navigate' ? caches.match('./index.html') : Response.error())
        )
      )
  );
});
