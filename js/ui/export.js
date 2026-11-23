/** Unduh CSV dan cetak. */

import { fmtDate } from './dom.js';

function cell(value) {
  if (value == null) return '';
  if (value instanceof Date) return fmtDate(value);
  const s = String(value);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Ekspor persis baris yang sedang tampil, dalam urutan yang sedang tampil. */
export function downloadCsv(filename, columns, rows, valueOf) {
  const header = columns.map((c) => cell(c.label)).join(';');
  const body = rows.map((row) => columns
    .map((c) => cell(c.csv ? c.csv(row) : (valueOf ? valueOf(row, c) : row[c.key])))
    .join(';'));

  // BOM supaya Excel di Windows membaca UTF-8 dengan benar; pemisah titik koma
  // mengikuti kebiasaan Excel berlokal Indonesia.
  download(new Blob(['\uFEFF', [header, ...body].join('\r\n')], { type: 'text/csv;charset=utf-8' }), filename);
}

export function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function copyText(text) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  return Promise.reject(new Error('Papan klip tidak tersedia.'));
}

/**
 * Cetak satu dokumen lepas — berita acara, laporan, lembar label.
 *
 * Dokumen itu **menggantikan** halaman yang sedang dibuka, bukan menumpuk di
 * bawahnya. Tanpa penanda `sedang-cetak` di `<body>`, aturan `@media print`
 * hanya menyembunyikan kerangka (sidebar, topbar, tombol) sementara kartu-kartu
 * halamannya tetap ikut tercetak — dokumen yang mau ditandatangani baru muncul
 * di halaman kedua, di bawah tangkapan dashboard. Itu tidak kelihatan sama
 * sekali di layar, hanya di kertas.
 *
 * Host-nya dibuang lagi di `afterprint`, yang juga menyala kalau dialog
 * cetaknya dibatalkan.
 */
export function printDocument(isi, title, { kelas = '' } = {}) {
  const host = document.createElement('div');
  host.id = 'print-host';
  host.className = `print-only${kelas ? ` ${kelas}` : ''}`;
  host.append(isi);

  document.body.append(host);
  document.body.classList.add('sedang-cetak');

  const bersihkan = () => {
    host.remove();
    document.body.classList.remove('sedang-cetak');
    window.removeEventListener('afterprint', bersihkan);
  };
  window.addEventListener('afterprint', bersihkan);
  printWithTitle(title);
}

/** Judul dokumen cetak; dipulihkan lagi setelah dialog cetak ditutup. */
export function printWithTitle(title) {
  const original = document.title;
  document.title = title;
  const restore = () => {
    document.title = original;
    window.removeEventListener('afterprint', restore);
  };
  window.addEventListener('afterprint', restore);
  window.print();
}
