/**
 * Membaca kolom "Simbol B3" jadi daftar piktogram GHS.
 *
 * Ada di lapisan data, bukan di `js/ui/b3.js`, karena `normalize.js` ikut
 * memakainya dan lapisan data tidak boleh bergantung pada lapisan tampilan —
 * berkas ini harus tetap jalan di Node, tanpa `document`. Yang di `ui/` hanya
 * gambarnya.
 */

export const NAMA_B3 = {
  terbakar: 'Mudah terbakar',
  oksidator: 'Pengoksidasi',
  meledak: 'Mudah meledak',
  gas: 'Gas bertekanan',
  korosif: 'Korosif',
  toksik: 'Toksik (beracun)',
  iritan: 'Iritan / berbahaya',
  kesehatan: 'Bahaya kesehatan',
  lingkungan: 'Bahaya lingkungan',
};

export const SEMUA_B3 = Object.keys(NAMA_B3);

/**
 * Yang dibaca adalah tulisan tangan orang, bukan kode. Satu sel bisa berbunyi
 * "Korosif terhadap logam, Iritan (tanda seru)" atau "Bahaya Kesehatan,
 * Iritan". Jadi pencocokannya per kata kunci, dan sel yang tidak dikenali
 * menghasilkan daftar kosong — bukan error, dan bukan simbol yang salah.
 *
 * Urutan daftar ini menentukan urutan tampil, bukan prioritas pencocokan:
 * semua kata kunci diperiksa, satu sel boleh menghasilkan beberapa simbol.
 */
const KATA = [
  ['kesehatan', ['bahaya kesehatan', 'karsinogen', 'mutagen', 'health hazard', 'ghs08', 'target organ', 'toksik reproduksi', 'genotoksik', 'h350', 'h351']],
  ['lingkungan', ['lingkungan', 'akuatik', 'aquatic', 'environment', 'ghs09', 'h410', 'h411']],
  ['terbakar', ['mudah terbakar', 'mudah menyala', 'flammable', 'ghs02', 'h225', 'h226']],
  ['oksidator', ['oksidator', 'pengoksidasi', 'oxidi', 'ghs03']],
  ['meledak', ['meledak', 'eksplosif', 'explos', 'ghs01', 'h201']],
  ['gas', ['gas bertekanan', 'gas under pressure', 'ghs04']],
  ['korosif', ['korosif', 'corros', 'ghs05', 'h290', 'h314']],
  // "toksik" telanjang ikut tengkorak, tapi JANGAN kalau ia bagian dari
  // "toksik ringan" (itu berbahaya, bukan racun akut), "toksik reproduksi"
  // (itu bahaya kesehatan) atau "genotoksik". Huruf di depan ikut diperiksa
  // supaya "genotoksik" dan "sitotoksik" tidak tertangkap.
  ['toksik', ['toksik akut', 'beracun', 'racun', 'acute tox', 'ghs06', 'h301', 'h311', 'h331',
    /(^|[^a-z])toksik(?!\s*(ringan|reproduksi))/]],
  ['iritan', ['iritan', 'tanda seru', 'irritan', 'harmful', 'ghs07', 'h315', 'h319', 'h335']],
];

/**
 * @returns {{kunci: string[], sudahDiisi: boolean, teks: string}}
 *   `sudahDiisi` membedakan "sudah diperiksa, tidak berbahaya" dari "belum
 *   diisi sama sekali". Keduanya menghasilkan nol simbol, tapi artinya jauh
 *   berbeda dan halaman yang menampilkannya perlu bisa membedakan.
 */
export function bacaB3(teks) {
  const s = String(teks ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (!s) return { kunci: [], sudahDiisi: false, teks: '' };

  const kunci = [];
  for (const [nama, petunjuk] of KATA) {
    if (petunjuk.some((p) => (p instanceof RegExp ? p.test(s) : s.includes(p)))) kunci.push(nama);
  }

  // "Toksik ringan" adalah bahasa sehari-hari untuk berbahaya, bukan untuk
  // tengkorak. Tanpa pengecualian ini satu reagen iritan tampil dengan simbol
  // racun akut — memperingatkan jauh lebih keras daripada dokumen sumbernya.
  if (s.includes('toksik ringan') && !/toksik akut|beracun|racun\b/.test(s)) {
    const i = kunci.indexOf('toksik');
    if (i >= 0) kunci.splice(i, 1);
    if (!kunci.includes('iritan')) kunci.push('iritan');
  }

  return { kunci, sudahDiisi: true, teks: String(teks).trim() };
}
