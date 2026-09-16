/**
 * Pasang rumus ringkasan di Master Stok.
 *
 * Masalah yang diselesaikan: kolom Pembelian, Distribusi, dan Pemusnahan di
 * Master Stok selama ini diisi tangan, terpisah dari tab transaksinya. Jadi
 * setiap kejadian harus diketik dua kali, dan begitu salah satunya terlewat
 * angkanya melenceng tanpa ada yang tahu.
 *
 * Sesudah skrip ini dijalankan ketiganya jadi SUMIFS ke tab transaksi, dan
 * Sisa Stok jadi rumus turunannya. Artinya cukup isi tab Penerimaan /
 * Distribusi / Pemusnahan — Master Stok ikut sendiri.
 *
 * CARA PAKAI
 *   1. Salin dulu workbook-nya (File > Buat salinan). Uji di salinan.
 *   2. Extensions > Apps Script, tempel berkas ini.
 *   3. Jalankan  pratinjauRumus()   - tidak menulis apa pun, cuma melaporkan.
 *   4. Kalau laporannya sudah sesuai, jalankan  pasangRumus().
 *
 * KENAPA STOK AWAL DINOLKAN
 * Semua unit yang ada sekarang punya barisnya di tab Penerimaan — totalnya
 * cocok persis (Stok Awal + Pembelian = jumlah tab Penerimaan, per lot, tanpa
 * kecuali). Kalau Pembelian diubah jadi SUMIFS tanpa menolkan Stok Awal,
 * riwayat yang sama terhitung dua kali dan stok tampak berlipat. Menolkannya
 * membuat Sisa Stok tiap baris tetap sama persis seperti sekarang.
 *
 * Kolom Stok Awal tetap kolom ketikan, bukan rumus — kalau suatu saat ada stok
 * lama yang memang tidak punya baris Penerimaan, angkanya masih bisa diisi di
 * situ dan tetap ikut terhitung.
 *
 * AMAN DIJALANKAN ULANG. Baris yang angkanya belum cocok tidak disentuh sama
 * sekali, hanya dilaporkan, supaya tidak ada angka yang berubah diam-diam.
 */

var F_TABS = {
  master: 'Master Stok',
  penerimaan: 'Penerimaan',
  distribusi: 'Distribusi',
  pemusnahan: 'Pemusnahan',
};

/** Laporkan apa yang akan berubah, tanpa menulis apa pun. */
function pratinjauRumus() {
  return jalankanPemasangan_(true);
}

/** Pasang rumusnya. Jalankan pratinjauRumus() dulu. */
function pasangRumus() {
  return jalankanPemasangan_(false);
}

function jalankanPemasangan_(pratinjau) {
  var m = konteksMaster_();
  var sumber = {
    pembelian: petaTransaksi_(F_TABS.penerimaan, ['Qty']),
    distribusi: petaTransaksi_(F_TABS.distribusi, ['Qty Keluar', 'Qty']),
    pemusnahan: petaTransaksi_(F_TABS.pemusnahan, ['Qty']),
  };

  var awal = m.headerRow + 1;
  var jumlah = m.sheet.getLastRow() - m.headerRow;
  if (jumlah <= 0) throw new Error('Master Stok tidak punya baris data.');

  var nilai = m.sheet.getRange(awal, 1, jumlah, m.sheet.getLastColumn()).getValues();
  var kol = function (row, field) { return row[m.cols[field] - 1]; };

  var siap = [];      // baris yang aman dikonversi
  var dilewati = [];  // baris yang angkanya belum cocok — tidak disentuh
  var berubah = [];   // baris yang Sisa Stok-nya akan berbeda

  for (var i = 0; i < jumlah; i++) {
    var row = nilai[i];
    var nomorBaris = awal + i;

    // Baris total dan baris kosong tidak punya identitas — lewati.
    var punyaIdentitas = String(kol(row, 'kode') || '').trim()
      || String(kol(row, 'nama') || '').trim()
      || String(kol(row, 'instalasi') || '').trim();
    if (!punyaIdentitas) continue;

    var kunci = kunciLot_(kol(row, 'kode'), kol(row, 'lot'));
    var terima = sumber.pembelian[kunci] || 0;
    var keluar = sumber.distribusi[kunci] || 0;
    var musnah = sumber.pemusnahan[kunci] || 0;

    var stokAwal = angka_(kol(row, 'stokAwal'));
    var pembelian = angka_(kol(row, 'pembelian'));
    var distribusi = angka_(kol(row, 'distribusi'));
    var pemusnahan = angka_(kol(row, 'pemusnahan'));
    var sisaSekarang = angka_(kol(row, 'sisaStok'));

    // Syarat aman: ketiganya sudah sinkron dengan tab transaksinya.
    var cocok = (stokAwal + pembelian === terima)
      && (distribusi === keluar)
      && (pemusnahan === musnah);

    if (!cocok) {
      dilewati.push({
        baris: nomorBaris,
        kode: kol(row, 'kode'),
        lot: kol(row, 'lot'),
        masterAwalBeli: stokAwal + pembelian, tabPenerimaan: terima,
        masterDistribusi: distribusi, tabDistribusi: keluar,
        masterPemusnahan: pemusnahan, tabPemusnahan: musnah,
      });
      continue;
    }

    var sisaBaru = terima - keluar - musnah;
    if (sisaBaru !== sisaSekarang) {
      berubah.push({ baris: nomorBaris, kode: kol(row, 'kode'), sebelum: sisaSekarang, sesudah: sisaBaru });
    }
    siap.push(nomorBaris);
  }

  var ringkas = {
    barisData: jumlah,
    siapDikonversi: siap.length,
    dilewati: dilewati.length,
    berubahNilainya: berubah.length,
  };

  Logger.log('== %s ==', pratinjau ? 'PRATINJAU (tidak menulis apa pun)' : 'PEMASANGAN');
  Logger.log('Baris data Master Stok        : %s', ringkas.barisData);
  Logger.log('Siap dikonversi jadi rumus    : %s', ringkas.siapDikonversi);
  Logger.log('Dilewati (angka belum cocok)  : %s', ringkas.dilewati);
  Logger.log('Sisa Stok yang akan berubah   : %s', ringkas.berubahNilainya);
  if (dilewati.length) Logger.log('Baris yang dilewati: %s', JSON.stringify(dilewati, null, 1));
  if (berubah.length) Logger.log('Baris yang nilainya berubah: %s', JSON.stringify(berubah, null, 1));

  if (pratinjau) {
    Logger.log('Tidak ada yang ditulis. Jalankan pasangRumus() kalau laporan di atas sudah sesuai.');
    return ringkas;
  }

  /* ------------------------------------------------------------- menulis */

  var refPenerimaan = rujukan_(F_TABS.penerimaan, sumber.pembelian.__cols);
  var refDistribusi = rujukan_(F_TABS.distribusi, sumber.distribusi.__cols);
  var refPemusnahan = rujukan_(F_TABS.pemusnahan, sumber.pemusnahan.__cols);

  var kodeL = hurufKolom_(m.cols.kode);
  var lotL = hurufKolom_(m.cols.lot);
  var awalL = hurufKolom_(m.cols.stokAwal);
  var beliL = hurufKolom_(m.cols.pembelian);
  var distL = hurufKolom_(m.cols.distribusi);
  var musnL = hurufKolom_(m.cols.pemusnahan);

  for (var s = 0; s < siap.length; s++) {
    var r = siap[s];
    m.sheet.getRange(r, m.cols.stokAwal).setValue(0);
    m.sheet.getRange(r, m.cols.pembelian).setFormula(sumifs_(refPenerimaan, kodeL, lotL, r));
    m.sheet.getRange(r, m.cols.distribusi).setFormula(sumifs_(refDistribusi, kodeL, lotL, r));
    m.sheet.getRange(r, m.cols.pemusnahan).setFormula(sumifs_(refPemusnahan, kodeL, lotL, r));
    m.sheet.getRange(r, m.cols.sisaStok).setFormula(
      '=' + awalL + r + '+' + beliL + r + '-' + distL + r + '-' + musnL + r);
  }

  SpreadsheetApp.flush();
  Logger.log('Selesai. %s baris sekarang memakai rumus.', siap.length);
  return ringkas;
}

/**
 * =SUMIFS(qty, kode, $C4, lot, $E4)
 *
 * Apps Script selalu menulis rumus dengan koma; Sheets yang menyesuaikan ke
 * titik koma kalau locale-nya Indonesia. Jangan diganti jadi titik koma di
 * sini — setFormula akan menolaknya.
 */
function sumifs_(ref, kodeL, lotL, baris) {
  return '=SUMIFS(' + ref.qty + ', ' + ref.kode + ', $' + kodeL + baris + ', ' + ref.lot + ', $' + lotL + baris + ')';
}

function rujukan_(namaTab, cols) {
  var kutip = "'" + namaTab.replace(/'/g, "''") + "'";
  var kolom = function (i) { return kutip + '!$' + hurufKolom_(i) + ':$' + hurufKolom_(i); };
  return { qty: kolom(cols.qty), kode: kolom(cols.kode), lot: kolom(cols.lot) };
}

function konteksMaster_() {
  var sheet = bukaTab_(F_TABS.master);
  var header = cariHeader_(sheet, ['Instalasi']);
  var h = header.headers;
  var cols = {
    instalasi: kolomKe_(h, ['Instalasi']),
    kode: kolomKe_(h, ['Kode']),
    nama: kolomKe_(h, ['Nama Reagen']),
    lot: kolomKe_(h, ['Kode/Lot']),
    stokAwal: kolomKe_(h, ['Stok Awal']),
    pembelian: kolomKe_(h, ['Pembelian']),
    distribusi: kolomKe_(h, ['Distribusi']),
    pemusnahan: kolomKe_(h, ['Pemusnahan']),
    sisaStok: kolomKe_(h, ['Sisa Stok']),
  };
  var wajib = ['kode', 'lot', 'stokAwal', 'pembelian', 'distribusi', 'pemusnahan', 'sisaStok'];
  for (var i = 0; i < wajib.length; i++) {
    if (!cols[wajib[i]]) throw new Error('Kolom "' + wajib[i] + '" tidak ketemu di Master Stok.');
  }
  return { sheet: sheet, headerRow: header.row, cols: cols };
}

/** Jumlah qty per kode|lot dari satu tab transaksi. */
function petaTransaksi_(namaTab, namaQty) {
  var sheet = bukaTab_(namaTab);
  var header = cariHeader_(sheet, ['Instalasi']);
  var cols = {
    kode: kolomKe_(header.headers, ['Kode']),
    lot: kolomKe_(header.headers, ['Kode/Lot']),
    qty: kolomKe_(header.headers, namaQty),
  };
  if (!cols.kode || !cols.lot || !cols.qty) {
    throw new Error('Kolom Kode / Kode/Lot / Qty tidak lengkap di tab "' + namaTab + '".');
  }

  var peta = {};
  var jumlah = sheet.getLastRow() - header.row;
  if (jumlah > 0) {
    var nilai = sheet.getRange(header.row + 1, 1, jumlah, sheet.getLastColumn()).getValues();
    for (var i = 0; i < nilai.length; i++) {
      var k = kunciLot_(nilai[i][cols.kode - 1], nilai[i][cols.lot - 1]);
      if (k === '|') continue;
      peta[k] = (peta[k] || 0) + angka_(nilai[i][cols.qty - 1]);
    }
  }
  peta.__cols = cols;
  return peta;
}

function bukaTab_(nama) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(nama);
  if (!sheet) throw new Error('Tab "' + nama + '" tidak ada di spreadsheet ini.');
  return sheet;
}

/** Baris judul beda-beda tiap tab, jadi dicari, bukan ditebak. */
function cariHeader_(sheet, jangkar) {
  var probe = Math.min(sheet.getLastRow(), 12);
  if (probe === 0) throw new Error('Tab "' + sheet.getName() + '" kosong.');
  var nilai = sheet.getRange(1, 1, probe, sheet.getLastColumn()).getValues();
  for (var r = 0; r < nilai.length; r++) {
    for (var c = 0; c < nilai[r].length; c++) {
      var sel = String(nilai[r][c] || '').trim().toLowerCase();
      for (var a = 0; a < jangkar.length; a++) {
        if (sel === jangkar[a].toLowerCase()) {
          return { row: r + 1, headers: nilai[r].map(function (x) { return String(x || '').trim(); }) };
        }
      }
    }
  }
  throw new Error('Baris judul tidak ketemu di tab "' + sheet.getName() + '".');
}

function kolomKe_(headers, nama) {
  for (var i = 0; i < headers.length; i++) {
    var h = headers[i].toLowerCase().replace(/\s+/g, ' ').trim();
    for (var n = 0; n < nama.length; n++) {
      if (h === nama[n].toLowerCase()) return i + 1;
    }
  }
  return 0;
}

function hurufKolom_(index) {
  var s = '';
  var n = index;
  while (n > 0) {
    var sisa = (n - 1) % 26;
    s = String.fromCharCode(65 + sisa) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function kunciLot_(kode, lot) {
  return String(kode || '').toUpperCase().replace(/\s+/g, ' ').trim()
    + '|' + String(lot || '').toUpperCase().replace(/\s+/g, ' ').trim();
}

function angka_(v) {
  var n = Number(v);
  return isNaN(n) ? 0 : n;
}
