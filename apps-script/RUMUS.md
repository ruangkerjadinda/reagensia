# Master Stok mengisi dirinya sendiri

Sekarang setiap kejadian harus diketik dua kali: sekali di tab Penerimaan /
Distribusi / Pemusnahan, sekali lagi di kolom ringkasan Master Stok. Selain
capek, begitu salah satunya terlewat angkanya melenceng dan tidak ada yang
tahu sampai ada yang mencocokkan manual.

`Formulas.gs` mengubah tiga kolom itu jadi `SUMIFS` ke tab transaksinya, dan
Sisa Stok jadi rumus turunannya. Sesudah itu **cukup isi tab transaksi saja** —
Master Stok ikut sendiri, langsung.

Berkas ini berdiri sendiri. Tidak ada hubungannya dengan mode input
(`DEPLOY.md`) dan tidak perlu memasang apa pun di dashboard.

---

## Sebelum mulai: kerjakan di salinan

Ini menulis ke inventaris yang dipakai orang lain.

1. Buka spreadsheet → **File → Buat salinan**, beri nama misalnya
   `MONITORING REAGENSIA — UJI RUMUS`.
2. Kerjakan langkah di bawah pada salinan itu.
3. Cocokkan angkanya (lihat **Memastikan tidak ada yang berubah**).
4. Baru ulangi di spreadsheet asli.

---

## Langkahnya

1. Di salinan: **Extensions → Apps Script**.
2. Tambah berkas baru, tempel seluruh isi `Formulas.gs`, simpan.
3. Pilih fungsi **`pratinjauRumus`** lalu **Run**.
   Fungsi ini **tidak menulis apa pun** — hanya melaporkan.
4. Buka **Execution log**. Isinya kira-kira begini:

   ```
   Baris data Master Stok        : 203
   Siap dikonversi jadi rumus    : 203
   Dilewati (angka belum cocok)  : 0
   Sisa Stok yang akan berubah   : 0
   ```

5. Yang penting dibaca:

   - **Dilewati** — baris yang kolom ringkasannya belum cocok dengan tab
     transaksinya. Baris ini **tidak disentuh sama sekali**, cuma dilaporkan
     lengkap dengan angkanya supaya bisa dirapikan dulu. Aman dibiarkan; jalankan
     lagi skripnya setelah dibetulkan.
   - **Sisa Stok yang akan berubah** — idealnya `0`. Kalau `0`, konversi ini
     tidak mengubah satu angka pun, cuma mengganti cara menghitungnya. Kalau
     tidak `0`, log-nya menyebut baris mana dan dari berapa ke berapa.

6. Kalau laporannya sudah sesuai, jalankan **`pasangRumus`**.

Aman dijalankan berulang kali.

---

## Yang berubah di Master Stok

| Kolom | Sesudah |
|---|---|
| Stok Awal | jadi `0`, tetap kolom ketikan |
| Pembelian | `=SUMIFS(Penerimaan!Qty; …kode; …lot)` |
| Distribusi | `=SUMIFS(Distribusi!Qty Keluar; …)` |
| Pemusnahan | `=SUMIFS(Pemusnahan!Qty; …)` |
| Sisa Stok | `=Stok Awal + Pembelian − Distribusi − Pemusnahan` |

Pencocokannya pakai **Kode + Kode/Lot**, sama persis seperti dashboard
memasangkan transaksi ke lot induknya.

### Kenapa Stok Awal dinolkan

Semua unit yang ada sekarang sudah punya barisnya di tab Penerimaan — per lot,
tanpa kecuali, `Stok Awal + Pembelian` sama dengan jumlah di tab Penerimaan.
Jadi kalau Pembelian diubah jadi SUMIFS **tanpa** menolkan Stok Awal, riwayat
yang sama terhitung dua kali dan stok tampak berlipat ganda.

Kolomnya tetap kolom ketikan, bukan rumus: kalau suatu saat ada stok lama yang
memang tidak punya baris Penerimaan, angkanya masih bisa diisi di situ dan tetap
ikut terhitung.

---

## Memastikan tidak ada yang berubah

Di salinan, sebelum dan sesudah `pasangRumus`, catat satu angka ini:

```
=SUM(N4:N)      ← kolom Sisa Stok
```

Harus **sama persis**. Kalau berbeda, jangan lanjut ke spreadsheet asli —
laporkan selisihnya.

---

## Sesudahnya

**Isi tab transaksi saja.** Jangan mengetik angka langsung di kolom Pembelian,
Distribusi, Pemusnahan, atau Sisa Stok di Master Stok — mengetik di situ
menghapus rumusnya, dan baris itu berhenti ikut terbarui diam-diam.

Kalau telanjur terhapus: jalankan lagi `pasangRumus`, rumusnya dipasang ulang.

### Menambah lot baru

Baris baru di Master Stok tidak otomatis punya rumusnya. Salin saja satu baris
yang sudah benar ke bawah (kolom Pembelian sampai Sisa Stok), atau jalankan lagi
`pasangRumus` setelah barisnya diisi.

### Kalau mode input dipakai

`Code.gs` sudah menyesuaikan diri: kalau kolomnya sudah berupa rumus, dia tidak
menimpanya dengan angka (kalau ditimpa, hitungannya dobel **dan** otomatisasi
baris itu mati). Lot baru yang dibuat dari dashboard ikut menyalin rumusnya
sendiri. Urutannya aman — baris transaksi ditulis lebih dulu, rumusnya
menghitung sesudah itu.
