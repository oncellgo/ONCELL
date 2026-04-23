// ---------------------------------------------------------------
// KCIS Service Worker — 최소 구현.
// 목적: PWA 설치 조건 충족 (Chrome 'Add to Home Screen' 프롬프트).
// 오프라인 캐시/푸시 알림은 일단 미구현. 필요 시 추후 확장.
// ---------------------------------------------------------------

const CACHE_NAME = 'kcis-static-v1';
const PRECACHE_URLS = [
  '/',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
];

self.addEventListener('install', (event) => {
  // 새 버전 배포 시 즉시 활성화.
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)).catch(() => { /* 실패 무시 */ })
  );
});

self.addEventListener('activate', (event) => {
  // 구 버전 캐시 정리.
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  // API·POST·크로스 오리진은 건드리지 않음.
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  // 네트워크 우선, 실패 시 캐시 fallback (SSR 페이지 포함).
  event.respondWith(
    fetch(req).then((res) => {
      // 2xx 응답만 정적 캐시 업데이트 (동적 페이지도 stale-while-revalidate 형태)
      if (res.ok && (req.destination === 'image' || req.destination === 'style' || req.destination === 'script' || req.destination === 'font')) {
        const clone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, clone)).catch(() => {});
      }
      return res;
    }).catch(() => caches.match(req).then((cached) => cached || caches.match('/')))
  );
});
