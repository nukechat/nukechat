const CACHE = 'nuke-chat-v51';
const FILES = ['./', 'index.html', 'css/style.css', 'js/vendor/qrcode.js', 'js/vendor/jsqr.js', 'js/crypto.js', 'js/i18n.js', 'js/core.js', 'js/share.js', 'js/webrtc.js', 'js/chat.js', 'js/quickchat.js', 'js/room.js', 'js/replies.js', 'js/calls.js', 'js/draw.js', 'js/mobile.js', 'js/portable.js', 'js/main.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET' || u.origin !== location.origin) return;
  e.respondWith(fetch(r, { cache: 'no-cache' }).then(res => { if (res.ok) { const cp = res.clone(); caches.open(CACHE).then(c => c.put(r, cp)); } return res; }).catch(() => caches.match(r, { ignoreSearch: true }).then(m => m || caches.match('index.html'))));
});
