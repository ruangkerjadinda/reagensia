/**
 * Bangun data/snapshot.json — data bawaan yang dipakai saat kunjungan pertama
 * sebelum jaringan menjawab, dan saat dashboard dibuka tanpa jaringan sama
 * sekali.
 *
 *   node tools/build-snapshot.mjs
 *
 * Isinya diambil lewat jalur baca yang sama dengan yang dipakai peramban, jadi
 * bentuknya dijamin identik dengan isi cache.
 */

import { writeFile } from 'node:fs/promises';
import { fetchAll } from '../js/data/sheets.js';
import { CONFIG } from '../js/config.js';

function replacer(key, value) {
  return this[key] instanceof Date ? { __date: this[key].toISOString() } : value;
}

const { tables, errors } = await fetchAll(CONFIG.spreadsheetId, { bust: true });

if (errors.length) {
  console.error('Gagal membaca sebagian tab:');
  for (const e of errors) console.error(`  - ${e.tab}: ${e.message}`);
  process.exit(1);
}

// Baris kosong di ekor sheet ikut terbawa gviz dan tidak berguna sebagai data
// bawaan; membuangnya memangkas berkas ini sekitar tiga perempatnya.
const hasIdentity = (r) => Boolean(r.kode || r.nama || r.instalasi);
const trimmed = Object.fromEntries(
  Object.entries(tables).map(([key, rows]) => [key, (rows || []).filter(hasIdentity)]),
);

const payload = {
  spreadsheetId: CONFIG.spreadsheetId,
  fetchedAt: new Date().toISOString(),
  note: 'Data bawaan hasil ekspor otomatis. Jalankan `npm run snapshot` untuk memperbaruinya.',
  tables: trimmed,
};

await writeFile('data/snapshot.json', JSON.stringify(payload, replacer, 0), 'utf8');

const counts = Object.entries(trimmed).map(([k, v]) => `${k}=${v?.length ?? 0}`).join(' · ');
console.log(`data/snapshot.json ditulis — ${counts}`);
