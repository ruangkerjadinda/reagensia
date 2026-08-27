/*
 * Pekerja layanan.
 *
 * Kerangka aplikasi disimpan supaya bisa dibuka tanpa jaringan, tapi selalu
 * dicoba dari jaringan lebih dulu. Data spreadsheet tidak pernah lewat sini —
 * kalau jaringan mati, lapisan cache di store.js yang menyediakan angka
 * terakhir, bukan pekerja layanan ini.
 */

const CACHE = 'reagensia-v3';
const SHELL = [
  './',
  'index.html',
  'css/tokens.css',
  'css/app.css',
  'css/print.css',
  'manifest.webmanifest',
  'assets/icon.svg',
];

self.addEventListener('install', (event) => {
  // 'reload' supaya cache HTTP milik peramban tidak ikut menjawab — sama
  // alasannya dengan { cache: 'no-store' } di fetch handler di bawah, tapi
  // Cache API menolak menyimpan permintaan bermode 'no-store'.
  const fresh = SHELL.map((url) => new Request(url, { cache: 'reload' }));
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(fresh)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Google Sheets dan endpoint Apps Script tidak pernah disimpan.
  if (url.origin !== self.location.origin) return;

  // Jaringan lebih dulu, cache sebagai jaring pengaman.
  //
  // Urutan sebaliknya (cache dulu) membuat versi baru aplikasi baru muncul di
  // kunjungan kedua setelah pemasangan — pengguna melihat kode lama sekali,
  // tanpa tahu. Untuk dashboard yang angkanya dipakai mengambil keputusan,
  // ketertinggalan diam-diam itu lebih mahal daripada muat sedetik lebih lambat.
  //
  // `{ cache: 'no-store' }` di sini bukan hiasan — GitHub Pages mengirim
  // Cache-Control: max-age=600 di setiap berkas. Tanpa opsi ini, fetch()
  // "jaringan dulu" ini tetap bisa dijawab diam-diam oleh cache HTTP milik
  // peramban (bukan cache pekerja layanan ini), dan muat ulang paksa
  // (Ctrl+Shift+R) TIDAK menjamin permintaan yang lewat pekerja layanan ikut
  // memaksa — jadi kode sampai 10 menit lebih lama bisa tetap muncul.
  event.respondWith(
    fetch(request, { cache: 'no-store' })
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((c) => c.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request).then((cached) => cached || Response.error())),
  );
});
