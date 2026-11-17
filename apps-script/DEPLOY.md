# Memasang Web App penulis (mode input)

Dashboard Reagensia **membaca** spreadsheet langsung dan tidak butuh berkas ini
sama sekali. Semua halaman — Dashboard, Inventori, Kedaluwarsa, Stok, Alert,
Audit Data, COA & MSDS, Kartu Stok — berjalan penuh tanpa memasang apa pun.

Berkas ini hanya diperlukan kalau baris transaksi mau **ditambahkan dari
dashboard**, bukan diketik langsung di Google Sheets.

Yang memasang harus punya akses **edit** ke spreadsheet MONITORING REAGENSIA.

---

## Sebelum mulai: pasang di salinan dulu

Langkah ini bukan formalitas. Skrip ini menulis ke inventaris laboratorium yang
dipakai orang lain, dan sekali baris masuk, membatalkannya harus lewat Google
Sheets.

1. Buka spreadsheet asli → **File → Buat salinan**.
2. Beri nama misalnya `MONITORING REAGENSIA — UJI COBA`.
3. Lakukan seluruh langkah di bawah pada salinan itu.
4. Jalankan daftar periksa di bagian **Uji terima**.
5. Baru setelah semuanya lulus, ulangi pemasangan di spreadsheet asli.

---

## 1. Buat proyeknya — **mandiri**, bukan di dalam spreadsheet

> **Jangan lewat Extensions → Apps Script.** Di workbook MONITORING REAGENSIA
> sudah ada skrip terikat milik orang lain ("V2.6" / LIMS Lite) yang juga
> mendefinisikan `doGet` dan `doPost`. Apps Script menaruh semua berkas dalam
> satu proyek ke **satu ruang nama global**, jadi menempelkan `Code.gs` di
> sebelahnya membuat salah satu `doPost` menang tanpa suara dan yang lain
> lenyap — tanpa galat, tanpa peringatan. Proyek mandiri tidak berbagi ruang
> nama dengan siapa pun, dan skrip yang sudah ada di sana tidak tersentuh
> sama sekali.

1. Buka **[script.google.com](https://script.google.com)** → **New project**.
2. Hapus isi `Code.gs` bawaan, tempel seluruh isi berkas `Code.gs` dari folder
   ini.
3. Beri nama proyeknya, misalnya `Reagensia writer`.
4. **Simpan** (ikon disket atau Ctrl+S).

`Formulas.gs` **tidak ikut dipasang.** Ia menulis ulang rumus Master Stok
dengan premis yang sudah kedaluwarsa (lihat catatan di kepala berkasnya).

## 2. Pasang dua Script Properties

Proyek mandiri tidak tahu sendiri workbook mana yang dilayaninya, dan token
menahan penulisan iseng dari luar.

1. Di editor Apps Script: **Project Settings** (ikon roda gigi kiri).
2. Gulir ke **Script Properties → Add script property**, isi **dua** baris:

| Property | Value |
|---|---|
| `SPREADSHEET_ID` | `1KBrL4OB_ub_ie7OCIFTGcd-gIY0hy8ApiTGnIyQTu7k` — atau, selama uji coba, id **salinan**-nya |
| `API_TOKEN` | teks acak yang panjang, misalnya `rgn-7Kq2xP9mLd4vWn8sTb3h` |

3. **Save script properties**.

Id workbook adalah bagian tengah URL-nya:
`docs.google.com/spreadsheets/d/`**`<id ini>`**`/edit`.

**Jangan pakai ulang kata sandi apa pun sebagai token.** Ia terkirim dari
halaman dan bisa dibaca siapa saja yang membuka devtools di komputer pengguna;
fungsinya penghalang sederhana, bukan pengamanan sekuat kata sandi.

Salah isi `SPREADSHEET_ID` tidak berbahaya: id yang tidak bisa dibuka membuat
skrip menolak jalan dengan pesan yang jelas, dan id workbook **lain** yang
valid ketahuan di langkah 5 — dashboard mencocokkannya dan mematikan mode
input sampai keduanya sama.

> **Kalau lebih suka terikat ke spreadsheet** (misalnya di workbook yang tidak
> punya skrip lain): buat proyeknya lewat **Extensions → Apps Script** dan
> kosongkan saja `SPREADSHEET_ID`. Skrip jatuh ke `getActive()` sendiri.
> Selebihnya sama persis.

## 3. Periksa kolomnya ketemu

Sebelum di-deploy, pastikan skrip mengenali struktur sheet ini.

1. Kembali ke editor kode.
2. Pilih fungsi **`selfTest`** di kotak dropdown atas, klik **Run**.
3. Google akan meminta izin — setujui (**Review permissions → pilih akun →
   Advanced → Go to … → Allow**). Ini normal: skrip memang perlu izin menulis ke
   spreadsheet ini.
4. Buka **Execution log**. Yang harus terlihat:
   - `"pemasangan": "mandiri"` dan `spreadsheetName` yang **benar** — ini
     pemeriksaan pertama bahwa `SPREADSHEET_ID` menunjuk workbook yang dimaksud
   - `"token": "terpasang"`
   - `master.cols` berisi angka untuk semua kolom (tidak boleh ada yang `0`)
   - `tabs` berisi tiga tab dengan `headerRow` masing-masing
   - `repairPreview.rows` berisi daftar baris yang Sisa Stok-nya ditulis manual

Kalau ada kolom bernilai `0`, judul kolom di sheet berbeda dari yang dicari.
Perbaiki judulnya di sheet, atau tambahkan nama alternatifnya di fungsi
`masterContext()` pada `Code.gs`.

## 4. Deploy

1. **Deploy → New deployment**.
2. Klik ikon roda gigi di sebelah "Select type" → pilih **Web app**.
3. Isi:
   - Description: `Reagensia writer v1`
   - **Execute as: Me** (akun Anda) — supaya skrip punya izin menulis
   - **Who has access: Anyone** — dibutuhkan karena dashboard adalah halaman
     statis tanpa login. Inilah alasan token di langkah 2 penting.
4. **Deploy**, lalu salin **Web app URL**. URL-nya berakhiran `/exec`.

> URL yang berakhiran `/dev` **tidak akan bekerja** dari dashboard — itu URL
> pengembangan yang hanya bisa diakses oleh pemilik skrip.

## 5. Sambungkan ke dashboard

1. Buka dashboard → halaman **Pengaturan**.
2. Tempel URL `/exec` ke **URL Web App Apps Script**.
3. Tempel token yang sama persis ke **Token**.
4. Isi **Nama PIC** — nama ini ikut tercatat di kolom PIC dan di tab Log.
5. Klik **Simpan**, lalu **Uji koneksi**. Kalau berhasil, muncul pesan
   "Endpoint menjawab" beserta nomor versi dan **nama workbook** yang ditulisi.
   Cocokkan namanya.
6. Nyalakan sakelar **Nyalakan mode input**.

Kalau yang muncul justru peringatan merah **"Endpoint ini menulis ke workbook
yang berbeda"**, `SPREADSHEET_ID` di Script Properties menunjuk workbook lain
daripada yang dibaca dashboard. Sakelar mode input ikut dimatikan dan tetap
terkunci sampai keduanya cocok — perbaiki property-nya, lalu tekan **Uji
koneksi** lagi. Peringatan ini sengaja tidak bisa dilewati: angka dibaca dari
satu workbook dan transaksi ditulis ke workbook lain adalah kegagalan yang
tidak kelihatan di mana pun.

Tombol "+ Tambah …" akan muncul di halaman Transaksi.

---

## Uji terima (jalankan di salinan)

Kesembilan langkah ini sudah **diotomatiskan**. Setelah deployment jadi:

```bash
npm run accept -- --url <URL /exec> --token <token> --sheet <id salinan>
```

Ia menulis lewat Web App lalu membaca ulang hasilnya lewat gviz — jalur yang
sama dengan dashboard, tanpa login — supaya yang memeriksa bukan skrip yang
barusan menulisnya. Karena itu salinannya harus dibagikan **"Siapa saja yang
memiliki link → Pelihat"**. Terhadap workbook produksi ia menolak jalan.

Kalau mau dikerjakan tangan, lakukan berurutan dan periksa hasilnya langsung
di spreadsheet.

| # | Langkah | Yang harus terjadi |
|---|---|---|
| 1 | Tambah **Penerimaan** untuk lot yang sudah ada | Baris baru di tab Penerimaan; kolom masuk yang sesuai **Kategori**-nya (Stok Awal / Pembelian / Hibah / Titipan Daerah) pada baris Master Stok yang cocok bertambah; **Sisa Stok** ikut naik. Tidak boleh muncul baris Master Stok **kedua** untuk lot yang sama |
| 2 | Tambah **Penerimaan** dengan lot yang belum pernah ada | Baris baru di Penerimaan, **dan** baris Master Stok untuk lot itu muncul sendiri dengan Sisa Stok = qty. Kolom **Kode** ikut terisi hanya kalau nama reagennya sudah terdaftar di tab **Daftar Kode** — itu rumus sheet, bukan yang dikirim dashboard |
| 3 | Tambah **Distribusi** | Baris baru di tab Distribusi; kolom **Distribusi** di Master Stok bertambah; **Sisa Stok** turun |
| 4 | Tambah **Pemusnahan** | Baris baru di tab Pemusnahan; kolom **Pemusnahan** bertambah; Sisa Stok turun |
| 5 | Coba distribusi dengan qty lebih besar dari sisa stok | Ditolak dengan pesan "Sisa stok lot ini tinggal …" — tidak ada baris yang masuk |
| 6 | Klik "Simpan" dua kali cepat | Hanya satu baris yang masuk; muncul pesan "Kiriman ini sudah tercatat sebelumnya" |
| 7 | Periksa kolom **Sisa Stok** pada baris yang tersentuh | Isinya harus berupa **rumus** `=…`, bukan angka ketikan (klik selnya, lihat formula bar) |
| 8 | Buka tab **Log** | Ada satu baris per penulisan: waktu, aksi, status, PIC, requestId, payload |
| 9 | Distribusikan sampai sisa nol | **Sisa Stok** jadi 0 dan kolom **Status** masih berupa rumus. Status di workbook ini adalah rumus tanggal kedaluwarsa — `TIDAK AKTIF` di sana berarti lewat exp date, bukan stok habis — jadi yang salah justru kalau ia tertulis sebagai teks. Lot habis ditandai dashboard sendiri, dari Sisa Stok |

Kesembilan langkah ini **lulus di salinan pada 17 Nov 2026**, tiga kali
berturut-turut, lewat jalur mandiri (`SPREADSHEET_ID`) — jalur yang sama yang
dipakai di workbook asli.

Kalau kesembilan langkah lulus, pindahkan proyek yang **sama** ke workbook
asli: cukup ganti `SPREADSHEET_ID` di Script Properties dengan id workbook
asli, lalu **Deploy → Manage deployments → Edit → Version: New version →
Deploy**. Tidak perlu menempel ulang kodenya, dan URL `/exec`-nya tidak
berubah.

> Kalau lebih suka proyek uji dan proyek produksi benar-benar terpisah, buat
> proyek baru dengan langkah 1–4 dan ganti URL di Pengaturan dashboard. Yang
> penting hanya satu: **jangan** memasangnya lewat Extensions → Apps Script di
> workbook asli, karena skrip "V2.6" / LIMS Lite yang sudah ada di sana
> mendefinisikan `doGet` dan `doPost` yang sama.

---

## Yang dilakukan skrip ini

**Master Stok tidak ditulisi sama sekali.** Di workbook ini seluruh barisnya
turunan: Nama Reagen dan Kode/Lot adalah spill `UNIQUE()` dari tab Penerimaan,
kolom masuk/keluar `SUMPRODUCT` ke tab transaksi, Sisa Stok penjumlahannya.
Menambah baris transaksi memang sudah cukup — barisnya muncul dan berubah
sendiri. Dua hal yang dijaga skrip ini karena itu: nama reagen dan nomor lot
yang ditulis ke tab transaksi diambil **dari Master Stok**, bukan dari kiriman
(satu spasi di ujung nama sudah cukup untuk membelah satu lot jadi dua baris),
dan kalau rumus Master Stok kehabisan baris, rumusnya ditarik satu baris lagi
dengan menyalin dari baris terakhir yang sudah benar.

**Kolom yang berisi rumus tidak pernah ditimpa.** Kolom ringkasan di Master
Stok (Pembelian, Hibah, Titipan Daerah, Distribusi, Pemusnahan) sudah berupa
rumus ke tab transaksi, dipasang sendiri oleh pemilik spreadsheet. Jadi
menambah baris transaksi memang sudah cukup, dan skrip ini sengaja **melewati**
kolom yang berisi rumus: menimpanya dengan angka statis bukan cuma
menggandakan hitungan sekali — otomatisasi baris itu mati untuk seterusnya,
dan tidak ada yang kelihatan salah. Kalau suatu saat rumusnya dicopot, skrip
kembali menyesuaikan kolomnya sendiri, di dalam satu `LockService` yang sama
sehingga dua orang yang menyimpan bersamaan tidak saling menimpa.

**Kategori menentukan kolom masuknya.** Baris Penerimaan dengan Kategori
`Hibah` menambah kolom Hibah, `Titipan Daerah` menambah Titipan Daerah, `Stok
Awal` menambah Stok Awal, selebihnya masuk ke Pembelian.

**Rumus Sisa Stok hanya dipasang kalau belum ada.** Bentuknya
`=Stok Awal + Pembelian + Hibah + Titipan Daerah − Distribusi − Pemusnahan`
— empat kolom masuk, bukan dua. Sel yang sudah berisi rumus dibiarkan apa
adanya, karena rumus milik pemilik sheet bisa berbeda bentuknya dan lebih
benar. Untuk memperbaiki baris yang nilainya diketik manual, gunakan tombol di
Pengaturan → Pemeliharaan (jalankan **Uji coba** dulu untuk melihat baris mana
yang akan berubah).

**Kiriman ganda ditolak.** Dashboard mengirim `requestId` unik per penyimpanan;
skrip mengingatnya selama 6 jam. Klik dobel atau kirim ulang setelah jaringan
putus tidak akan pernah menghasilkan dua baris.

**Posisi baris judul dicari, bukan ditebak.** Master Stok punya judul di baris 3,
Distribusi di baris 4. Skrip memindai belasan baris pertama untuk menemukan
baris yang memuat "Instalasi", jadi menambah atau menghapus baris banner tidak
merusaknya. Nomor kolom juga dicari dari judulnya, sehingga menyisipkan kolom
baru di tengah tidak membuat data masuk ke kolom yang salah.

**Yang tidak dilakukan:** skrip ini tidak pernah menghapus atau menimpa baris
yang sudah ada. Ia hanya menambah baris baru dan menambah nilai pada kolom
ringkasan. Koreksi dan pembatalan tetap dilakukan manual di Google Sheets.

---

## Kalau bermasalah

| Gejala | Sebab yang paling sering |
|---|---|
| "Balasan endpoint bukan JSON" | Deployment tidak diatur ke **Who has access: Anyone**, atau URL-nya `/dev` bukan `/exec` |
| "Token ditolak" | `API_TOKEN` di Script Properties berbeda dengan yang diisi di Pengaturan (perhatikan spasi di ujung) |
| "Kolom … tidak ditemukan di Master Stok" | Judul kolom di sheet diganti. Jalankan `selfTest` untuk melihat mana yang hilang |
| "Endpoint tidak bisa dihubungi" | URL salah, atau deployment sudah dihapus/diganti |
| "SPREADSHEET_ID … tidak bisa dibuka" | Id-nya salah ketik, atau akun yang men-deploy tidak punya akses **edit** ke workbook itu |
| "Endpoint ini menulis ke workbook yang berbeda" | `SPREADSHEET_ID` menunjuk workbook lain daripada yang dibaca dashboard. Perbaiki property-nya, lalu **Uji koneksi** lagi |
| "Skrip ini tidak terikat ke spreadsheet mana pun" | Proyek mandiri tanpa `SPREADSHEET_ID`. Isi property-nya (langkah 2) |
| "Ada penulisan lain yang sedang berjalan" | Dua orang menyimpan bersamaan. Tunggu sebentar dan ulangi — ini justru tanda penguncian bekerja |
| Perubahan kode tidak terasa | Setiap kali `Code.gs` diubah, harus **Deploy → Manage deployments → Edit → Version: New version → Deploy**. Menyimpan saja tidak cukup |

## Mematikan mode input

Matikan sakelar **Nyalakan mode input** di halaman Pengaturan — dashboard
kembali sepenuhnya baca-saja. Untuk menutup endpoint sama sekali:
**Deploy → Manage deployments → Archive**.

---

## Rumus otomatis di Master Stok

Kalau yang dicari cuma "isi tab transaksi, Master Stok ikut sendiri", itu
**tidak butuh berkas ini sama sekali**. Lihat `RUMUS.md` dan `Formulas.gs` —
berdiri sendiri, tanpa deploy, tanpa token.

Keduanya bisa dipakai bersama: `Code.gs` mendeteksi kolom yang sudah berupa
rumus dan tidak menimpanya.
