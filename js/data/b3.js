/**
 * Membaca kolom "Simbol B3" jadi daftar piktogram.
 *
 * Ada di lapisan data, bukan di `js/ui/b3.js`, karena `normalize.js` ikut
 * memakainya dan lapisan data tidak boleh bergantung pada lapisan tampilan —
 * berkas ini harus tetap jalan di Node, tanpa `document`. Yang di `ui/` hanya
 * gambarnya.
 *
 * Daftar kata kuncinya **tumbuh dari tulisan Dinda yang sebenarnya**, bukan
 * dari daftar istilah GHS yang rapi. Waktu kolomnya mulai diisi (24 Nov 2026),
 * 9 dari 77 isian tidak menghasilkan satu simbol pun — di antaranya VANCOMYCIN
 * "Sensitisasi pernapasan & kulit, Bahaya alergi", reagen yang betul-betul
 * berbahaya tapi stikernya tercetak polos. Itu kegagalan yang paling mahal di
 * sini, jadi istilah baru lebih baik ditambahkan daripada dibiarkan lewat.
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
  biohazard: 'Bahaya biologis',
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
  ['kesehatan', ['bahaya kesehatan', 'karsinogen', 'mutagen', 'health hazard', 'ghs08', 'target organ',
    'toksik reproduksi', 'genotoksik', 'h350', 'h351', 'ototoksik', 'toksisitas organ', 'organ sasaran',
    // Sensitisasi **pernapasan** adalah GHS08; yang kulit GHS07, di bawah.
    // Dipisah lewat lookahead karena urutan katanya berubah-ubah di sheet:
    // "Sensitisasi pernapasan & kulit" dan "Sensitisasi kulit & pernapasan"
    // dua-duanya dipakai, dan keduanya berarti dua bahaya sekaligus.
    /(?=.*sensitisasi)(?=.*pernap|.*pernaf)/]],
  ['lingkungan', ['lingkungan', 'akuatik', 'aquatic', 'environment', 'ghs09', 'h410', 'h411']],
  // Bukan GHS — lambang trefoil punya standar sendiri, dan di sini digambar
  // dengan bingkai yang berbeda supaya tidak tertukar. Dinda memakainya untuk
  // reagen uji yang bersentuhan dengan sampel pasien.
  ['biohazard', ['biohazard', 'bio hazard', 'bahaya biologis', 'bahaya biologi', 'biologis',
    'infeksius', 'patogen']],
  ['terbakar', ['mudah terbakar', 'mudah menyala', 'flammable', 'ghs02', 'h225', 'h226',
    // Reaktif terhadap air yang menghasilkan gas mudah terbakar.
    'reaktif terhadap air', 'gas h2', 'h260', 'h261']],
  ['oksidator', ['oksidator', 'pengoksidasi', 'oxidi', 'ghs03']],
  ['meledak', ['meledak', 'eksplosif', 'explos', 'ghs01', 'h201']],
  ['gas', ['gas bertekanan', 'gas under pressure', 'ghs04']],
  ['korosif', ['korosif', 'corros', 'ghs05', 'h290', 'h314', 'h318',
    // Kerusakan serius pada mata ikut GHS05, bukan tanda seru.
    'kerusakan mata', 'kerusakan serius pada mata', 'kerusakan pada mata']],
  // "toksik" telanjang ikut tengkorak, tapi JANGAN kalau ia bagian dari
  // "toksik ringan" (itu berbahaya, bukan racun akut), "toksik reproduksi"
  // (itu bahaya kesehatan) atau "genotoksik". Huruf di depan ikut diperiksa
  // supaya "genotoksik", "sitotoksik" dan "ototoksik" tidak tertangkap.
  ['toksik', ['toksik akut', 'beracun', 'racun', 'acute tox', 'ghs06', 'h301', 'h311', 'h331',
    /(^|[^a-z])toksik(?!\s*(ringan|reproduksi))/]],
  ['iritan', ['iritan', 'iritasi', 'tanda seru', 'irritan', 'harmful', 'ghs07', 'h315', 'h319', 'h335',
    // Tulisan Dinda: "Berbahaya", "Berbahaya jika tertelan", "Bahaya alergi",
    // "Sensitisasi alergi". Semuanya GHS07.
    'berbahaya', 'alergi', 'h302',
    /(?=.*sensitisasi)(?=.*kulit)/]],
];

/**
 * Frasa yang justru menyatakan **tidak** berbahaya. Dibuang dari teksnya
 * sebelum pencocokan, bukan dipakai memulangkan daftar kosong — satu sel bisa
 * menyebut keduanya sekaligus ("Tidak berbahaya jika tertelan, Iritan"), dan
 * memulangkan kosong di situ akan menghapus peringatan yang sah.
 */
const SANGKALAN = [/tidak berbahaya/g, /non[\s-]?hazardous/g, /tidak diklasifikasikan/g];

/**
 * @returns {{kunci: string[], sudahDiisi: boolean, teks: string}}
 *   `sudahDiisi` membedakan "sudah diperiksa, tidak berbahaya" dari "belum
 *   diisi sama sekali". Keduanya menghasilkan nol simbol, tapi artinya jauh
 *   berbeda dan halaman yang menampilkannya perlu bisa membedakan.
 */
export function bacaB3(teks) {
  const s = String(teks ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (!s) return { kunci: [], sudahDiisi: false, teks: '' };

  let bersih = s;
  for (const pola of SANGKALAN) bersih = bersih.replace(pola, ' ');

  const kunci = [];
  for (const [nama, petunjuk] of KATA) {
    if (petunjuk.some((p) => (p instanceof RegExp ? p.test(bersih) : bersih.includes(p)))) kunci.push(nama);
  }

  // "Toksik ringan" adalah bahasa sehari-hari untuk berbahaya, bukan untuk
  // tengkorak. Tanpa pengecualian ini satu reagen iritan tampil dengan simbol
  // racun akut — memperingatkan jauh lebih keras daripada dokumen sumbernya.
  if (bersih.includes('toksik ringan') && !/toksik akut|beracun|racun\b/.test(bersih)) {
    const i = kunci.indexOf('toksik');
    if (i >= 0) kunci.splice(i, 1);
    if (!kunci.includes('iritan')) kunci.push('iritan');
  }

  return { kunci, sudahDiisi: true, teks: String(teks).trim() };
}
