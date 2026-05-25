const CACHE = 'wc-loyalty-v3';
const PRECACHE = ['/loyalty.html', '/loyalty-icon-192.png', '/loyalty-icon-512.png', '/favicon.png'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
      .then(() => {
        // Tell all open tabs a new version is live
        return self.clients.matchAll({ type: 'window' }).then(list =>
          list.forEach(client => client.postMessage({ type: 'SW_UPDATED' }))
        );
      })
  );
});

self.addEventListener('message', e => {
  if(e.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', e => {
  if (e.request.url.includes('firebase') || e.request.url.includes('googleapis') || e.request.url.includes('gstatic')) {
    return;
  }
  // Network-first: always try to get fresh content, fall back to cache offline
  e.respondWith(
    fetch(e.request).then(res => {
      // Cache successful GET responses for offline fallback
      if(e.request.method === 'GET' && res.status === 200){
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
      }
      return res;
    }).catch(() => caches.match(e.request))
  );
});
