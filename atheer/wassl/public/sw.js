// ══════════════════════════════════════════
// وَصْل — Service Worker
// Strategy: Cache First for assets, Network First for API/socket
// ══════════════════════════════════════════

const SW_VERSION   = 'wasl-v1.2';
const STATIC_CACHE = `${SW_VERSION}-static`;
const DYNAMIC_CACHE = `${SW_VERSION}-dynamic`;
const OFFLINE_PAGE  = '/offline.html';

// ── Files to cache on install ──
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/chat.html',
  '/home.html',
  '/blog.html',
  '/about.html',
  '/contact.html',
  '/privacy.html',
  '/style.css',
  '/script.js',
  '/lobby.js',
  '/chat.js',
  '/shared.js',
  '/shared-pages.css',
  '/logo.png',
  '/logo.mp4',
  '/manifest.json',
  '/offline.html',
  'https://fonts.googleapis.com/css2?family=Tajawal:wght@300;400;500;700&family=JetBrains+Mono:wght@400;500&display=swap'
];

// ── Install: pre-cache static assets ──
self.addEventListener('install', event => {
  console.log(`[SW] Installing ${SW_VERSION}`);
  event.waitUntil(
    caches.open(STATIC_CACHE).then(cache => {
      return cache.addAll(
        STATIC_ASSETS.map(url => new Request(url, { cache: 'reload' }))
      ).catch(err => {
        console.warn('[SW] Some assets failed to cache:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// ── Activate: clean old caches ──
self.addEventListener('activate', event => {
  console.log(`[SW] Activating ${SW_VERSION}`);
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== STATIC_CACHE && key !== DYNAMIC_CACHE)
          .map(key => {
            console.log(`[SW] Deleting old cache: ${key}`);
            return caches.delete(key);
          })
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: smart routing ──
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip: Socket.io, API calls, Chrome extensions, POST requests
  if (
    url.pathname.startsWith('/socket.io') ||
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/upload') ||
    url.pathname.startsWith('/uploads/') ||
    url.pathname.startsWith('/admin') ||
    request.method !== 'GET' ||
    url.protocol === 'chrome-extension:'
  ) {
    return; // let browser handle it normally
  }

  // HTML pages → Network First (always fresh), fallback to cache, then offline
  if (request.headers.get('Accept')?.includes('text/html') || url.pathname.endsWith('.html') || url.pathname === '/') {
    event.respondWith(networkFirstHTML(request));
    return;
  }

  // Static assets (CSS, JS, images, fonts) → Cache First
  if (
    url.pathname.match(/\.(css|js|png|jpg|jpeg|gif|webp|svg|woff2?|ttf|ico|mp4|webm)$/) ||
    url.origin === 'https://fonts.googleapis.com' ||
    url.origin === 'https://fonts.gstatic.com'
  ) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Everything else → Network First
  event.respondWith(networkFirst(request));
});

// ── Strategy: Network First for HTML ──
async function networkFirstHTML(request) {
  try {
    const networkRes = await fetch(request);
    if (networkRes.ok) {
      const cache = await caches.open(DYNAMIC_CACHE);
      cache.put(request, networkRes.clone());
    }
    return networkRes;
  } catch (_) {
    const cached = await caches.match(request);
    if (cached) return cached;
    // Return offline page for navigation requests
    const offline = await caches.match(OFFLINE_PAGE);
    return offline || new Response('<h1>غير متصل بالإنترنت</h1>', {
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });
  }
}

// ── Strategy: Cache First ──
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const networkRes = await fetch(request);
    if (networkRes.ok) {
      const cache = await caches.open(STATIC_CACHE);
      cache.put(request, networkRes.clone());
    }
    return networkRes;
  } catch (_) {
    return new Response('', { status: 503 });
  }
}

// ── Strategy: Network First ──
async function networkFirst(request) {
  try {
    const networkRes = await fetch(request);
    if (networkRes.ok) {
      const cache = await caches.open(DYNAMIC_CACHE);
      cache.put(request, networkRes.clone());
    }
    return networkRes;
  } catch (_) {
    const cached = await caches.match(request);
    return cached || new Response('', { status: 503 });
  }
}

// ── Background Sync message ──
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
  if (event.data?.type === 'GET_VERSION') {
    event.ports[0]?.postMessage({ version: SW_VERSION });
  }
});
