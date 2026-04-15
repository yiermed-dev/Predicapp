// ─────────────────────────────────────────────
//  sw.js  —  Service Worker  PredicApp v3.0
//  Estrategia: Cache First → Network → Offline
// ─────────────────────────────────────────────

const CACHE_NAME = 'predicapp-v3.0';

const PRECACHE_ASSETS = [
  './',
  './index.html',
  './app.js',
  './ui.js',
  './db.js',
  './config.js',
  './auth.js',
  './reservations.js',
  './reports.js',
  './toast.js',
  './style.css',
  './manifest.json',
  './assets/icons/icon-192x192.png',
  './assets/icons/icon-512x512.png'
];

// URLs que NO pasan por el SW — Firebase y fuentes externas
// manejan su propio cache / persistencia
const BYPASS_PATTERNS = [
  'firestore.googleapis.com',
  'firebase.googleapis.com',
  'identitytoolkit.googleapis.com',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'gstatic.com/firebasejs',
  'cdnjs.cloudflare.com'   // jsPDF CDN
];

// ── Instalación ───────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_ASSETS))
      .then(() => self.skipWaiting())
      .catch(err => console.error('[SW] Pre-caché fallido:', err))
  );
});

// ── Activación: eliminar cachés antiguas ──────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => {
            console.log('[SW] Eliminando caché antigua:', key);
            return caches.delete(key);
          })
      ))
      .then(() => clients.claim())
  );
});

// ── Fetch ─────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;

  // Solo interceptar GET
  if (request.method !== 'GET') return;

  // No interceptar URLs de desarrollo
  if (_isDev(request.url)) return;

  // No interceptar Firebase, fuentes ni CDNs externos
  if (_isBypass(request.url)) return;

  event.respondWith(_handleFetch(request));
});

async function _handleFetch(request) {
  // 1. Cache first
  const cached = await caches.match(request);
  if (cached) return cached;

  // 2. Red
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // 3. Offline fallback — devuelve index.html para que la app
    //    arranque desde el cache y muestre el badge "Sin conexión"
    const fallback = await caches.match('./index.html');
    return fallback ?? new Response('Sin conexión', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  }
}

function _isDev(url) {
  return url.includes('localhost') ||
         url.includes('127.0.0.1') ||
         url.includes('chrome-extension');
}

function _isBypass(url) {
  return BYPASS_PATTERNS.some(p => url.includes(p));
}
