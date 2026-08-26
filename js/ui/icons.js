/**
 * Set ikon garis, digambar inline sebagai SVG.
 *
 * Sebelumnya navigasi memakai karakter Unicode (▦ ▤ ⏳ ⚠) sebagai ikon
 * sementara. Bentuknya berbeda-beda di tiap sistem, ketebalannya tidak selaras
 * dengan teks di sebelahnya, dan hasilnya terlihat seperti tempelan. Ikon di
 * sini memakai satu ketebalan garis dan satu kotak ukuran, mewarisi warna
 * teksnya, dan tidak menambah satu pun permintaan jaringan.
 */

const NS = 'http://www.w3.org/2000/svg';

/** Semua jalur digambar dalam kotak 24×24 dengan ketebalan garis yang sama. */
const PATHS = {
  dashboard: ['M4 4h6v7H4z', 'M14 4h6v4h-6z', 'M14 12h6v8h-6z', 'M4 15h6v5H4z'],
  inventori: ['M20 8.5v7a2 2 0 0 1-1 1.73l-6 3.5a2 2 0 0 1-2 0l-6-3.5A2 2 0 0 1 4 15.5v-7a2 2 0 0 1 1-1.73l6-3.5a2 2 0 0 1 2 0l6 3.5A2 2 0 0 1 20 8.5z', 'm4.3 7.5 7.7 4.5 7.7-4.5', 'M12 21v-9'],
  kadaluarsa: ['M12 21a9 9 0 1 0-9-9', 'M12 7.5V12l3 1.8', 'm3 8.5 1 3.5 3.5-1'],
  stok: ['M4 20h16', 'M6.5 20v-6', 'M12 20V7', 'M17.5 20v-9'],
  alert: ['M10.6 4.2 3.3 17a1.6 1.6 0 0 0 1.4 2.4h14.6a1.6 1.6 0 0 0 1.4-2.4L13.4 4.2a1.6 1.6 0 0 0-2.8 0z', 'M12 9.5v4', 'M12 16.6h.01'],
  audit: ['M9.5 4H8a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-1.5', 'M9.5 2.8h5V5h-5z', 'm9.3 13.2 1.9 1.9 3.5-3.9'],
  transaksi: ['M16.5 4.5 20 8l-3.5 3.5', 'M20 8H8.5a4 4 0 0 0-4 4', 'M7.5 19.5 4 16l3.5-3.5', 'M4 16h11.5a4 4 0 0 0 4-4'],
  dokumen: ['M13.5 3H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7.5z', 'M13.5 3v4.5H18', 'M9.5 13h5', 'M9.5 16.5h5'],
  kartustok: ['M4 5.5h16v13H4z', 'M4 10h16', 'M9.5 10v8.5'],
  pengaturan: ['M4 7h16', 'M4 12h16', 'M4 17h16'],
  pengaturanDots: ['M9 7a1.6 1.6 0 1 0 0-.01', 'M15 12a1.6 1.6 0 1 0 0-.01', 'M8 17a1.6 1.6 0 1 0 0-.01'],

  cari: ['M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z', 'm20 20-3.9-3.9'],
  segarkan: ['M20 12a8 8 0 1 1-2.3-5.7', 'M20 4v5h-5'],
  tutup: ['M17.5 6.5 6.5 17.5', 'm6.5 6.5 11 11'],
  keluar: ['M14 4h6v6', 'M20 4 12 12', 'M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10'],
  unduh: ['M12 4v10', 'm8 11 4 4 4-4', 'M5 20h14'],
  cetak: ['M7 9V4h10v5', 'M7 17.5H5.5A1.5 1.5 0 0 1 4 16v-4.5A1.5 1.5 0 0 1 5.5 10h13a1.5 1.5 0 0 1 1.5 1.5V16a1.5 1.5 0 0 1-1.5 1.5H17', 'M7 14h10v6H7z'],
  salin: ['M9.5 9.5h9a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1z', 'M5.5 14.5h-1a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v1'],
  tambah: ['M12 5.5v13', 'M5.5 12h13'],
  menu: ['M4 7h16', 'M4 12h16', 'M4 17h16'],
  kembali: ['m14 18-6-6 6-6'],
  info: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M12 16.5v-5', 'M12 8h.01'],
  centang: ['m19 6.5-9.5 11L5 13'],
  silang: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'm14.8 9.2-5.6 5.6', 'm9.2 9.2 5.6 5.6'],
  penerimaan: ['M21 12h-5l-1.6 2.4H9.6L8 12H3', 'm6 5.6-3 6.4V18a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-6l-3-6.4A2 2 0 0 0 16.2 4.4H7.8A2 2 0 0 0 6 5.6z'],
  distribusi: ['M20.5 3.5 11 13', 'M20.5 3.5 14.5 20.5 11 13l-7.5-3.5z'],
  pemusnahan: ['M4 6.5h16', 'M9 6.5v-2h6v2', 'M18 6.5V19a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V6.5'],
  kosong: ['M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16z', 'M8.5 12h7'],
};

/** Ikon yang perlu isian penuh, bukan garis. */
const FILLED = new Set(['pengaturanDots']);

/**
 * @param {keyof PATHS} name
 * @param {{size?: number, className?: string, title?: string}} [options]
 * @returns {SVGElement}
 */
export function icon(name, { size = 18, className = '', title } = {}) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.6');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('class', `icon ${className}`.trim());
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  if (title) {
    const t = document.createElementNS(NS, 'title');
    t.textContent = title;
    svg.append(t);
  }

  for (const d of PATHS[name] || PATHS.kosong) {
    const path = document.createElementNS(NS, 'path');
    path.setAttribute('d', d);
    if (FILLED.has(name)) {
      path.setAttribute('fill', 'currentColor');
      path.setAttribute('stroke', 'none');
    }
    svg.append(path);
  }

  // Ikon pengaturan digambar dari dua bagian: tiga garis dan tiga bulatan.
  if (name === 'pengaturan') {
    for (const [cx, cy] of [[9, 7], [15, 12], [8, 17]]) {
      const c = document.createElementNS(NS, 'circle');
      c.setAttribute('cx', String(cx));
      c.setAttribute('cy', String(cy));
      c.setAttribute('r', '2.1');
      c.setAttribute('fill', 'var(--surface)');
      svg.append(c);
    }
  }

  return svg;
}

/**
 * Penanda kecil untuk chip status.
 *
 * Bentuknya sengaja berbeda per tingkat — bulat penuh, segitiga, belah ketupat,
 * centang, lingkaran kosong — supaya tingkat keparahan tetap terbaca kalau
 * warnanya tidak terlihat, entah karena buta warna, cetak hitam-putih, atau
 * layar yang pudar.
 */
export function toneMark(tone) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 12 12');
  svg.setAttribute('width', '9');
  svg.setAttribute('height', '9');
  svg.setAttribute('class', 'tone-mark');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');

  const shapes = {
    danger: '<circle cx="6" cy="6" r="4.2" fill="currentColor"/>',
    serious: '<path d="M6 1.6 10.6 9.6H1.4z" fill="currentColor"/>',
    warn: '<path d="M6 1.5 10.5 6 6 10.5 1.5 6z" fill="currentColor"/>',
    watch: '<rect x="2" y="2" width="8" height="8" rx="1.6" fill="currentColor"/>',
    ok: '<path d="m2.2 6.4 2.6 2.6 5-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
    muted: '<circle cx="6" cy="6" r="3.6" fill="none" stroke="currentColor" stroke-width="1.8"/>',
  };

  svg.innerHTML = shapes[tone] || shapes.muted;
  return svg;
}
