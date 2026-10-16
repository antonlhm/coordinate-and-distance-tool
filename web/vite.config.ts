import { createHash } from 'node:crypto';
import { defineConfig, type Plugin } from 'vite';

// WEB-017: emits sw.js with the exact list of built files, so the whole site is precached on first visit.
function serviceWorker(): Plugin {
  return {
    name: 'emit-service-worker',
    apply: 'build',
    generateBundle(_options, bundle) {
      const files = Object.keys(bundle);
      const hash = createHash('sha256');
      for (const name of files) {
        const item = bundle[name];
        hash.update(name);
        hash.update(item.type === 'chunk' ? item.code : String(item.source));
      }
      const version = hash.digest('hex').slice(0, 10);
      const urls = ['/', '/manifest.webmanifest', '/icon.svg', ...files.map((f) => '/' + f)];
      const source = `const VERSION = ${JSON.stringify(version)};
const CACHE = 'calc-' + VERSION;
const URLS = ${JSON.stringify(urls)};
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(URLS)));
});
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).catch(() => caches.match('/index.html').then((r) => r || caches.match('/'))));
    return;
  }
  event.respondWith(caches.match(req).then((hit) => hit || fetch(req)));
});
`;
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

export default defineConfig({
  plugins: [serviceWorker()],
  build: { target: 'es2022', modulePreload: { polyfill: false }, assetsInlineLimit: 0 },
});
