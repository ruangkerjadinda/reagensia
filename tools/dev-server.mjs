/**
 * Server statis untuk pengembangan.
 *
 *   node tools/dev-server.mjs [port]
 *
 * Semua respons dikirim dengan `Cache-Control: no-store`. Tanpa itu peramban
 * menyimpan modul JavaScript dengan aturan heuristiknya sendiri, dan perubahan
 * kode bisa tidak terlihat berkali-kali muat ulang — kegagalan yang menyesatkan
 * karena berkas di disk sudah benar.
 */

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PORT = Number(process.argv[2] || 8080);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.md': 'text/markdown; charset=utf-8',
};

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  let path = decodeURIComponent(url.pathname);
  if (path.endsWith('/')) path += 'index.html';

  // Tolak lompatan keluar folder proyek.
  const target = join(ROOT, normalize(path));
  if (!target.startsWith(ROOT)) {
    res.writeHead(403).end('Terlarang');
    return;
  }

  try {
    const info = await stat(target);
    if (info.isDirectory()) throw new Error('direktori');
    const body = await readFile(target);
    res.writeHead(200, {
      'Content-Type': TYPES[extname(target).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store, must-revalidate',
      'Content-Length': body.length,
    });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end('404 — tidak ditemukan');
  }
}).listen(PORT, () => {
  console.log(`Reagensia berjalan di http://localhost:${PORT}`);
  console.log('Cache-Control: no-store — perubahan berkas langsung terlihat setelah muat ulang.\n');
});
