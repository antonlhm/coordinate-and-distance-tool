// WEB-022 / W6 / W14: checks the built site in dist/ against the SPEC-WEB rules. Usage: npm run build && npm run check
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { gzipSync } from 'node:zlib';

const dist = new URL('../dist/', import.meta.url).pathname;
const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else files.push(p);
  }
})(dist);

const problems = [];
const rel = (p) => relative(dist, p);
const text = (p) => readFileSync(p, 'utf8');
let total = 0;
let firstLoad = 0;

for (const p of files) {
  const size = statSync(p).size;
  total += size;
  const name = rel(p);
  if (/\.(html|js|css)$/.test(name) && name !== 'sw.js') firstLoad += gzipSync(readFileSync(p)).length;
  if (!/\.(html|js|css|svg|webmanifest)$/.test(name)) continue;
  const src = text(p);

  // No external URLs (the SVG namespace is the only allowed one).
  for (const m of src.matchAll(/https?:\/\/[^\s"'<>)]+/g)) {
    if (!m[0].startsWith('http://www.w3.org/')) problems.push(`${name}: external URL ${m[0]}`);
  }
  if (name.endsWith('.html')) {
    if (/<script(?![^>]*\bsrc=)[^>]*>/i.test(src)) problems.push(`${name}: inline <script>`);
    if (/\sstyle\s*=/.test(src) || /<style/i.test(src)) problems.push(`${name}: inline style`);
  }
  // Forbidden APIs in shipped code (the service worker legitimately uses fetch for its own origin).
  if (name.endsWith('.js') && name !== 'sw.js') {
    for (const api of ['fetch(', 'XMLHttpRequest', 'geolocation', 'sendBeacon', 'WebSocket', 'indexedDB', 'document.cookie']) {
      if (src.includes(api)) problems.push(`${name}: uses ${api}`);
    }
  }
}

if (files.length > 100) problems.push(`${files.length} files (> 100)`);
if (total > 5 * 1024 * 1024) problems.push(`dist is ${total} bytes (> 5 MB)`);
if (firstLoad > 300 * 1024) problems.push(`first load ${firstLoad} bytes gzip (> 300 KB)`);

console.log(`files: ${files.length}, dist: ${(total / 1024).toFixed(1)} KB, first load (gzip): ${(firstLoad / 1024).toFixed(1)} KB`);
if (problems.length) {
  console.error('FAILED:\n' + problems.map((p) => ' - ' + p).join('\n'));
  process.exit(1);
}
console.log('dist checks passed');
