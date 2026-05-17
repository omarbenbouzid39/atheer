/**
 * sw.js — Service Worker لـ بصير PWA
 */

const CACHE_NAME  = 'baseer-v1';
const STATIC_URLS = [
  '/',
  '/index.html',
  '/login.html',
  '/upload.html',
  '/profile.html',
  '/search.html',
  '/style.css',
  '/api.js',
  '/manifest.json',
  '/favicon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  'https://unpkg.com/lucide@latest/dist/umd/lucide.min.js',
  'https://fonts.googleapis.com/css2?family=Tajawal:wght@300;400;500;700&family=Space+Mono:wght@400;700&display=swap',
];

// ── Install: cache الملفات الأساسية ──────────────────────────────────────────
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return Promise.allSettled(
        STATIC_URLS.map(url => cache.add(url).catch(() => {}))
      );
    }).then(() => self.skipWaiting())
  );
});

// ── Activate: حذف الـ cache القديم ───────────────────────────────────────────
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: استراتيجية Network-first للـ API، Cache-first للـ assets ──────────
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // API requests: دائماً من الشبكة
  if (url.pathname.startsWith('/api/')) {
    e.respondWith(
      fetch(e.request).catch(() =>
        new Response(JSON.stringify({ error: 'أنت غير متصل بالإنترنت' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' }
        })
      )
    );
    return;
  }

  // Videos/media: network only (لا نكيّش الفيديوهات)
  if (url.pathname.match(/\.(mp4|mov|webm|avi)$/i) || url.hostname.includes('cloudinary')) {
    e.respondWith(fetch(e.request));
    return;
  }

  // كل شيء آخر: Cache-first ثم Network
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        // كيّش الصفحات والـ assets فقط
        if (res.ok && (e.request.destination === 'document' || e.request.destination === 'style' || e.request.destination === 'script')) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        }
        return res;
      }).catch(() => caches.match('/index.html'));
    })
  );
});
