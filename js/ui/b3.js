/**
 * Piktogram B3 (GHS) — belah ketupat merah, digambar sendiri sebagai SVG.
 *
 * Kenapa digambar sendiri dan bukan diambil dari CDN atau font ikon: aturan
 * proyek ini tidak memakai CDN sama sekali, dan simbol bahaya adalah hal
 * terakhir yang boleh gagal muat. Kalau gambarnya tidak datang, yang hilang
 * bukan hiasan — yang hilang adalah peringatan.
 *
 * Bentuknya sengaja tebal dan sederhana. Simbol ini dipakai di dua tempat yang
 * keduanya kecil: kartu stok cetak dan label botol 6x4 cm. Gambar yang akurat
 * tapi rapat jadi bubur di ukuran 8 mm; siluet tegas masih terbaca.
 *
 * Setiap piktogram selalu tampil **bersama namanya sebagai teks** (atribut
 * title dan, di label, tulisan di bawahnya). Warna dan bentuk saja tidak cukup:
 * yang membaca label bisa saja buta warna, dan kartu bisa difotokopi
 * hitam-putih.
 */

import { NAMA_B3 } from '../data/b3.js';

const DIAMOND = 'M50 3 L97 50 L50 97 L3 50 Z';

/** Isi tiap piktogram, digambar di dalam kotak 100x100 yang sama. */
const GAMBAR = {
  terbakar: {
    isi: '<path d="M46 17c7 12 1 17 8 23 5 4 10 1 12-5 7 11 4 27-7 33-10 6-25 2-28-10-3-11 7-17 8-25 1-6 2-12 7-16z"/>'
       + '<path d="M26 76h48v6H26z"/>',
  },
  oksidator: {
    isi: '<circle cx="50" cy="62" r="18" fill="none" stroke="#111" stroke-width="7"/>'
       + '<path d="M50 20c3 8 11 12 9 20-1 6-5 9-9 11-5-2-9-6-9-11 0-5 4-8 4-12 1 2 3 1 4-2 1 3 1 5 1-6z"/>',
  },
  meledak: {
    isi: '<circle cx="48" cy="60" r="16"/>'
       + '<path d="M62 48l12-12M58 42l5-14M70 56l14-5" stroke="#111" stroke-width="6" stroke-linecap="round" fill="none"/>'
       + '<path d="M30 40l-8-6M34 32l-3-9" stroke="#111" stroke-width="5" stroke-linecap="round" fill="none"/>',
  },
  gas: {
    isi: '<rect x="38" y="34" width="24" height="44" rx="11"/>'
       + '<rect x="45" y="22" width="10" height="14" rx="3"/>'
       + '<rect x="33" y="44" width="34" height="5" fill="#fff"/>',
  },
  korosif: {
    isi: '<path d="M14 29l21-9 5 11-21 9z"/><path d="M31 37l7 21-6 1-5-20z"/>'
       + '<path d="M10 62h32l-5 9H14z"/>'
       + '<path d="M86 29L65 20l-5 11 21 9z"/><path d="M69 37l-7 21 6 1 5-20z"/>'
       + '<path d="M55 68c7-6 18-7 27-2l4 7H56z"/>',
  },
  toksik: {
    isi: '<path d="M26 72l44-26 4 7-44 26zM30 46l44 26-4 7-44-26z" />'
       + '<path d="M50 20c-11 0-19 8-19 18 0 7 4 12 8 15v6h22v-6c4-3 8-8 8-15 0-10-8-18-19-18z"/>'
       + '<circle cx="43" cy="39" r="4.5" fill="#fff"/><circle cx="57" cy="39" r="4.5" fill="#fff"/>'
       + '<path d="M50 45l-3 6h6z" fill="#fff"/>',
  },
  iritan: {
    isi: '<path d="M45 26h10l-2.5 34h-5z"/><circle cx="50" cy="70" r="5.5"/>',
  },
  kesehatan: {
    isi: '<circle cx="50" cy="31" r="9"/>'
       + '<path d="M34 46c0-4 7-7 16-7s16 3 16 7v32H34z"/>'
       + '<path d="M50 50l4 9 9-3-6 8 6 8-9-3-4 9-4-9-9 3 6-8-6-8 9 3z" fill="#fff"/>',
  },
  lingkungan: {
    isi: '<rect x="14" y="58" width="72" height="5" rx="2"/>'
       + '<path d="M28 58V30" stroke="#111" stroke-width="6" stroke-linecap="round" fill="none"/>'
       + '<path d="M28 40l-10-9M28 46l10-10M28 34l7-8" stroke="#111" stroke-width="5" stroke-linecap="round" fill="none"/>'
       + '<path d="M50 76c7-7 19-7 26 0-7 7-19 7-26 0z"/>'
       + '<path d="M50 76l-9-6v12z"/>'
       + '<path d="M66 72l4 4-4 4-4-4z" fill="#fff"/>',
  },
};

/** Satu piktogram sebagai elemen SVG. `size` dalam px; di cetak dipakai mm. */
export function piktogramB3(kunci, { size = 22, satuan = 'px' } = {}) {
  const g = GAMBAR[kunci];
  if (!g) return null;
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('width', `${size}${satuan}`);
  svg.setAttribute('height', `${size}${satuan}`);
  svg.setAttribute('class', 'b3-ikon');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', NAMA_B3[kunci]);
  svg.innerHTML = `<title>${NAMA_B3[kunci]}</title>`
    + `<path d="${DIAMOND}" fill="#fff" stroke="#d8252a" stroke-width="7" stroke-linejoin="round"/>`
    + `<g fill="#111">${g.isi}</g>`;
  return svg;
}

export { NAMA_B3, SEMUA_B3, bacaB3 } from '../data/b3.js';
