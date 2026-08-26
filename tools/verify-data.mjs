/**
 * Jalankan lapisan data di Node terhadap sheet asli, lalu cetak angka yang
 * dipakai sebagai acuan verifikasi dashboard.
 *
 *   node tools/verify-data.mjs [--date 2026-08-26]
 *
 * Dipakai untuk memastikan parsing kolom dan turunan datanya benar sebelum ada
 * satu pun piksel UI yang dipercaya.
 */

import { fetchAll } from '../js/data/sheets.js';
import { normalize, BUCKET } from '../js/data/normalize.js';
import { summarize } from '../js/data/analytics.js';
import { CONFIG } from '../js/config.js';

const argDate = process.argv.includes('--date')
  ? new Date(process.argv[process.argv.indexOf('--date') + 1])
  : new Date();

const pad = (s, n) => String(s).padEnd(n);
const line = (label, value) => console.log(`  ${pad(label, 46)} ${value}`);

const { tables, warnings, errors } = await fetchAll(CONFIG.spreadsheetId, { bust: true });

if (errors.length) {
  console.log('\nGAGAL MEMBACA TAB:');
  for (const e of errors) console.log(`  - ${e.tab}: ${e.message}`);
}
if (warnings.length) {
  console.log('\nPERINGATAN PEMETAAN KOLOM:');
  for (const w of new Set(warnings)) console.log(`  - ${w}`);
} else {
  console.log('\nPemetaan kolom: semua field tercocokkan lewat label.');
}

const data = normalize(tables, { today: argDate });
const s = summarize(data);

console.log(`\nTanggal acuan: ${data.today.toDateString()}\n`);

console.log('INVENTORI');
line('Baris lot (Master Stok)', s.totalLots);
line('Reagen unik (Kode)', s.totalReagen);
line('Instalasi', s.instalasiList.join(', '));
line('Total Sisa Stok', s.totalStok);
line('Status AKTIF / TIDAK AKTIF', `${s.aktif} / ${s.tidakAktif}`);

console.log('\nRISIKO KEDALUWARSA');
for (const b of Object.values(BUCKET)) {
  line(`  ${b}`, `${s.buckets[b].count} lot, ${s.buckets[b].qty} unit`);
}

console.log('\nSTOK');
line('Di bawah atau sama dengan Stok Min', s.atOrBelowMin);
line('Stok habis (Sisa = 0)', s.outOfStock);

console.log('\nAUDIT DATA');
line('Kedaluwarsa tapi masih AKTIF', s.audit.expiredButActive.length);
line('Masih berlaku tapi TIDAK AKTIF', s.audit.validButInactive.length);
line('Sisa Stok tidak sama dengan hitungan', s.audit.sisaMismatch.length);
line('Tanpa tanggal kedaluwarsa', s.audit.missingExpiry.length);
line('Tanpa supplier', s.audit.missingSupplier.length);
line('Tanpa nomor lot', s.audit.missingLot.length);
line('Baris transaksi tanpa induk di Master Stok', s.audit.orphans.length);

console.log('\nDOKUMEN (baris penerimaan)');
line('COA tersedia', `${s.docs.coaCount} / ${s.docs.total}  (${s.docs.coaPct}%)`);
line('MSDS tersedia', `${s.docs.msdsCount} / ${s.docs.total}  (${s.docs.msdsPct}%)`);

console.log('\nREKONSILIASI ANTAR TAB');
for (const r of s.reconciliation) {
  line(r.label, `${r.transaksi} vs ${r.master} → ${r.ok ? 'cocok' : 'SELISIH ' + (r.transaksi - r.master)}`);
}

console.log('\nTRANSAKSI');
line('Penerimaan', `${data.receipts.length} baris, ${s.totals.penerimaanQty} unit`);
line('Distribusi', `${data.issues.length} baris, ${s.totals.distribusiQty} unit`);
line('Pemusnahan', `${data.disposals.length} baris, ${s.totals.pemusnahanQty} unit`);
line('Kartu Stok (tab tersembunyi)', `${data.cards.length} baris`);

console.log('\nUJI PARSING TANGGAL (kasus bulan Indonesia)');
const samples = data.lots.filter((l) => l.expDate).slice(0, 3);
for (const l of samples) {
  line(`${l.kode} ${l.lot}`.slice(0, 44), `${l.expDate.toDateString()}  (${l.daysToExpiry} hari)`);
}
const okt = data.lots.find((l) => l.expDate && l.expDate.getMonth() === 9);
const agu = data.issues.find((r) => r.tanggal && r.tanggal.getMonth() === 7);
line('Contoh bulan Okt terparse', okt ? okt.expDate.toDateString() : 'tidak ada');
line('Contoh bulan Agu terparse', agu ? agu.tanggal.toDateString() : 'tidak ada');

console.log('');

console.log('EJAAN TIDAK KONSISTEN');
if (!s.audit.duplicates.length) {
  line('Nilai kembar', 'tidak ada');
} else {
  for (const d of s.audit.duplicates) {
    line(d.fieldLabel, d.variants.map((v) => `"${v.value}" ×${v.count}`).join('  vs  '));
  }
}
line('Total baris berbeda yang perlu dirapikan', s.audit.total);
console.log('');
