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

**Workbook ini disusun ulang besar-besaran menjelang November 2026** — kolom
pindah, beberapa dihapus, beberapa ditambah, dan tab Distribusi ditulis ulang.
Catatan di bawah adalah hasil pemeriksaan langsung 16 Nov 2026; catatan versi
sebelumnya (baris total 197, 193 lot, kolom Kategori di Master Stok) sudah
**tidak berlaku** dan jangan dipakai sebagai acuan.

1. **Keempat tab utama berformat sama:** banner baris 1, kosong 2-3, judul kolom
   baris 4, data mulai baris 5. gviz biasanya menebak ini sendiri, tapi di tab
   Distribusi tebakannya gagal — ada dua angka nyasar (`100`, `100`) di baris 2
   kolom Q/R, gviz mengira data mulai di situ, dan **seluruh label kolom datang
   kosong** sehingga setiap field jatuh ke pencocokan posisi dan tab itu terbaca
   geser satu kolom. Karena itu `headers` sekarang dikirim eksplisit per tab dari
   `schema.js` (`headers: 4`). Tab Kartu Stok justru **rusak kalau dipaksa** —
   di sana tebakan gviz sudah benar, jadi `headers: undefined`.

2. **Rumus otomatis Master Stok sudah dipasang Dinda sendiri** (bukan lewat
   `Formulas.gs`). Pembelian, Hibah, Titipan Daerah, Distribusi, dan Pemusnahan
   terisi sendiri dari tab transaksi. Anggapan lama "setiap penulisan harus
   sepasang" **tidak berlaku lagi** — cukup baris transaksinya. Per 16 Nov 2026
   ketiga rekonsiliasi cocok persis dan **tidak ada satu pun** dari 326 lot yang
   Sisa Stok-nya melenceng.

3. **Dua kolom masuk baru: Hibah (K) dan Titipan Daerah (L).** Rumusnya sekarang
   `Sisa Stok = Stok Awal + Pembelian + Hibah + Titipan Daerah − Distribusi −
   Pemusnahan`. Melewatkan dua kolom itu membuat ratusan lot dilaporkan tidak
   cocok padahal sheet-nya benar.

4. **Kolom Kategori sudah tidak ada lagi di Master Stok.** Sekarang hidup di tab
   transaksi (Penerimaan kolom M: Pembelian 2026 / Hibah / Titipan Daerah / Stok
   Awal). `normalize.js` menurunkannya per lot dari baris penerimaan, jadi filter
   Kategori di semua halaman tetap jalan.

5. **Tab Pemusnahan tidak punya kolom Kode sama sekali.** Barisnya dikunci ke
   Master Stok lewat pasangan Nama Reagen + Kode/Lot (`kodeResolver()` di
   `normalize.js`); semua 90 baris ketemu. **Jangan diganti jadi pencocokan lot
   saja** — ada 14 nomor lot yang dipakai lebih dari satu reagen, dan menebak di
   situ akan memindahkan transaksi ke lot orang lain.

6. **gid Distribusi dan Pemusnahan tertukar di `config.js`.** Sudah diperiksa
   lewat `/export?format=csv&gid=…` dan diperbaiki: Distribusi `2097351299`,
   Pemusnahan `1861623006`. Sebelumnya tautan "Buka di Sheets" dari kedua tab itu
   membuka tab yang salah tanpa ada yang terlihat keliru.

7. **KODE BMN ada di tab Penerimaan kolom X**, terisi di 61 dari 326 baris.
   Nilainya **per lot**, bukan per reagen (tiga kode reagen punya lebih dari satu
   nomor BMN), jadi diturunkan lewat kunci `kode|lot` seperti COA/MSDS.

8. **gviz menempelkan banner ke label kolom pertama** — kolom A Master Stok
   datang sebagai `"INVENTORY STOK REAGEN (Real-time) No"`. `schema.js`
   mencocokkan lewat label dengan `endsWith`, dan jatuh ke posisi kolom kalau
   gagal.

9. **Daftar instalasi tumbuh jadi enam:** K3, Kesehatan Lingkungan, Mikrobiologi,
   Patologi Klinik, Samres, Surveilans. `Bakteriologi` dan `Molekuler` yang dulu
   muncul di tab transaksi sudah tidak ada.

10. **Tab Kartu Stok tersembunyi dan rumusnya rusak** — `XLOOKUP` menunjuk sheet
    `Master Reagen` yang tidak ada. Halaman Kartu Stok membangun ulang kartunya
    dari tab transaksi, bukan membaca tab itu.

11. **`apps-script/Code.gs` belum disesuaikan ke susunan baru ini.** Mode input
    masih mati (endpoint kosong), jadi tidak ada yang rusak sekarang, tapi
    `colOf()` di sana mencari kolom `Kategori` di Master Stok dan `Metode
    Pemusnahan`/`Periode Pakai` yang sudah tidak ada — kalau dipasang apa adanya,
    ia akan melempar error. Ini pekerjaan tersendiri sebelum mode input dipakai.

## Kalau kolom di spreadsheet dipindah / dihapus / diganti nama

Pertanyaan yang berulang dari Dinda. Jawabannya berbeda-beda per kasus:

- **Dipindah (urutannya ditukar): aman.** `resolveColumns()` mencocokkan lewat
  label dulu, posisi cuma cadangan — jadi kolom boleh pindah ke mana saja
  asal **tulisan judulnya tidak ikut berubah**. Ini juga berlaku untuk kolom A:
  gviz menempelkan banner ke label kolom pertama, dan pencocokannya memakai
  `endsWith`, jadi kolom apa pun yang dipindah ke A tetap ketemu.
- **Diganti nama: rusak diam-diam.** Label tidak cocok lagi → jatuh ke posisi
  yang dideklarasikan di `schema.js`. Perbaikannya sepele: tambahkan nama
  barunya ke `aliases` field itu. Untuk mode input, `colOf()` di `Code.gs`
  memakai kesamaan persis (bukan `endsWith`) dan kolom wajib akan **melempar
  error** — ini justru bagus, gagalnya berisik.
- **Dihapus: paling berbahaya.** Label hilang → jatuh ke posisi lama → padahal
  kolom setelahnya sudah bergeser, jadi yang terbaca adalah **kolom
  tetangganya**, bukan error. Inilah yang benar-benar terjadi saat Kategori
  dihapus dari Master Stok: `kategori` mengambil kolom Supplier, lalu `supplier`
  terdorong ke Stok Awal dan `stokAwal` ke Pembelian — tiga kolom salah,
  tidak ada satu pun yang merah. `resolveColumns()` sekarang **menolak** memakai
  kolom cadangan yang sudah diambil field lain (rantai geser itu berhenti di
  kolom pertama), tapi kolom pertamanya tetap salah diam-diam. Satu-satunya
  tanda adalah baris peringatan di halaman Pengaturan ("dicocokkan lewat
  posisi"). Kalau ada kolom yang benar-benar mau dihapus, hapus juga field-nya
  dari `schema.js` dalam perubahan yang sama.

Kolom **baru** yang disisipkan di tengah tidak merusak apa pun — itu memang
alasan pencocokan label didahulukan.

## Angka acuan (16 Nov 2026)

Dipakai untuk memastikan tidak ada yang rusak setelah perubahan. Jalankan
`npm run verify`. Angka ini bergerak sendiri setiap kali Dinda mengisi sheet —
yang penting bukan nilainya persis, tapi tiga baris terakhir tetap **cocok**.

| | |
|---|---|
| Lot / reagen / total stok | 326 · 236 · 3118 |
| Risiko (expired / ≤30 / ≤90 / ≤180 / aman / tanpa tanggal) | 98 · 11 · 17 · 22 · 97 · 81 |
| Stok rendah / habis | 200 · 111 |
| Kedaluwarsa tapi AKTIF | 0 |
| Sisa Stok tidak cocok | 0 |
| Tanpa supplier / tanpa lot | 112 · 53 |
| COA / MSDS | 54 · 39 dari 326 baris penerimaan |
| Baris berbeda yang perlu dirapikan | 186 |
| Rekonsiliasi | Penerimaan ✓ 3646=3646 · Distribusi ✓ 114=114 · Pemusnahan ✓ 414=414 |

Pemetaan kolom harus melaporkan **"semua field tercocokkan lewat label"**. Satu
baris peringatan saja berarti susunan sheet berubah lagi.

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
- Kartu Stok punya **dua tata letak terpisah**: yang di layar (kartu + tabel
  mutasi lengkap dengan nomor baris sheet) dan yang dicetak (`printCard()` di
  `js/pages/kartustok.js`, gaya `.kartu-cetak*` di `css/print.css`). Yang
  dicetak sengaja bukan versi layar yang disembunyikan sebagian: bentuknya
  meniru kartu manual yang ditempel di lemari pendingin — blok identitas
  berkotak, tabel mutasi berkolom Paraf, baris kosong diganjal sampai 14 supaya
  masih bisa ditulis tangan, dan semuanya **muat satu lembar A4** (terukur
  ±161 mm dari 269 mm ruang cetak). Kalau ukuran huruf atau tinggi barisnya
  diubah, hitung ulang batas itu.

- Halaman Audit memperlakukan sheet sebagai sumber yang **bisa salah**, dan
  setiap temuan menunjuk balik ke nomor barisnya di Google Sheets.
