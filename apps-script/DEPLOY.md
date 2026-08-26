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

## 1. Tempel kodenya

1. Buka spreadsheet (salinan uji coba lebih dulu).
2. **Extensions → Apps Script**.
3. Hapus isi `Code.gs` bawaan, tempel seluruh isi berkas `Code.gs` dari folder
   ini.
4. **Simpan** (ikon disket atau Ctrl+S).

## 2. Pasang token

Token menahan penulisan iseng dari luar. Buat teks acak yang panjang — dan
**jangan pakai ulang kata sandi apa pun**, karena token ini terkirim dari
halaman dan bisa dibaca siapa saja yang membuka devtools di komputer pengguna.
Fungsinya bukan pengamanan sekuat kata sandi, melainkan penghalang sederhana.

1. Di editor Apps Script: **Project Settings** (ikon roda gigi kiri).
2. Gulir ke **Script Properties → Add script property**.
3. Property: `API_TOKEN`
4. Value: teks acak, misalnya `rgn-7Kq2xP9mLd4vWn8sTb3h`
5. **Save script properties**.

## 3. Periksa kolomnya ketemu

Sebelum di-deploy, pastikan skrip mengenali struktur sheet ini.

1. Kembali ke editor kode.
2. Pilih fungsi **`selfTest`** di kotak dropdown atas, klik **Run**.
3. Google akan meminta izin — setujui (**Review permissions → pilih akun →
   Advanced → Go to … → Allow**). Ini normal: skrip memang perlu izin menulis ke
   spreadsheet ini.
4. Buka **Execution log**. Yang harus terlihat:
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
   "Endpoint menjawab" beserta nomor versi.
6. Nyalakan sakelar **Nyalakan mode input**.

Tombol "+ Tambah …" akan muncul di halaman Transaksi.

---

## Uji terima (jalankan di salinan)

Lakukan berurutan dan periksa hasilnya langsung di spreadsheet.

| # | Langkah | Yang harus terjadi |
|---|---|---|
| 1 | Tambah **Penerimaan** untuk lot yang sudah ada | Baris baru di tab Penerimaan; kolom **Pembelian** pada baris Master Stok yang cocok bertambah; **Sisa Stok** ikut naik |
| 2 | Tambah **Penerimaan** dengan lot yang belum pernah ada | Baris baru di Penerimaan **dan** baris baru di Master Stok dengan Stok Awal = qty |
| 3 | Tambah **Distribusi** | Baris baru di tab Distribusi; kolom **Distribusi** di Master Stok bertambah; **Sisa Stok** turun |
| 4 | Tambah **Pemusnahan** | Baris baru di tab Pemusnahan; kolom **Pemusnahan** bertambah; Sisa Stok turun |
| 5 | Coba distribusi dengan qty lebih besar dari sisa stok | Ditolak dengan pesan "Sisa stok lot ini tinggal …" — tidak ada baris yang masuk |
| 6 | Klik "Simpan" dua kali cepat | Hanya satu baris yang masuk; muncul pesan "Kiriman ini sudah tercatat sebelumnya" |
| 7 | Periksa kolom **Sisa Stok** pada baris yang tersentuh | Isinya harus berupa **rumus** `=…`, bukan angka ketikan (klik selnya, lihat formula bar) |
| 8 | Buka tab **Log** | Ada satu baris per penulisan: waktu, aksi, status, PIC, requestId, payload |
| 9 | Distribusikan sampai sisa nol | Kolom Status baris itu berubah jadi `TIDAK AKTIF` |

Kalau kesembilan langkah lulus, ulangi langkah 1–4 pemasangan di spreadsheet
asli, lalu ganti URL di Pengaturan dashboard dengan URL deployment yang baru.

---

## Yang dilakukan skrip ini

**Setiap penulisan selalu sepasang.** Di workbook ini kolom Pembelian,
Distribusi, dan Pemusnahan pada Master Stok **diisi manual** — bukan rumus
`SUMIF` ke tab transaksi. Kalau skrip hanya menambah baris di tab transaksi,
angka di Master Stok akan mulai menyimpang dari catatan transaksinya. Karena itu
setiap aksi menambah baris **dan** menyesuaikan kolom ringkasannya, di dalam satu
`LockService` yang sama sehingga dua orang yang menyimpan bersamaan tidak saling
menimpa.

**Rumus Sisa Stok dipulihkan sambil jalan.** Setiap baris Master Stok yang
tersentuh transaksi dikembalikan rumusnya ke
`=Stok Awal + Pembelian − Distribusi − Pemusnahan`. Untuk memperbaiki semuanya
sekaligus, gunakan tombol di Pengaturan → Pemeliharaan (jalankan **Uji coba**
dulu untuk melihat baris mana yang akan berubah).

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
| "Ada penulisan lain yang sedang berjalan" | Dua orang menyimpan bersamaan. Tunggu sebentar dan ulangi — ini justru tanda penguncian bekerja |
| Perubahan kode tidak terasa | Setiap kali `Code.gs` diubah, harus **Deploy → Manage deployments → Edit → Version: New version → Deploy**. Menyimpan saja tidak cukup |

## Mematikan mode input

Matikan sakelar **Nyalakan mode input** di halaman Pengaturan — dashboard
kembali sepenuhnya baca-saja. Untuk menutup endpoint sama sekali:
**Deploy → Manage deployments → Archive**.
