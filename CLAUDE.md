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

5a. **Kunci antar tab adalah Nama Reagen + Kode/Lot, bukan Kode.** Ini bukan
    pilihan desain kita — seluruh rumus Master Stok mencocokkan transaksinya
    begitu, dan barisnya lahir dari `UNIQUE(FILTER(Penerimaan!E:F))`, pasangan
    yang sama persis. Kode justru turunan: di Penerimaan ia rumus dari tab
    Daftar Kode, di Distribusi ia diketik tangan. Sampai 17 Nov 2026
    `normalize.js` memakai Kode + Lot, dan itu diam-diam salah: lima baris
    Distribusi menulis kode berbeda untuk nama dan lot yang sama (`IMB-0080`
    di baris 80/83/95, `IMB-0072` di baris 99/101/103/109 — lot identik).
    Sheet-nya menghitung semuanya karena ia mengabaikan Kode; dashboard tidak,
    jadi tiga lot kehilangan 8 unit keluar dan Kartu Stok-nya berakhir di angka
    yang berbeda dari Inventori — tanpa satu pun temuan merah, karena Sisa Stok
    dibaca dari sheet dan bukan dihitung ulang. Kode yang berbeda sekarang jadi
    temuan tersendiri (`audit.kodeBeda`), bukan pemutus hubungan. **Lot
    sendirian tetap bukan pengganti yang aman** — lihat catatan 5.

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

11. **Master Stok tidak menyimpan apa pun — ia menghitung dirinya sendiri.**
    Ini temuan terpenting dari pengujian 17 Nov 2026, dan ia mengubah bentuk
    mode input. Yang ada di sana semuanya rumus:

    - `Nama Reagen` dan `Kode/Lot` adalah spill
      `INDEX(UNIQUE(FILTER(Penerimaan!$E$5:$F$1041; …)); ROW()-4; COLUMN()-3)` —
      daftar pasangan unik dari tab Penerimaan, urut kemunculan pertama.
    - `Kode` dicari balik dari pasangan itu ke kolom Kode tab Penerimaan;
      kolom Kode di tab Penerimaan **sendiri juga rumus**, yang mengambil kode
      dari tab Daftar Kode menurut nama reagen. Reagen yang belum terdaftar di
      sana memang tidak punya kode, dan tidak ada yang bisa menuliskannya.
    - Kelima kolom masuk/keluar adalah `SUMPRODUCT` ke tab transaksi, dicocokkan
      lewat **Nama Reagen + Kode/Lot sebagai teks apa adanya**.
    - `Sisa Stok` penjumlahannya; `Status` rumus tanggal kedaluwarsa
      (`IF(F<TODAY(); "TIDAK AKTIF"; "AKTIF")`) — **"TIDAK AKTIF" di sana
      berarti lewat exp date, bukan stok habis.**

    Akibatnya untuk mode input: **tidak ada satu sel pun di Master Stok yang
    perlu, atau boleh, ditulis.** Cukup baris transaksinya; barisnya muncul dan
    berubah sendiri. Tiga jebakan yang nyata-nyata terjadi waktu diuji:

    - **Satu spasi membelah lot jadi dua.** Dashboard mengirim nama yang sudah
      di-trim, sheet menyimpan `"ELISA ANTI-MEASLES VIRUS (IgM) "` dengan spasi
      di ujung. `UNIQUE()` menganggapnya pasangan baru → muncul baris Master
      Stok kedua untuk lot yang sama, stoknya terbelah, tidak ada yang error.
      `identitasMaster()` sekarang mengambil nama dan lot **dari sheet**, bukan
      dari kiriman.
    - **Sekali `setValues()` selebar baris mematikan seluruh barisnya.** Nilai
      yang terbaca dari sel berumus adalah hasil hitungannya; menuliskannya
      kembali mengganti rumusnya dengan angka mati. `writeRow()` sekarang
      melewati setiap sel berumus dan menulis per deret kolom berdampingan,
      lalu melaporkan yang dilewati di `dilewati`.
    - **Rumusnya habis di baris tertentu.** Lot ke-330 di sheet yang rumusnya
      ditarik sampai baris 501 tetap muncul; lebih dari itu tidak muncul di mana
      pun. `tarikBarisMaster_()` menyalin rumus satu baris ke bawah
      (PASTE_FORMULA, hanya kolom yang memang berumus) lalu mencari ulang.

    `findMasterRow()` mencoba Kode + Lot dulu (itu yang dikirim dashboard), lalu
    **Nama + Lot** — kunci sejati workbook ini, satu-satunya yang menemukan lot
    yang kodenya belum ada di Daftar Kode.

11a. **Rumus Master Stok tidak seragam — sebagiannya bisa basi diam-diam.**
    Kolom masuk/keluar mencocokkan kategori sebagai **teks harfiah**, dan
    teksnya ikut tertulis di tiap baris. Pada 24 Nov 2026 baris 372–385
    ternyata menguji `="Pembelian"` sementara 367 baris di atasnya menguji
    `="Pembelian 2026"`. Daftar validasi tab Penerimaan tidak punya
    "Pembelian" telanjang, jadi SUMPRODUCT-nya nol di keempat belas baris itu
    dan **547 unit hilang tanpa satu pun sel merah**.

    Yang membuatnya mahal: nama, lot, kategori dan rentang semuanya benar, dan
    gviz hanya mengirim hasil hitungan — rumusnya sendiri tidak pernah ikut.
    Empat dugaan dikejar sebelum sebabnya ketemu. Karena itu sekarang ada
    `maintenance.rumus` (lihat Mode input): ia mengembalikan rumus apa adanya
    plus ringkasan pola per kolom, sehingga baris yang menyimpang tampak
    sebagai pola kedua berjumlah kecil.

    **Tahun 2026 itu harfiah di ~381 baris.** Begitu daftar kategori berganti
    ke "Pembelian 2027", seluruh kolom Pembelian nol dengan cara yang sama.
    Obatnya `(LEFT(Penerimaan!$M$5:$M$1098;9)="Pembelian")`, tapi itu sheet
    Dinda — ditawarkan, bukan dikerjakan sendiri.

    Contohnya sudah ada di sheet itu sendiri: kolom Titipan Daerah (L)
    memakai `ISNUMBER(SEARCH("Titipan"; …))`, bukan kesamaan persis, jadi ia
    kebal terhadap pergantian tahun. Kolom Distribusi (M) dan Pemusnahan (N)
    tidak menyaring kategori sama sekali.

    Rentangnya sendiri lapang, jadi bukan itu yang perlu dikhawatirkan
    (24 Nov 2026): Penerimaan terpakai sampai baris 386 dari 1098, Distribusi
    117 dari 1002, Pemusnahan 94 dari 994. Seluruh tujuh kolom berumus
    (I sampai O) kini seragam — satu pola per kolom di ketiga ratus delapan
    puluh satu barisnya, diperiksa lewat `maintenance.rumus`.

12. **Tiap tab punya daftar validasi Kategori sendiri, dan isinya berbeda.**
    Penerimaan kolom M: `Stok Awal / Pembelian 2026 / Hibah / Titipan Daerah`.
    Distribusi kolom I: `Hibah / Titipan Daerah / **Pembelian**` — tanpa tahun,
    dan tanpa "Stok Awal", yang justru kategori asal banyak lot.

    Di penerimaan kategori **wajib dan harus persis**: ia yang menentukan qty-nya
    masuk ke kolom yang mana, dan ejaan yang meleset mendarat di kolom lain
    (atau tidak di mana pun) tanpa error. Daftarnya dibaca dari validasi selnya,
    tidak dihafal di kode — tahun depan "Pembelian 2026" berganti sendiri.
    Di baris keluar kategori cuma keterangan: yang tidak ada di daftar
    **dikosongkan dan dilaporkan**, bukan dipakai menolak pengeluaran yang sah.

13. **Kesembilan langkah uji terima lulus di salinan** (17 Nov 2026), tiga kali
    berturut-turut: `npm run accept`. Dua harapan di daftar lama ternyata salah
    dan sudah diperbaiki, bukan dipaksa lulus:

    - "lot habis jadi TIDAK AKTIF" — Status adalah rumus tanggal kedaluwarsa;
      menulis TIDAK AKTIF ke sana justru merusaknya. Yang diperiksa sekarang:
      sisa benar-benar nol **dan rumus Status-nya masih utuh**.
    - "lot baru punya kode sendiri" — kode ditentukan sheet dari Daftar Kode.
      Lot baru dicari lewat nama + lot.

    Yang masih tertinggal: `metode` dan `lokasi` di form pemusnahan dihapus
    karena tab Pemusnahan tidak punya kolomnya (`setIfCol` akan mengisinya
    sendiri kalau kolomnya ditambahkan). **Mode input kini sudah terpasang di
    workbook asli** — lihat bagian Mode input di bawah; yang belum pernah
    terjadi hanyalah penulisan transaksi sungguhan lewat dashboard.

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

## Angka acuan (17 Nov 2026)

Dipakai untuk memastikan tidak ada yang rusak setelah perubahan. Jalankan
`npm run verify`. Angka ini bergerak sendiri setiap kali Dinda mengisi sheet —
yang penting bukan nilainya persis, tapi tiga baris terakhir tetap **cocok**.

| | |
|---|---|
| Lot / reagen / total stok | 326 · 236 · 3097 |
| Risiko (expired / ≤30 / ≤90 / ≤180 / aman / tanpa tanggal) | 98 · 11 · 17 · 22 · 97 · 81 |
| Stok rendah / habis | 201 · 115 |
| Kedaluwarsa tapi AKTIF | 0 |
| Sisa Stok tidak cocok | 0 |
| Tanpa supplier / tanpa lot | 112 · 53 |
| COA / MSDS | 54 · 39 dari 326 baris penerimaan |
| Baris transaksi tanpa induk / berkode beda | 0 · 5 |
| Baris berbeda yang perlu dirapikan | 186 |
| Rekonsiliasi | Penerimaan ✓ 3646=3646 · Distribusi ✓ 135=135 · Pemusnahan ✓ 414=414 |

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
js/pages/             dua belas halaman
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
**terhadap keempat permukaan gelap yang sekarang** (18 Nov 2026), bukan lagi
cuma permukaan biru lama: Sakura `#1f171d`, Mint `#121e1a`, Lavender `#17162a`,
Peach `#211711`. Yang diuji: trio kategorikal instalasi (`#3987e5 · #d95926 ·
#199e70`), pasangan dua seri timeline (`--series-1` vs `--critical`), dan ramp
ordinal lima langkah. **Lulus di keempatnya**, tanpa FAIL maupun WARN, dan
nilai `--surface`/`--series-1` yang dibaca dari halaman yang berjalan sama
persis dengan yang diuji.

Yang paling tipis `--critical` `#d03b3b` di atas Mint: **3,56:1**, masih di
atas ambang 3:1. Mint selalu paling tipis karena hijau menyumbang paling besar
ke luminansi — `#121e1a` yang tampak paling gelap justru luminansinya tertinggi
dari keempatnya. Selisih kontras antar tema paling besar cuma ~4%, jadi
**tema warna bukan faktor penentu di sini**; yang menentukan tetap warna
series-nya sendiri. Kalau ada biji permukaan gelap baru, ulangi pengukurannya —
perintahnya ada di komentar kepala `css/tokens.css`.

Satu jebakan pengukuran, supaya tidak dikira temuan: memasukkan `--warning`
`#fab219` ke validator selalu FAIL "lightness band", di permukaan lama maupun
baru. Pita lightness adalah syarat palet **kategorikal** (supaya antar-seri
terbaca setara); status memang sengaja tidak setara, dan selalu tampil bersama
bentuk (`toneMark`) dan teks. Kontras status sendiri lulus di semua permukaan.

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

## Laporan

Empat laporan yang diminta Dinda ada di satu halaman (`js/pages/laporan.js`),
dipilih lewat parameter `jenis`: `stok`, `penerimaan`, `distribusi`,
`kedaluwarsa`. Satu berkas karena keempatnya berbagi kerangka yang sama —
pilih periode, ringkas per instalasi, rinci per baris, cetak bertanda tangan;
yang berbeda hanya sumber barisnya.

Pembedaan yang penting: **dua laporan periodik, dua laporan potret.**
Penerimaan dan distribusi barisnya kejadian, jadi punya rentang tanggal dan
kepala laporannya berbunyi "Periode …". Stok per instalasi dan kedaluwarsa
barisnya keadaan hari ini — memberi mereka rentang tanggal justru
menyesatkan, karena angkanya tidak akan berubah karenanya. Karena itu
pemilih periodenya tidak muncul di sana dan kepalanya berbunyi "Per …".
Berpindah ke laporan potret juga **membuang** parameter periodenya, supaya
tidak ada judul periode yang menempel di angka yang tidak mengikutinya.

Bakunya **bulan berjalan**, karena ini dipakai sebagai laporan bulanan. Kalau
bulan itu kosong, keadaan kosongnya menyebutkan sendiri bahwa periodenya yang
kosong dan menawarkan tombol "Lihat semua periode" — bukan tabel kosong tanpa
penjelasan.

Baris transaksi **tanpa tanggal** tidak bisa masuk periode mana pun. Daripada
hilang diam-diam dari laporan yang dipakai untuk menandatangani sesuatu,
jumlahnya dihitung dan ditampilkan sebagai peringatan di atas tabelnya.

Yang dicetak disusun ulang dari data, bukan versi layar yang disembunyikan
sebagian: dokumen yang ditandatangani tidak boleh membawa tombol, chip warna,
atau kolom "Baris" yang hanya berguna di layar. Angkanya diverifikasi langsung
ke sheet saat dibuat (24 Nov 2026): penerimaan November 106 baris / 2.712 unit
/ 101 jenis / 6 instalasi, distribusi seluruh periode 113 baris / 135 unit,
kedaluwarsa 98 lot — ketiganya cocok persis dengan hitungan langsung dari gviz.

## Label stiker

Stiker mini untuk ditempel di botol reagen, dua ukuran yang diminta Dinda:
6×4 cm dan 5×3 cm. Bentuk labelnya ada di `js/ui/label.js` dan dipakai
bersama oleh halaman Label (`js/pages/label.js`, selembar penuh) dan tombol
"Cetak label" di Kartu Stok (satu stiker) — supaya keduanya tidak pernah
berbeda bentuk.

**Tiga kolom untuk kedua ukuran.** Empat label 5 cm butuh 200 mm sementara
A4 hanya 210 mm, jadi margin halamannya harus ditekan sampai 5 mm — lebih
dekat ke tepi daripada yang bisa dicetak banyak pencetak. Kolom terakhirnya
akan terpotong di sebagian pencetak dan utuh di sebagian lain, dan itu baru
ketahuan setelah stikernya tercetak. Tiga kolom aman di mana pun; sela antar
label justru tempat menggunting.

**Margin `@page` turun dari 14 mm ke 10 mm** supaya tiga kolom 6 cm (184 mm)
muat di 190 mm ruang cetak. Ini mengubah seluruh dokumen cetak, bukan cuma
label — tapi arahnya melonggarkan, jadi kartu stok yang dulu terukur 161 mm
dari 269 mm sekarang punya 277 mm dan tetap muat satu lembar. Terukur
24 Nov 2026: label 6×4 persis 60×40 mm dengan grid 184 mm, label 5×3 persis
50×30 mm dengan grid 154 mm, keduanya di bawah 190 mm.

Jumlah per lembar (`baris` di `UKURAN_LABEL`) dihitung dari 277 mm dengan
sela 2 mm: 6×4 → 6 baris (18 label), 5×3 → 8 baris (24 label). **Hitung ulang
kalau tinggi, sela, atau margin halamannya diubah** — angkanya dipakai
memberi tahu pengguna berapa lembar yang akan keluar.

Memilih lot pakai centang, bukan "cetak semua yang tampil": stiker dicetak
untuk botol yang baru datang, dan mencetak 381 label karena filternya kelewat
longgar menghabiskan satu rim kertas stiker yang tidak bisa ditarik kembali.
Pilihannya disimpan di memori modul, bukan di URL — 60 nomor lot tidak muat
di tautan.

Simbol B3 ikut kalau kolom Simbol B3 sudah diisi. Kalau belum, labelnya
tercetak tanpa simbol **dan halamannya mengatakan berapa banyak yang begitu**:
yang memegang stiker tidak bisa membedakan "tidak berbahaya" dari "belum
diperiksa", jadi perbedaan itu harus disebut sebelum stikernya dicetak.

### Dokumen cetak lepas

`printDocument()` di `js/ui/export.js` dipakai keempat dokumen cetak terpisah
(berita acara pemusnahan, daftar tindak lanjut, laporan, lembar label). Ia
memasang penanda `sedang-cetak` di `<body>`, dan `print.css` memakai penanda
itu untuk menyembunyikan `.main`.

Ini memperbaiki cacat yang sudah lama ada: `@media print` hanya menyembunyikan
kerangka (sidebar, topbar, tombol), sementara kartu-kartu halamannya tetap
ikut tercetak — jadi dokumen yang mau ditandatangani baru muncul di halaman
kedua, di bawah tangkapan dashboard. Tidak kelihatan sama sekali di layar,
hanya di kertas, dan karena itu bertahan sejak berita acara pemusnahan dibuat.

## Notifikasi kedaluwarsa

Dua bagian yang sengaja berbeda sifatnya:

1. **Surel mingguan** (`apps-script/Notifikasi.gs`) — satu-satunya yang
   sampai **tanpa ada yang membuka dashboard**. Pemicu waktu di proyek
   Apps Script, baku Senin 07.00 Asia/Jakarta.
2. **Kartu "sejak kunjungan terakhir"** di Dashboard (`js/data/notifikasi.js`)
   — mencatat kunci lot yang sudah pernah dilihat di localStorage, lalu
   menampilkan yang belum pernah ada di catatan itu.

**Keduanya memakai aturan yang sama persis:** sudah lewat tanggal atau masuk
ambang kritis (30 hari), **dan sisa stoknya masih ada**. Dua sumber kabar
dengan aturan berbeda akan menghasilkan dua angka berbeda untuk hal yang
sama, dan yang membacanya tidak punya cara tahu mana yang benar.

**Angkanya jauh lebih kecil dari halaman Kedaluwarsa, dan itu disengaja.**
Per 24 Nov 2026 halaman Kedaluwarsa menghitung 98 lot; notifikasi menghitung
10. Bedanya lot yang sisanya sudah nol: tidak ada yang perlu ditarik dari
rak, jadi mengabarkannya hanya memanjangkan daftar dengan baris yang tidak
bisa ditindaklanjuti. Surelnya **menyebutkan sendiri** berapa yang dilewati
karena alasan itu — selisih yang tidak dijelaskan selalu dikira kesalahan.

**Mingguan, bukan harian.** 98 lot kedaluwarsa akan tetap 98 besok. Surel
harian berisi daftar yang sama persis dibaca dua kali lalu difilter ke folder
lain selamanya, dan notifikasi yang diabaikan lebih buruk daripada tidak ada
notifikasi — ia memberi rasa aman tanpa memberi kabar. Karena itu tiap surel
menandai di paling atas apa yang **baru** sejak kiriman terakhir, dibanding
lewat sidik MD5 4 bita per lot di `NOTIF_SIDIK_TERAKHIR` (menyimpan kuncinya
utuh bisa menembus batas 9 KB per properti). Sidiknya disimpan **sesudah**
kirim berhasil, supaya kegagalan tidak menghapus status "baru" lot yang
belum pernah dikabarkan.

Kartu di Dashboard diam pada kunjungan pertama: tanpa pembanding, "semua lot
ini baru" adalah kabar yang salah. Kalau tidak ada yang baru ia juga diam,
tapi catatannya tetap diperbarui.

**Penerimanya pemilik skrip sendiri** kalau `EMAIL_NOTIFIKASI` kosong, lewat
`Session.getEffectiveUser()`. Jadi tidak ada alamat surel yang perlu ditulis
di repositori ini, yang publik.

### Tanggal yang tidak pernah ada

Dua sel Exp. Date di Master Stok berisi tanggal yang tidak ada di kalender:
baris 208 `31 Feb 2026` (MIXING HPV PIDIE, 23 unit) dan baris 242
`31 Nov 2029` (MHA). Keduanya tulisan, bukan tanggal.

**Dashboard tidak bisa melihatnya sama sekali.** Kolomnya bertipe tanggal,
jadi gviz mengembalikan sel seperti itu sebagai kosong — tidak ada cara
membedakannya dari sel yang memang belum diisi. Skrip Apps Script membacanya
langsung, jadi ia bisa.

Akibatnya halus dan sempat terjadi: `new Date("31 Feb 2026")` menggulung
sendiri jadi 3 Maret, jadi surel melaporkan reagen itu kedaluwarsa karena
tanggal yang tidak pernah ada — dan angkanya (3 lot) berbeda dari kartu di
Dashboard (2 lot) untuk hal yang persis sama. `notifBacaTanggal_()`
sekarang **ketat**: hanya nilai Date yang diterima, dan tulisan yang bukan
tanggal dilaporkan sebagai temuan tersendiri di surel. `-`, `NA` dan
`n/a` tidak ikut dilaporkan, karena itu penanda "tidak punya masa
kedaluwarsa" yang memang disengaja.

Sesudah diperbaiki keduanya sepakat: 2 lot kedaluwarsa + 8 kritis = 10 lot
yang dikabarkan, dan 136 lot tanpa tanggal di kedua sisi.

### Scope baru butuh otorisasi ulang sekali

Mengirim surel dan memasang pemicu menambah tiga scope ke manifes
(`script.send_mail`, `script.scriptapp`, `userinfo.email`). Otorisasi
penerapan yang lama jadi tidak cukup, dan **Google hanya menampilkan layar
persetujuannya kalau ada orang yang menjalankan fungsi dari editor** — tidak
bisa lewat web app, tidak bisa lewat `clasp`.

Karena itu ada `otorisasi()` di `Notifikasi.gs`: ia menyentuh ketiga izin itu
dengan panggilan yang tidak berakibat apa-apa (`getRemainingDailyQuota()`
butuh izin kirim surel tapi tidak mengirim satu pun), jadi yang memberi izin
tidak perlu mempertaruhkan satu surel pun. Jalankan sekali, lalu sisanya bisa
lewat endpoint.

Bagian spreadsheet tetap jalan selama izin baru belum diberikan — yang gagal
hanya aksi notifikasinya, dengan pesan yang menyebut scope-nya.

### Aksi endpoint

- `notifikasi.pratinjau` — menyusun surelnya dan mengembalikannya **tanpa
  mengirim**. Baca saja, tanpa kunci dan tanpa `requestId`.
- `notifikasi.status` — pemicu yang terpasang, penerima, ambang, kiriman
  terakhir.
- `notifikasi.kirim` — benar-benar mengirim. `paksa: true` mengirim walau
  tidak ada yang melewati ambang (tanpa itu ia diam, karena surel "semuanya
  aman" tiap minggu adalah cara tercepat membuat orang berhenti membaca).
- `notifikasi.pasangPemicu` `{hari, jam}` — hari SENIN..MINGGU. Pemicu lama
  dihapus lebih dulu; memanggilnya dua kali tidak boleh jadi dua surel.
- `notifikasi.hapusPemicu`, `notifikasi.properti` — yang terakhir hanya boleh
  menyetel kunci di daftar `NOTIF_PROPERTI`, supaya jalur yang dibuat untuk
  mengatur alamat surel tidak pernah bisa mengubah `SPREADSHEET_ID` atau
  `API_TOKEN`.

## Mode input

Membaca lewat gviz; menulis lewat Web App Apps Script yang **sudah terpasang
dan hidup di workbook asli**. Selama endpoint kosong di `config.js`,
dashboard berjalan penuh dalam mode baca dan halaman Transaksi menampilkan
kartu penyiapan.

Produksi: proyek Apps Script mandiri **`Reagensia writer`**
(`1qJTOyB9khaUdmWApuOwLyjGlyffVyrA2MJPmmDvwgMEf1wLJo3TdvCvN`), penerapan
`AKfycbzpO3SVCuQ0vS5HOGwt_qqigIScSUjEt65ctL7XBGr70qtI-elCiPAmqCd2IkgBBZqF`.
GET telanjang ke `/exec` tidak butuh token dan menyebutkan versi serta
workbook yang dilayaninya — cara tercepat memastikan penerapan mana yang
sedang hidup.

Salinan uji: `SALINAN UJI — Reagensia`
(`1gaLJHMk6flH07mHl1zW6d-hdq44t9a_vyBfVh9oO_ec`), proyek Apps Script
`1AWKm8_5jDecTOQP0W1yYyhLvACIV7ZnrPjaEIvYsLxZAZU_f4Bh6rDF6`, didorong lewat
`clasp` dari folder `apps-script/` (`.clasp.json` sengaja tidak masuk repo).

**Periksa `.clasp.json` sebelum `clasp push`.** Karena ia tidak ikut repo, ia
gampang tertinggal menunjuk salinan uji sementara yang hidup adalah proyek
produksi — persis yang terjadi sampai 24 Nov 2026. `clasp list` menampilkan
proyek milik akun yang sedang login, dan `clasp list-deployments` menampilkan
penerapannya; keduanya lebih bisa dipercaya daripada berkas itu.

`apps-script/DEPLOY.md` memuat langkah pemasangan serta daftar uji terima. Yang
memasang di workbook asli adalah pemilik spreadsheet, bukan kita.

**Pemasangannya mandiri, bukan terikat** — ini bukan selera. Di workbook asli
sudah ada skrip terikat milik orang lain ("V2.6" / LIMS Lite, ikut tersalin ke
setiap salinan) yang juga mendefinisikan `doGet` dan `doPost`. Apps Script
menaruh semua berkas satu proyek ke **satu ruang nama global**, jadi
menempelkan `Code.gs` di sebelahnya membuat salah satu `doPost` menang tanpa
suara. Skrip itu pun sudah usang: `SPREADSHEET_ID`-nya menunjuk `MONITORING
REAGENSIA 1` (Juni 2026), bukan workbook yang dipakai sekarang.

Karena itu `book()` di `Code.gs` adalah satu-satunya pintu ke spreadsheet:
ia membuka `SPREADSHEET_ID` dari Script Properties kalau ada, dan jatuh ke
`getActive()` kalau kosong — **satu berkas yang sama jalan di kedua cara
pemasangan**, dan itulah yang membuat salinan bisa diuji sebelum workbook asli
disentuh. Kesembilan uji terima lulus lewat jalur mandiri, tiga kali
berturut-turut (17 Nov 2026), jadi `openById()` + `flush()` + spill `UNIQUE()`
+ `PASTE_FORMULA` memang bekerja tanpa terikat.

Konsekuensinya ada sumber kebenaran kedua: `SPREADSHEET_ID` milik endpoint.
Id yang tidak bisa dibuka gagal berisik, tapi id workbook **lain** yang valid
tidak — angka dibaca dari satu workbook, transaksi ditulis ke workbook lain,
tanpa satu pun galat. Jadi `ping` mengembalikan `spreadsheetId` dan
`spreadsheetName`, dan halaman Pengaturan mencocokkannya dengan
`CONFIG.spreadsheetId`: kalau berbeda ia memasang peringatan merah yang
menetap **dan mengunci sakelar mode input** sampai keduanya sama. Jangan
diturunkan jadi toast biasa.

Dua aksi perawatan ditambahkan 24 Nov 2026 (v1.1.0), keduanya butuh `API_TOKEN`:

- **`maintenance.rumus`** `{sheet, a1}` — baca saja, tanpa kunci dan tanpa
  `requestId`. Mengembalikan rumus tiap sel plus ringkasan pola per kolom:
  nomor baris milik baris itu sendiri diganti `{b}`, jadi kolom yang seragam
  runtuh jadi satu pola. Nomor di dalam acuan rentang (`$E$5:$E$1098`) sengaja
  dibiarkan — rentang kependekan juga sebentuk penyimpangan.
- **`maintenance.salinRumus`** `{sheet, sumber, tujuan}` — menyalin rumus satu
  baris ke bawah. Kolom yang di sumbernya bukan rumus **dilewati** (menyalin
  nilai mati ke bawah adalah cara paling gampang mematikan kolom berumus), dan
  tanpa `terapkan: true` ia hanya mengembalikan rencananya.

`Formulas.gs` ada di `.claspignore` dan **tidak ikut terpasang**: ia memasang
SUMIFS di Master Stok dan menolkan Stok Awal dengan premis yang sudah
kedaluwarsa (catatan 11), jadi menjalankannya akan menimpa rumus milik Dinda.
Berkasnya tetap di repo sebagai catatan bentuk rumusnya.

Untuk menguji alur formnya tanpa menyentuh spreadsheet mana pun:
`npm run mock` (token `rahasia-uji`), lalu isi halaman Pengaturan dengan
`http://localhost:8787`. Tiruan itu mengikuti kontrak yang sama, termasuk
penolakan kiriman ganda dan pemeriksaan sisa stok.

Untuk menguji Code.gs yang sungguhan di salinan workbook:

```bash
cd apps-script && clasp push --force && clasp deploy -i <deploymentId>
npm run accept -- --url <URL /exec> --token <token> --sheet <id salinan>
```

`tools/acceptance.mjs` **menolak berjalan terhadap workbook produksi** (dicocokkan
dengan `CONFIG.spreadsheetId`). Salinannya harus dibagikan "siapa saja yang
memiliki link → Pelihat": uji terima membaca ulang hasilnya lewat gviz tanpa
login, persis seperti dashboard, supaya yang memeriksa bukan skrip yang barusan
menulisnya. Setiap kali dijalankan ia meninggalkan satu lot uji dan beberapa
baris transaksi bertanda "uji terima" — segarkan salinannya sebelum pengujian
yang serius.

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
core.sshCommand ssh -i C:/Users/dK/.ssh/reagensia_deploy_2026 -o IdentitiesOnly=yes
user.name       Dinda
user.email      321590626+ruangkerjadinda@users.noreply.github.com
```

**Alamat noreply harus bentuk ber-ID** (`321590626+…`). Bentuk tanpa ID hanya
tertaut ke profil untuk akun lama; akun Dinda dibuat belakangan, jadi
commit-nya tampil tanpa tautan ke profilnya. Seluruh riwayat sudah ditulis
ulang ke bentuk ini pada 18 Nov 2026 — lihat **Kepemilikan akun** di bawah.

Semuanya sudah terpasang: deploy key dengan akses tulis, Pages dari `main` /
root, domain `ruangkerjadinda.space` (A record apex ke `185.199.108–111.153`,
CNAME `www`), dan **Enforce HTTPS aktif** — `http` dialihkan 301 ke `https`.

Semua path di aplikasi relatif, jadi jalan sama saja di akar domain maupun di
`/reagensia`.

## Kepemilikan akun

Proyek ini dibuat dari PC yang juga memakai akun lain, jadi kepemilikan tiap
bagian pernah tercampur. Diberesi tuntas pada 18 Nov 2026. **Semuanya kini atas
nama `ruangkerjadinda@gmail.com` / GitHub `ruangkerjadinda`**: spreadsheet
produksi, repositori dan Pages, proyek Apps Script "Reagensia writer", login
`clasp` di PC ini, `SALINAN UJI — Reagensia`, serta kedua folder Drive MSDS.

Dua hal yang perlu diingat dari pemberesan itu:

1. **Riwayat git ditulis ulang, lalu repositorinya dihapus dan dibuat ulang.**
   Tiga commit pertama ditulis atas nama akun lain yang dipakai di PC yang
   sama, dan satu commit dari web GitHub memuat alamat Gmail asli Dinda. Semua
   commit ditulis ulang ke
   `Dinda <321590626+ruangkerjadinda@users.noreply.github.com>` tanpa mengubah
   isi berkas sama sekali. **Force-push saja tidak cukup** — commit lama tetap
   bisa dibuka lewat SHA-nya dan masih muncul di pencarian commit GitHub, jadi
   repositorinya dihapus dan dibuat ulang dari riwayat bersih. Sesudahnya
   kelima SHA lama mengembalikan 422 dan pencarian beralamat akun lama
   mengembalikan 0.

   Akibat sampingannya: **deploy key lama mati permanen.** Satu kunci hanya
   boleh dipakai satu repo di seluruh GitHub, dan repo yang dihapus masih
   memesannya (bisa dipulihkan sampai 90 hari), jadi kunci itu ditolak dengan
   `key is already in use`. Kunci penggantinya `~/.ssh/reagensia_deploy_2026`;
   yang lama boleh dihapus dari disk setelah masa pemulihan repo lewat.

2. **Pemindahan kepemilikan spreadsheet tidak mengubah id berkas**, jadi
   `CONFIG.spreadsheetId` dan seluruh `gid` tetap berlaku — tidak ada satu
   baris kode pun yang perlu disentuh, dan itu sebabnya memindahkan jauh lebih
   murah daripada menyalin. Dua hal diperiksa sesudahnya dan keduanya aman:
   "siapa saja yang punya tautan dapat melihat" masih menyala (gviz membaca
   tanpa login), dan pemilik skrip tetap punya akses tulis. Pemilik lama
   otomatis turun jadi editor; boleh dicabut kalau memang tidak diperlukan.

`gh` CLI di PC ini login sebagai akun lain dan hanya dipakai membaca status
Actions; ia tidak punya akses tulis ke repo ini — push lewat deploy key, bukan
lewat akun itu. Berkas ini sengaja tidak menyebut alamat surel atau nama akun
siapa pun selain yang sudah publik: repositorinya publik, jadi apa pun yang
ditulis di sini ikut terbaca semua orang.

## Yang belum dikerjakan

- Level 3 (ilustrasi, animasi) **ditunda** — bukan ditolak.
- Tulisan pertama lewat dashboard ke workbook asli belum pernah dijalankan;
  tab `Log` belum ada, dan itu penanda paling jelas bahwa jalurnya belum
  pernah dipakai sungguhan.

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
- **`spreadsheetId` tidak bisa diubah dari dashboard.** Ia ada di `FIXED_KEYS`
  (`js/config.js`): nilai yang tersimpan di localStorage diabaikan saat dibaca
  *dan* dibuang saat penyimpanan berikutnya, jadi satu-satunya cara mengganti
  sumber data adalah mengubah berkas itu lalu mendorongnya ke repositori. Ini
  disengaja — angkanya dipakai banyak orang untuk mengambil keputusan, dan
  "sumber datanya ternyata bukan yang itu" adalah kegagalan yang tidak
  kelihatan. Halaman Pengaturan memang tidak pernah punya kolom isian untuk
  ini; yang baru adalah jaminannya.

- Kartu Stok punya **dua tata letak terpisah**: yang di layar (kartu + tabel
  mutasi lengkap dengan nomor baris sheet) dan yang dicetak (`printCard()` di
  `js/pages/kartustok.js`, gaya `.kartu-cetak*` di `css/print.css`). Yang
  dicetak sengaja bukan versi layar yang disembunyikan sebagian: bentuknya
  meniru kartu manual yang ditempel di lemari pendingin — blok identitas
  berkotak, tabel mutasi berkolom Paraf, baris kosong diganjal sampai 14 supaya
  masih bisa ditulis tangan, dan semuanya **muat satu lembar A4** (terukur
  ±161 mm dari 277 mm ruang cetak — dulu 269 mm, lihat bagian Label soal
  margin halaman). Kalau ukuran huruf atau tinggi barisnya
  diubah, hitung ulang batas itu.

- Halaman Audit memperlakukan sheet sebagai sumber yang **bisa salah**, dan
  setiap temuan menunjuk balik ke nomor barisnya di Google Sheets.
