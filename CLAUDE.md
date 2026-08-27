# Reagensia — catatan untuk sesi berikutnya

Dashboard monitoring reagen laboratorium. Situs statis tanpa build, membaca
Google Sheets langsung. Dibuat untuk Dinda; repositorinya
`github.com/ruangkerjadinda/reagensia`.

Berkas ini merangkum hal-hal yang **tidak bisa disimpulkan dari membaca kode**.
Sisanya sengaja ditulis sebagai komentar di dalam berkasnya masing-masing.

---

## Sumber data

Spreadsheet dibagikan "siapa saja yang punya tautan dapat melihat", dan endpoint
gviz mengirim header CORS. Jadi halaman statis membacanya langsung — **tidak ada
backend untuk mode baca**, tidak ada kunci API.

```
https://docs.google.com/spreadsheets/d/1KBrL4OB_ub_ie7OCIFTGcd-gIY0hy8ApiTGnIyQTu7k/gviz/tq?tqx=out:json&sheet=<nama tab>
```

**Selalu `out:json`, jangan `out:csv`.** JSON mengembalikan nilai bertipe —
tanggal sebagai `Date(2025,5,30)` (bulan 0-based), angka sebagai angka. CSV cuma
mengirim teks hasil format sheet, yang di workbook ini bercampur bulan Indonesia
dan Inggris (`Okt`, `Agu`, `Mei`, `Des` di sebelah `Jun`, `Sep`, `Jan`) plus
`dd/mm/yyyy` di tab Kartu Stok. Memilih JSON menghapus seluruh kelas bug itu.

Balasannya dibungkus komentar sampah lalu
`google.visualization.Query.setResponse( … )` — ambil objek JSON di antara
kurung kurawal terluar.

## Yang perlu diketahui tentang workbook ini

Temuan berikut hasil pemeriksaan langsung. Jangan disimpulkan ulang dari nol.

1. **Baris 197 Master Stok adalah baris total, bukan lot.** Stok Awal 1063, Sisa
   1007. Disaring lewat pemeriksaan identitas (`kode || nama || instalasi`), bukan
   nomor baris — angka benarnya **193 lot / 1007 unit**, bukan 194 / 2014.

2. **Kolom Pembelian, Distribusi, dan Pemusnahan di Master Stok diisi manual**,
   bukan rumus `SUMIF` ke tab transaksi. Konsekuensinya besar: menambah baris
   transaksi saja membuat angka Master Stok melenceng. Setiap penulisan harus
   sepasang — baris transaksi **dan** kolom ringkasannya, dalam satu kunci.

3. **Sisa Stok seharusnya rumus** `=Stok Awal + Pembelian − Distribusi −
   Pemusnahan`. Di 13 baris rumusnya diganti angka ketikan; 7 di antaranya
   sekarang tidak cocok. Baris 173 (`IMB-0077`) menaruh 240 di Stok Awal *dan*
   Pembelian lalu menimpa hasilnya dengan 240.

4. **Baris judul berbeda tiap tab.** Master Stok: banner baris 1, kosong 2,
   judul 3, data 4+. Distribusi: judul baris 4, data 5+. Karena itu Code.gs
   *mencari* baris judul (memindai "Instalasi"), tidak menebaknya.

5. **gviz menempelkan banner ke label kolom pertama** — kolom A Master Stok
   datang sebagai `"INVENTORY STOK REAGEN (Real-time) No"`. `schema.js`
   mencocokkan lewat label dengan `endsWith`, dan jatuh ke posisi kolom kalau
   gagal.

6. **`Instalasi` di tab Distribusi adalah unit tujuan, bukan pemilik.** Master
   Stok punya 3 instalasi; Distribusi memakai `Molekuler`, Kartu Stok memakai
   `Bakteriologi`. Jangan digabung jadi satu daftar.

7. **Semua baris Penerimaan secara historis masuk ke kolom Stok Awal**, bukan
   Pembelian (1063 = 1063). Kolom Pembelian praktis tak terpakai. Untuk baris
   *baru*, Code.gs menambah ke Pembelian — itu yang benar secara makna.

8. **Tab Kartu Stok tersembunyi dan rumusnya rusak** — `XLOOKUP` menunjuk sheet
   `Master Reagen` yang tidak ada. Halaman Kartu Stok membangun ulang kartunya
   dari tab transaksi, bukan membaca tab itu.

## Angka acuan (27 Agu 2026)

Dipakai untuk memastikan tidak ada yang rusak setelah perubahan. Jalankan
`npm run verify`.

| | |
|---|---|
| Lot / reagen / total stok | 193 · 143 · 1007 |
| Risiko (expired / ≤30 / ≤90 / ≤180 / aman / tanpa tanggal) | 69 · 3 · 13 · 23 · 70 · 15 |
| Stok rendah / habis | 89 · 3 |
| Kedaluwarsa tapi AKTIF | 12 |
| Sisa Stok tidak cocok | 7 |
| Tanpa supplier / tanpa lot | 84 · 5 |
| COA / MSDS | 61 · 55 dari 193 |
| Baris berbeda yang perlu dirapikan | 99 |
| Rekonsiliasi | Distribusi ✓ 31=31 · Pemusnahan ✓ 0=0 · Penerimaan ✗ 1063 vs 1303 |

## Susunan

```
js/config.js          id spreadsheet, ambang risiko, endpoint, tema
js/data/schema.js     peta kolom tiap tab (label dulu, posisi sebagai cadangan)
js/data/sheets.js     klien gviz + satu kali ulang saat gagal
js/data/normalize.js  record kanonis + field turunan (risiko, temuan, dokumen)
js/data/analytics.js  agregasi, audit, laju pakai, ejaan kembar
js/data/store.js      cache localStorage, stale-while-revalidate, status luring
js/data/writer.js     klien mode input
js/ui/                router, tabel, form, laci, dialog, palet, ikon
js/charts/            SVG buatan sendiri (timeline, meter) — tanpa CDN
js/pages/             sepuluh halaman
apps-script/          backend opsional + panduan pasang
tools/                verify-data, build-snapshot, mock-endpoint, dev-server
```

Tanpa framework, bundler, atau CDN. Ikon inline di `js/ui/icons.js`.

## Sistem desain

Semua warna dan bentuk adalah custom property di `css/tokens.css`, dalam tiga
lingkup: `:root` (terang), `@media (prefers-color-scheme: dark)` dengan penjaga
`:root:not([data-theme='light'])`, dan `:root[data-theme='dark']`.

**Pemilih tema warna sudah terpasang** di halaman Pengaturan — empat pilihan,
Sakura (default), Mint Klinik, Lavender Senja, Peach Sorbet, disimpan sebagai
`CONFIG.palette` dan ditulis ke atribut `[data-palette]` di `<html>` lewat
`applyPalette()` (`js/ui/theme.js`). Atribut itu **selalu terisi** (tidak
pernah dihapus), jadi setiap blok warna di `tokens.css` cukup menimpa "biji"-nya
sendiri (`--plane`, `--surface`, `--ink`, `--ink-muted`, `--border`, `--accent`,
`--accent-strong`, `--accent-wash`) — token turunan (`--plane-tint`, `--grid`,
`--axis`, `--ink-secondary`, bayangan, dst.) ditulis sekali lewat `color-mix()`
dan menghitung ulang sendiri dari biji yang sedang aktif. **Menambah tema
kelima berarti menambah satu blok biji terang + satu blok biji gelap, bukan
menyalin seluruh berkas.** Bentuknya ("Level 2": sudut 13→20 px, tombol
kapsul, bayangan lebih empuk) berlaku sama untuk keempat warna dan
didefinisikan sekali di `:root`, tidak per tema. Detail lengkapnya ada di
komentar kepala `css/tokens.css`; contoh visualnya (kalau mau bikin tema baru)
masih di `design/theme-preview.html`.

Palet grafik (series/ramp) sudah divalidasi dengan validator skill `dataviz`
terhadap permukaan biru lama (`#ffffff` terang / `#15181e` gelap): trio
kategorikal instalasi, dua seri biru/merah, dan ramp ordinal — semuanya lolos
di kedua mode. **Permukaan gelap keempat tema warna sekarang berbeda-beda**
(merah muda/hijau/ungu/oranye tua untuk Sakura/Mint/Lavender/Peach), dan
validator itu belum dijalankan ulang terhadap ketiganya selain biru — series
dan ramp sengaja dibiarkan sama di semua tema (lihat paragraf di bawah), tapi
kontrasnya di atas permukaan baru belum dipastikan. **Jalankan ulang
validatornya sebelum mengandalkan grafik di mode gelap non-Sakura.**

Warna status (kritis/serius/peringatan/aman) dan palet grafik sengaja tidak
ikut tema warna — warnanya membawa arti klinis/kategorikal, bukan selera.
Status selalu tampil bersama penanda bentuk (`toneMark`) dan teks, tidak
pernah warna semata.

**Maskot** (labu erlenmeyer kecil bermuka, `mascotSvg()` di `js/pages/dashboard.js`)
sudah terpasang, dengan sapaan yang ikut jam perangkat (`greeting()`, bukan
`data.today`). Sengaja hanya dirender di dalam `dashboard.js` — **jangan
dipindah ke topbar/kerangka bersama**, supaya tetap tidak pernah tampil di
halaman lain. Elemen pembungkusnya (`.mascot-row`) membawa kelas `.no-print`
supaya juga tidak ikut tercetak. Warnanya semua token (`--surface`, `--ink`,
`--accent`, `--accent-strong`, `--border-strong`, `--highlight`), jadi ikut
berganti tema/palet tanpa disentuh.

## Mode input

Membaca lewat gviz; menulis lewat Web App Apps Script yang **belum dipasang**.
Selama endpoint kosong, dashboard berjalan penuh dalam mode baca dan halaman
Transaksi menampilkan kartu penyiapan.

`apps-script/Code.gs` sudah ditulis dan `apps-script/DEPLOY.md` memuat langkah
pemasangan serta daftar uji terima. Yang memasang adalah pemilik spreadsheet,
bukan kita. **Uji di salinan workbook dulu, jangan di yang asli.**

Untuk menguji alur formnya tanpa menyentuh spreadsheet mana pun:
`npm run mock` (token `rahasia-uji`), lalu isi halaman Pengaturan dengan
`http://localhost:8787`. Tiruan itu mengikuti kontrak yang sama, termasuk
penolakan kiriman ganda dan pemeriksaan sisa stok.

## Perintah

```bash
npm run dev       # server statis :8080
npm run verify    # jalankan lapisan data ke sheet asli, cetak angkanya
npm run snapshot  # perbarui data/snapshot.json
npm run mock      # tiruan endpoint mode input :8787
```

`tools/dev-server.mjs` mengirim `Cache-Control: no-store` dengan sengaja. Tanpa
itu peramban menyimpan modul JavaScript dengan aturan heuristiknya sendiri, dan
perubahan kode bisa tidak terlihat berkali-kali muat ulang — kegagalan yang
menyesatkan karena berkas di disk sudah benar. Jangan diganti `python -m
http.server`.

## Penerbitan

Remote dan identitas sudah diatur **lokal untuk repositori ini saja** (git global
di PC ini milik akun lain dan tidak tersentuh):

```
remote origin   git@github.com:ruangkerjadinda/reagensia.git
core.sshCommand ssh -i C:/Users/dK/.ssh/reagensia_deploy -o IdentitiesOnly=yes
user.name       Dinda
user.email      ruangkerjadinda@users.noreply.github.com
```

Langkah yang tersisa, semuanya dilakukan manusia lewat peramban:

1. Tempel `~/.ssh/reagensia_deploy.pub` ke repo → Settings → Deploy keys →
   **Allow write access**
2. `git push -u origin main`
3. Settings → Pages → Deploy from a branch → `main` / root
4. Domain: A record apex ke `185.199.108–111.153`, CNAME `www` ke
   `ruangkerjadinda.github.io`, lalu isi Custom domain di Settings → Pages dan
   centang Enforce HTTPS

Semua path di aplikasi relatif, jadi jalan sama saja di akar domain maupun di
`/reagensia`.

## Yang belum dikerjakan

- Level 3 (ilustrasi, animasi) **ditunda** — bukan ditolak.
- Salin `user.email` bentuk ber-ID dari Settings → Emails miliknya kalau ingin
  commit tertaut ke profilnya.

## Batasan yang sengaja dipilih

- Dashboard **tidak pernah** menampilkan layar kosong karena jaringan mati —
  `store.js` menggambar dari cache atau `data/snapshot.json` lebih dulu, lalu
  menyegarkan di belakang layar.
- Pekerja layanan **jaringan dulu**, cache sebagai cadangan. Urutan sebaliknya
  membuat versi baru aplikasi baru muncul di kunjungan kedua — untuk angka yang
  dipakai mengambil keputusan, ketertinggalan diam-diam lebih mahal daripada
  muat sedetik lebih lambat.
- Dialog konfirmasi sebelum menulis menuliskan **persis baris yang ditambahkan
  dan akibatnya di Master Stok** ("Sisa Stok 9 → 8"). Yang ditulis adalah
  inventaris yang dipakai orang lain; "Anda yakin?" saja tidak cukup.
- Halaman Audit memperlakukan sheet sebagai sumber yang **bisa salah**, dan
  setiap temuan menunjuk balik ke nomor barisnya di Google Sheets.
