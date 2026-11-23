/**
 * Label stiker mini untuk ditempel di botol reagen.
 *
 * Bentuknya meniru kartu stok — identitas lot di atas, ruang tulis tangan di
 * bawah — tapi diperkecil sampai muat di badan botol. Dua ukuran yang diminta
 * Dinda: 6×4 cm dan 5×3 cm.
 *
 * **Kenapa tiga kolom untuk kedua ukuran, bukan empat untuk yang 5 cm.**
 * Empat label 5 cm butuh 200 mm, sementara A4 hanya 210 mm — artinya margin
 * halaman harus ditekan sampai 5 mm, dan banyak pencetak tidak bisa mencetak
 * sedekat itu ke tepi kertas. Kolom terakhirnya akan terpotong di sebagian
 * pencetak dan utuh di sebagian lain, dan tidak akan ada yang tahu sampai
 * stikernya tercetak salah. Tiga kolom dengan margin 8 mm aman di mana pun;
 * yang hilang cuma kerapatan, dan sela antar label justru tempat menggunting.
 *
 * Ukurannya ditulis dalam milimeter, bukan piksel, supaya 6 cm di layar
 * pratinjau benar-benar 6 cm di kertas.
 */

import { el, fmtDate } from './dom.js';
import { piktogramB3 } from './b3.js';
import { bacaB3 } from '../data/b3.js';
import { printDocument } from './export.js';

/**
 * `baris` dihitung dari ruang cetak A4 setelah margin 8 mm (281 mm) dengan
 * sela 2 mm antar label: 6×4 → 6 baris, 5×3 → 8 baris. Kalau tingginya,
 * selanya, atau margin halamannya diubah, hitung ulang angka ini — ia dipakai
 * memberi tahu pengguna berapa lembar yang akan keluar, dan angka yang salah
 * di situ baru ketahuan setelah kertasnya tercetak.
 */
export const UKURAN_LABEL = {
  '6x4': { key: '6x4', nama: '6 × 4 cm', lebar: 60, tinggi: 40, kolom: 3, baris: 6, ikon: 6 },
  '5x3': { key: '5x3', nama: '5 × 3 cm', lebar: 50, tinggi: 30, kolom: 3, baris: 8, ikon: 5 },
};

export const UKURAN_BAKU = '6x4';

export function ukuranLabel(key) {
  return UKURAN_LABEL[key] || UKURAN_LABEL[UKURAN_BAKU];
}

/** Berapa label per lembar A4 pada ukuran ini. */
export function perLembar(ukuran) {
  return ukuran.kolom * ukuran.baris;
}

/**
 * Satu label.
 *
 * Simbol B3 ikut kalau kolom Simbol B3 reagen itu sudah diisi. Kalau belum,
 * tidak ada apa pun di tempatnya — deretan kosong akan terbaca sebagai "sudah
 * diperiksa, tidak berbahaya", dan itu keterangan yang tidak pernah kita
 * punya. Ini aturan yang sama dengan kartu stok.
 */
export function labelEl(lot, ukuranKey = UKURAN_BAKU) {
  const u = ukuranLabel(ukuranKey);
  const kecil = u.key === '5x3';
  const baca = bacaB3(lot.b3);

  const identitas = [lot.kode, lot.lot].filter(Boolean).join(' · ') || 'tanpa kode / lot';
  const suhu = [lot.suhuSimpan, lot.lokasiSimpan].filter(Boolean).join(' · ');

  return el(`div.label.label--${u.key}`, {
    style: { width: `${u.lebar}mm`, height: `${u.tinggi}mm` },
  },
  el('div.label-atas', {},
    el('div.label-teks', {},
      el('div.label-nama', { text: lot.nama || lot.kode || '—', title: lot.nama || '' }),
      el('div.label-id', { text: identitas })),
    baca.kunci.length
      ? el('div.label-b3', {}, ...baca.kunci.slice(0, kecil ? 3 : 4)
        .map((k) => piktogramB3(k, { size: u.ikon, satuan: 'mm' })))
      : null),

  el('div.label-ed', {},
    el('span', { text: `ED ${lot.expDate ? fmtDate(lot.expDate) : '—'}` }),
    !kecil && suhu ? el('span.label-suhu', { text: suhu }) : null),

  // Dua baris yang sengaja dibiarkan kosong: diisi tangan di meja, bukan di
  // dashboard. "Dibuka" adalah tanggal botolnya pertama dipakai — yang
  // menentukan masa simpan setelah dibuka, dan tidak pernah ada di sheet.
  el('div.label-tulis', {},
    el('span.label-isian', {}, el('b', { text: 'Dibuka' }), el('i', {})),
    el('span.label-isian', {}, el('b', { text: 'Isi' }), el('i', {}))));
}

/**
 * Lembar label siap cetak: label disusun grid, dipotong per halaman A4.
 *
 * Pemenggalan halaman diserahkan ke CSS (`break-inside: avoid` per label di
 * dalam grid dengan tinggi tetap), bukan dihitung di sini — satu label tidak
 * pernah boleh terbelah dua halaman, dan aturan CSS itu berlaku juga kalau
 * pengguna mengubah margin di dialog cetak.
 */
export function lembarLabel(lots, ukuranKey = UKURAN_BAKU) {
  const u = ukuranLabel(ukuranKey);
  return el(`div.label-lembar.label-lembar--${u.key}`, {
    style: { gridTemplateColumns: `repeat(${u.kolom}, ${u.lebar}mm)` },
  }, ...lots.map((lot) => labelEl(lot, ukuranKey)));
}

/** Cetak lembar label tanpa mengubah halaman yang sedang dibuka. */
export function cetakLabel(lots, ukuranKey, judul) {
  printDocument(
    lembarLabel(lots, ukuranKey),
    judul || `Label Reagen — ${lots.length} stiker`,
    { kelas: 'label-host' },
  );
}
