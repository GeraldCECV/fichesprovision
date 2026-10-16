import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const root = new URL('../dist/', import.meta.url);
const assets = (await readdir(new URL('assets/', root))).map((name) => `/assets/${name}`);
const urls = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/logo_ypocamp.jpeg',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
  ...assets,
];
const template = await readFile(new URL('./sw-template.js', import.meta.url), 'utf8');
const hash = createHash('sha256').update(template);
for (const url of urls)
  hash.update(await readFile(new URL(url === '/' ? 'index.html' : url.slice(1), root)));
await writeFile(
  new URL('sw.js', root),
  template
    .replace('__VERSION__', hash.digest('hex').slice(0, 16))
    .replace('__PRECACHE__', JSON.stringify(urls)),
);
