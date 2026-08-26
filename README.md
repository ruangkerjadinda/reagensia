# Reagensia

Dashboard monitoring reagen laboratorium. Situs statis tanpa build, membaca
Google Sheets langsung.

## Menjalankan

```bash
npm run dev
```

Lalu buka <http://localhost:8080>. Perintah itu hanya menjalankan server statis
(`npx serve`); alternatifnya `python -m http.server 8080` dari folder ini.

Membuka `index.html` lewat `file://` **tidak bekerja** — peramban menolak
permintaan lintas asal dari berkas lokal, jadi data tidak akan pernah termuat.
Perlu server HTTP, sekecil apa pun.

## Cara kerjanya

Spreadsheet dibagikan sebagai "siapa saja yang memiliki tautan dapat melihat",
dan endpoint Google Visualization API mengirim header CORS. Artinya halaman
statis bisa membacanya langsung — tidak ada backend, tidak ada kunci API, tidak
ada yang perlu di-deploy untuk mode baca.

```
https://docs.google.com/spreadsheets/d/<id>/gviz/tq?tqx=out:json&sheet=<nama tab>
```

Yang dipakai `out:json`, bukan `out:csv`. Versi JSON mengembalikan nilai
**bertipe** — tanggal datang sebagai `Date(2025,5,30)` dan angka sebagai angka.
Versi CSV hanya mengirim teks hasil format sheet, yang di workbook ini bercampur
bulan Indonesia dan Inggris (`Okt`, `Agu`, `Mei`, `Des` di sebelah `Jun`, `Sep`,
`Jan`) ditambah `dd/mm/yyyy` di tab Kartu Stok. Memilih JSON menghapus seluruh
kelas bug parsing itu.

Data digambar dengan pola *stale-while-revalidate*: tampilan langsung diisi dari
cache `localStorage` (atau `data/snapshot.json` pada kunjungan pertama), lalu
disegarkan di belakang layar. Kalau pengambilan gagal, tampilan lama tetap
berdiri dengan penanda luring — dashboard tidak pernah berubah jadi layar kosong
karena jaringan mati.

## Susunan berkas

```
index.html              kerangka, satu halaman
css/tokens.css          token warna & bentuk (terang/gelap)
css/app.css             tata letak dan komponen
css/print.css           gaya cetak untuk dokumen yang perlu ditandatangani
js/config.js            id spreadsheet, ambang risiko, endpoint mode input
js/data/schema.js       peta kolom tiap tab
js/data/sheets.js       klien gviz
js/data/normalize.js    record kanonis + field turunan
js/data/analytics.js    agregasi, temuan audit, laju pakai
js/data/store.js        cache + status luring
js/data/writer.js       klien mode input
js/ui/                  router, tabel, form, laci, dialog, palet perintah
js/charts/              grafik SVG buatan sendiri (tanpa CDN)
js/pages/               sepuluh halaman
data/snapshot.json      data bawaan untuk kunjungan pertama / tanpa jaringan
apps-script/            backend opsional untuk mode input + panduan pasang
tools/                  verifikasi data, pembuat snapshot, tiruan endpoint
```

Tidak ada framework, bundler, maupun CDN. Grafik digambar sendiri sebagai SVG,
bukan memakai Chart.js — ketergantungan CDN persis yang membuat kemampuan luring
patah, dan SVG inline memberi kendali penuh atas palet terang/gelap.

## Perkakas

```bash
npm run verify     # jalankan lapisan data terhadap sheet asli, cetak angkanya
npm run snapshot   # perbarui data/snapshot.json
npm run mock       # tiruan endpoint mode input di :8787 (token: rahasia-uji)
```

`npm run verify` adalah cara tercepat memastikan parsing masih benar setelah
struktur sheet berubah: ia mencetak jumlah lot, sebaran risiko, temuan audit,
dan rekonsiliasi antar tab — semuanya dari lapisan kode yang sama dengan yang
dipakai peramban.

## Mode input

Menambah baris dari dashboard membutuhkan Web App Apps Script yang dipasang di
spreadsheet oleh pemiliknya. Selama belum dipasang, dashboard berjalan penuh
dalam mode baca dan halaman Transaksi menampilkan kartu penyiapan.

Panduannya ada di [apps-script/DEPLOY.md](apps-script/DEPLOY.md), termasuk daftar
uji terima yang sebaiknya dijalankan di salinan spreadsheet lebih dulu.

Untuk menguji alur formnya tanpa menyentuh spreadsheet mana pun:

```bash
npm run mock
```

lalu isi Pengaturan dengan `http://localhost:8787` dan token `rahasia-uji`.
Tiruan itu mengikuti kontrak yang sama dengan `Code.gs`, termasuk penolakan
kiriman ganda dan pemeriksaan sisa stok. Variabel `MOCK_LATENCY`, `MOCK_FAIL`,
dan `MOCK_LOCK` dipakai untuk menguji jalur gagalnya.

## Mengganti spreadsheet

Ubah `spreadsheetId` di `js/config.js`. Kalau susunan kolomnya berbeda,
sesuaikan `js/data/schema.js` — pemetaan mengutamakan judul kolom dan memakai
posisi hanya sebagai jaring pengaman, jadi menyisipkan kolom di tengah tidak
merusak apa pun. Jalankan `npm run verify` untuk memastikan.

## Menerbitkan ke GitHub Pages

Isi repositori ini bisa langsung dilayani apa adanya. Buat repositori,
`git push`, lalu Settings → Pages → Deploy from a branch → root.

Repositori perlu publik untuk GitHub Pages gratis. Yang jadi publik adalah
kodenya; datanya sendiri sudah dapat dibaca lewat tautan spreadsheet.
