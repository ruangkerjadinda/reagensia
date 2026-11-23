/**
 * Reagensia — Web App penulis untuk workbook MONITORING REAGENSIA.
 * Versi 1.0.0
 *
 * Dashboard membaca spreadsheet langsung lewat gviz dan tidak butuh berkas ini
 * sama sekali. Berkas ini hanya dipakai kalau mode input dinyalakan, yaitu
 * ketika baris transaksi mau ditambahkan dari dashboard.
 *
 * Tiga hal yang perlu diketahui sebelum memasang:
 *
 * 1. Kolom ringkasan di Master Stok sudah berupa rumus ke tab transaksi,
 *    dipasang sendiri oleh pemilik spreadsheet. Jadi menambah baris transaksi
 *    memang sudah cukup, dan setiap penulisan di sini MELEWATI kolom yang
 *    berisi rumus: menimpanya dengan angka statis bukan cuma menggandakan
 *    hitungan sekali — otomatisasi baris itu mati untuk seterusnya.
 *
 * 2. Sisa Stok = Stok Awal + Pembelian + Hibah + Titipan Daerah − Distribusi −
 *    Pemusnahan. Empat kolom masuk, bukan dua. Sel yang sudah berisi rumus
 *    tidak pernah ditimpa; maintenance.repairSisa hanya menyentuh baris yang
 *    nilainya diketik manual.
 *
 * 2b. Kategori di baris Penerimaan menentukan kolom masuk mana yang dipakai:
 *    Hibah, Titipan Daerah, Stok Awal, atau (bawaan) Pembelian.
 *
 * 3. Token di bawah bukan pengganti pengamanan akses. Ia terkirim dari halaman
 *    dan bisa dibaca siapa pun yang membuka devtools di komputer itu. Gunanya
 *    menahan penulisan iseng dari luar. Jangan pakai ulang kata sandi apa pun.
 *
 * Pemasangan: lihat DEPLOY.md.
 */

var VERSION = '1.2.0';

var TABS = {
  master: 'Master Stok',
  penerimaan: 'Penerimaan',
  distribusi: 'Distribusi',
  pemusnahan: 'Pemusnahan',
  log: 'Log',
};

/** Berapa lama requestId diingat untuk menolak kiriman ganda. */
var IDEMPOTENCY_TTL_SECONDS = 21600; // 6 jam

/* ------------------------------------------------------------------ masuk */

/**
 * Dibuka di peramban, inilah hal pertama yang dilihat orang yang memasang —
 * jadi ia harus bisa menjawab "sudah tersambung ke workbook yang mana?" dan
 * mengeluh dengan jelas kalau belum, bukan melempar halaman galat Google.
 */
function doGet(e) {
  try {
    var ss = book();
    return json({
      ok: true,
      version: VERSION,
      message: 'Reagensia writer aktif. Gunakan POST untuk menulis.',
      pemasangan: pemasangan_(),
      spreadsheetId: ss.getId(),
      spreadsheetName: ss.getName(),
      sheets: listSheetNames(),
    });
  } catch (err) {
    return json({
      ok: false,
      version: VERSION,
      code: (err && err.code) || 'SERVER',
      error: err && err.message ? err.message : String(err),
    });
  }
}

function doPost(e) {
  var body;
  try {
    body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return json({ ok: false, code: 'BAD_REQUEST', error: 'Isi permintaan bukan JSON yang sah.' });
  }

  try {
    if (body.action === 'ping') {
      requireToken(body.token);
      var ssPing = book();
      return json({
        ok: true,
        version: VERSION,
        pemasangan: pemasangan_(),
        spreadsheetId: ssPing.getId(),
        spreadsheetName: ssPing.getName(),
        sheets: listSheetNames(),
      });
    }

    // Membaca saja: tidak mengunci, tidak dicatat, tidak butuh requestId.
    if (body.action === 'maintenance.inspect') {
      requireToken(body.token);
      return json({ ok: true, action: body.action, result: inspect(body) });
    }

    // Membaca rumus apa adanya. gviz tidak pernah mengirim rumus, hanya hasil
    // hitungannya, jadi ini satu-satunya cara melihat rumus dari luar — dan
    // satu-satunya cara menemukan baris yang rumusnya menyimpang diam-diam.
    if (body.action === 'maintenance.rumus') {
      requireToken(body.token);
      return json({ ok: true, action: body.action, result: bacaRumus(body) });
    }

    // Menyusun surelnya tanpa mengirim, dan melihat status pemicunya. Tidak
    // ada yang keluar dari sini — notifikasi.kirim yang mengirim, dan ia
    // lewat jalur berkunci di bawah.
    if (body.action === 'notifikasi.pratinjau') {
      requireToken(body.token);
      return json({ ok: true, action: body.action, result: notifJalankan_({ kirim: false }) });
    }

    if (body.action === 'notifikasi.status') {
      requireToken(body.token);
      return json({ ok: true, action: body.action, result: notifStatusPemicu_() });
    }


    requireToken(body.token);

    if (!body.requestId) {
      return json({ ok: false, code: 'BAD_REQUEST', error: 'requestId wajib disertakan.' });
    }

    var cache = CacheService.getScriptCache();
    var seen = cache.get('req:' + body.requestId);
    if (seen) {
      // Kiriman yang sama datang dua kali — balas hasil yang dulu, jangan
      // membuat baris kedua.
      return json({ ok: true, duplicate: true, result: JSON.parse(seen) });
    }

    var lock = LockService.getScriptLock();
    if (!lock.tryLock(30000)) {
      return json({ ok: false, code: 'LOCK', error: 'Ada penulisan lain yang sedang berjalan. Coba lagi sebentar lagi.' });
    }

    try {
      var result;
      switch (body.action) {
        case 'penerimaan.create': result = createPenerimaan(body); break;
        case 'distribusi.create': result = createOutbound(body, 'distribusi'); break;
        case 'pemusnahan.create': result = createOutbound(body, 'pemusnahan'); break;
        case 'maintenance.repairSisa': result = repairSisa(body); break;
        case 'maintenance.salinRumus': result = salinRumus(body); break;
        case 'notifikasi.kirim': result = notifJalankan_({ kirim: true, paksa: body.paksa === true }); break;
        case 'notifikasi.pasangPemicu': result = notifPasangPemicu_(body); break;
        case 'notifikasi.hapusPemicu': result = notifHapusPemicu_(); break;
        case 'notifikasi.properti': result = notifAturProperti_(body); break;
        default:
          return json({ ok: false, code: 'BAD_REQUEST', error: 'Aksi tidak dikenal: ' + body.action });
      }

      cache.put('req:' + body.requestId, JSON.stringify(result), IDEMPOTENCY_TTL_SECONDS);
      writeLog(body, result, 'ok');
      return json({ ok: true, action: body.action, result: result });
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    var message = err && err.message ? err.message : String(err);
    var code = (err && err.code) || 'SERVER';
    try { writeLog(body, { error: message }, 'gagal'); } catch (ignored) { /* log tidak boleh menutupi galat asli */ }
    return json({ ok: false, code: code, error: message });
  }
}

/* ------------------------------------------------------------- pembantu */

function json(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function fail(code, message) {
  var err = new Error(message);
  err.code = code;
  return err;
}

function requireToken(token) {
  var expected = PropertiesService.getScriptProperties().getProperty('API_TOKEN');
  if (!expected) throw fail('AUTH', 'API_TOKEN belum diatur di Script Properties.');
  if (String(token || '') !== String(expected)) throw fail('AUTH', 'Token ditolak.');
}

/**
 * Workbook yang dilayani skrip ini — satu-satunya pintu ke spreadsheet.
 *
 * Ada dua cara memasang berkas ini, dan keduanya harus jalan tanpa diubah:
 *
 * - **Mandiri** (dipakai di workbook asli): proyek Apps Script yang berdiri
 *   sendiri, tidak menempel di spreadsheet mana pun, dan membuka workbook-nya
 *   lewat `SPREADSHEET_ID` di Script Properties.
 * - **Terikat**: proyek yang lahir dari Extensions → Apps Script di dalam
 *   spreadsheet itu sendiri. `SPREADSHEET_ID` boleh tidak diisi; `getActive()`
 *   sudah mengembalikan workbook-nya.
 *
 * Yang mandiri bukan selera, tapi keharusan di workbook asli: di sana sudah
 * ada skrip terikat milik orang lain ("V2.6" / LIMS Lite) yang juga
 * mendefinisikan `doGet` dan `doPost`. Apps Script menaruh semua berkas dalam
 * satu proyek ke **satu ruang nama global**, jadi menempelkan berkas ini di
 * sebelahnya membuat salah satu `doPost` menang tanpa suara dan yang lain
 * lenyap — tepat bentuk kegagalan diam-diam yang dihindari sepanjang berkas
 * ini. Proyek mandiri tidak punya ruang nama bersama dengan siapa pun.
 *
 * `SPREADSHEET_ID` menang di atas `getActive()` dengan sengaja: itulah yang
 * membuat satu berkas yang sama bisa diuji di salinan sebelum menyentuh
 * workbook asli.
 */
var _book = null;
function book() {
  if (_book) return _book;

  var id = String(PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID') || '').trim();
  if (id) {
    try {
      _book = SpreadsheetApp.openById(id);
    } catch (err) {
      throw fail('CONFIG', 'SPREADSHEET_ID di Script Properties tidak bisa dibuka: "' + id +
        '". Periksa id-nya, dan pastikan akun yang memasang skrip ini punya akses tulis ke workbook itu.');
    }
    return _book;
  }

  _book = SpreadsheetApp.getActive();
  if (!_book) {
    throw fail('CONFIG', 'Skrip ini tidak terikat ke spreadsheet mana pun dan SPREADSHEET_ID belum diatur. ' +
      'Isi SPREADSHEET_ID di Project Settings → Script Properties.');
  }
  return _book;
}

/** "mandiri" kalau workbook-nya dibuka lewat SPREADSHEET_ID, "terikat" kalau getActive(). */
function pemasangan_() {
  var id = String(PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID') || '').trim();
  return id ? 'mandiri' : 'terikat';
}

function listSheetNames() {
  return book().getSheets().map(function (s) { return s.getName(); });
}

function sheetByName(name) {
  var sheet = book().getSheetByName(name);
  if (!sheet) throw fail('NOT_FOUND', 'Tab "' + name + '" tidak ditemukan di spreadsheet ini.');
  return sheet;
}

/**
 * Cari baris judul kolom.
 *
 * Tiap tab punya jumlah baris banner yang berbeda (Master Stok: judul di baris
 * 1, header di baris 3; Distribusi: header di baris 4), jadi posisinya dicari,
 * bukan ditebak.
 */
function findHeader(sheet, anchors) {
  var probe = Math.min(sheet.getLastRow(), 12);
  if (probe === 0) throw fail('NOT_FOUND', 'Tab "' + sheet.getName() + '" kosong.');

  var values = sheet.getRange(1, 1, probe, sheet.getLastColumn()).getValues();
  for (var r = 0; r < values.length; r++) {
    var row = values[r];
    for (var c = 0; c < row.length; c++) {
      var cell = String(row[c] || '').trim().toLowerCase();
      for (var a = 0; a < anchors.length; a++) {
        if (cell === anchors[a].toLowerCase()) {
          return {
            row: r + 1,
            headers: row.map(function (h) { return String(h || '').trim(); }),
          };
        }
      }
    }
  }
  throw fail('NOT_FOUND', 'Baris judul kolom tidak ditemukan di tab "' + sheet.getName() + '".');
}

/** Nomor kolom (1-based) untuk judul pertama yang cocok; 0 kalau tidak ada. */
function colOf(headers, names) {
  for (var i = 0; i < headers.length; i++) {
    var h = headers[i].toLowerCase().replace(/\s+/g, ' ').trim();
    for (var n = 0; n < names.length; n++) {
      if (h === names[n].toLowerCase()) return i + 1;
    }
  }
  return 0;
}

function colLetter(index) {
  var s = '';
  var n = index;
  while (n > 0) {
    var rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function parseDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'object' && value.__date) return new Date(value.__date);
  var d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

function normKey(kode, lot) {
  return String(kode || '').toUpperCase().replace(/\s+/g, ' ').trim()
    + '|' + String(lot || '').toUpperCase().replace(/\s+/g, ' ').trim();
}

function num(value) {
  var n = Number(value);
  return isNaN(n) ? 0 : n;
}

function requireFields(payload, fields) {
  var missing = [];
  for (var i = 0; i < fields.length; i++) {
    var v = payload[fields[i]];
    if (v === undefined || v === null || v === '') missing.push(fields[i]);
  }
  if (missing.length) throw fail('VALIDATION', 'Kolom wajib belum diisi: ' + missing.join(', ') + '.');
}

/** Baris pertama yang benar-benar kosong setelah data terakhir. */
function nextRow(sheet, headerRow, keyCol) {
  var last = sheet.getLastRow();
  for (var r = last; r > headerRow; r--) {
    var value = sheet.getRange(r, keyCol).getValue();
    if (value !== '' && value !== null) return r + 1;
  }
  return headerRow + 1;
}

function nextNumber(sheet, headerRow, noCol, upToRow) {
  for (var r = upToRow - 1; r > headerRow; r--) {
    var v = sheet.getRange(r, noCol).getValue();
    if (typeof v === 'number' && !isNaN(v)) return v + 1;
    if (v !== '' && !isNaN(Number(v))) return Number(v) + 1;
  }
  return 1;
}

/* --------------------------------------------------------- Master Stok */

function masterContext() {
  var sheet = sheetByName(TABS.master);
  var header = findHeader(sheet, ['Instalasi']);
  var h = header.headers;

  var cols = {
    no: colOf(h, ['No']),
    instalasi: colOf(h, ['Instalasi']),
    kode: colOf(h, ['Kode']),
    nama: colOf(h, ['Nama Reagen']),
    lot: colOf(h, ['Kode/Lot']),
    expDate: colOf(h, ['Exp. Date', 'Exp Date', 'Expired Date']),
    merk: colOf(h, ['Merk']),
    supplier: colOf(h, ['Supplier']),
    stokAwal: colOf(h, ['Stok Awal']),
    pembelian: colOf(h, ['Pembelian']),
    // Dua kolom masuk tambahan. Kolom Kategori di tab Penerimaan yang
    // menentukan qty sebuah penerimaan mendarat di kolom yang mana.
    hibah: colOf(h, ['Hibah']),
    titipan: colOf(h, ['Titipan Daerah']),
    distribusi: colOf(h, ['Distribusi']),
    pemusnahan: colOf(h, ['Pemusnahan']),
    sisaStok: colOf(h, ['Sisa Stok']),
    unit: colOf(h, ['Unit']),
    stokMin: colOf(h, ['Stok Min']),
    status: colOf(h, ['Status']),
    lokasi: colOf(h, ['Lokasi']),
    pic: colOf(h, ['PIC']),
    peringatan: colOf(h, ['Peringatan']),
  };

  var required = ['kode', 'lot', 'stokAwal', 'pembelian', 'distribusi', 'pemusnahan', 'sisaStok'];
  for (var i = 0; i < required.length; i++) {
    if (!cols[required[i]]) {
      throw fail('NOT_FOUND', 'Kolom "' + required[i] + '" tidak ditemukan di Master Stok.');
    }
  }

  return { sheet: sheet, headerRow: header.row, cols: cols };
}

/**
 * Cari baris Master Stok: Kode + Kode/Lot dulu, lalu Nama Reagen + Kode/Lot.
 *
 * Kunci sejati workbook ini adalah Nama Reagen + Kode/Lot — itu yang dipakai
 * semua rumusnya, dan UNIQUE() yang menjamin pasangannya hanya muncul sekali.
 * Kode justru kolom turunan: di tab Penerimaan ia rumus yang mencari kode dari
 * nama reagen, jadi reagen yang belum terdaftar di Daftar Kode tidak punya
 * kode sama sekali. Mencari lewat kode saja membuat lot baru seperti itu
 * "tidak ditemukan" padahal barisnya sudah ada.
 *
 * Kode tetap dicoba lebih dulu karena itu yang dikirim dashboard, dan karena
 * ada 14 nomor lot yang dipakai lebih dari satu reagen — mencocokkan lot saja
 * akan memindahkan transaksi ke lot orang lain.
 */
function findMasterRow(ctx, kode, lot, nama) {
  var last = ctx.sheet.getLastRow();
  if (last <= ctx.headerRow) return 0;

  var count = last - ctx.headerRow;
  var kodes = ctx.sheet.getRange(ctx.headerRow + 1, ctx.cols.kode, count, 1).getValues();
  var lots = ctx.sheet.getRange(ctx.headerRow + 1, ctx.cols.lot, count, 1).getValues();
  var target = normKey(kode, lot);

  var i;
  if (String(kode || '') !== '') {
    for (i = 0; i < count; i++) {
      if (normKey(kodes[i][0], lots[i][0]) === target) return ctx.headerRow + 1 + i;
    }
  }

  if (String(nama || '') === '' || !ctx.cols.nama) return 0;

  var namas = ctx.sheet.getRange(ctx.headerRow + 1, ctx.cols.nama, count, 1).getValues();
  var targetNama = normKey(nama, lot);
  for (i = 0; i < count; i++) {
    if (normKey(namas[i][0], lots[i][0]) === targetNama) return ctx.headerRow + 1 + i;
  }
  return 0;
}

/**
 * Rumus Sisa Stok untuk satu baris, disusun dari posisi kolom yang
 * benar-benar ditemukan — bukan huruf kolom yang dihafal.
 *
 * Hibah dan Titipan Daerah ikut dijumlahkan kalau kolomnya ada. Melewatkan
 * keduanya membuat setiap lot hibah langsung kelihatan "tidak cocok".
 */
function sisaFormula(ctx, row) {
  var masuk = [colLetter(ctx.cols.stokAwal) + row, colLetter(ctx.cols.pembelian) + row];
  if (ctx.cols.hibah) masuk.push(colLetter(ctx.cols.hibah) + row);
  if (ctx.cols.titipan) masuk.push(colLetter(ctx.cols.titipan) + row);
  return '=' + masuk.join('+')
    + '-' + colLetter(ctx.cols.distribusi) + row
    + '-' + colLetter(ctx.cols.pemusnahan) + row;
}

/** Kolom masuk mana yang dipakai, menurut Kategori di baris penerimaannya. */
function kolomMasuk(kategori) {
  var k = String(kategori || '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (k === 'hibah') return 'hibah';
  if (k === 'titipan daerah' || k === 'titipan') return 'titipan';
  if (k === 'stok awal') return 'stokAwal';
  return 'pembelian';
}

/**
 * Terapkan perubahan ke satu baris Master Stok: tambah kolom yang bersangkutan
 * dan pastikan Sisa Stok punya rumus.
 */
function bumpMaster(ctx, row, field, delta, actor) {
  var col = ctx.cols[field];
  if (!col) throw fail('NOT_FOUND', 'Kolom "' + field + '" tidak ada di Master Stok.');

  var sel = ctx.sheet.getRange(row, col);
  var before = num(sel.getValue());
  var sisaBefore = num(ctx.sheet.getRange(row, ctx.cols.sisaStok).getValue());
  var after = before + delta;

  // Kalau kolom ini sudah berisi SUMIFS ke tab transaksi (dipasang lewat
  // Formulas.gs), baris transaksinya sudah ditulis sebelum fungsi ini dipanggil
  // dan rumusnya sudah ikut menghitung. Menimpanya dengan angka statis bukan
  // cuma menggandakan hitungan sekali — otomatisasi baris itu mati untuk
  // seterusnya, tanpa ada yang kelihatan salah.
  var pakaiRumus = String(sel.getFormula() || '') !== '';
  if (!pakaiRumus) sel.setValue(after);

  // Kalau selnya SUDAH berisi rumus, jangan disentuh. Rumus milik pemilik
  // sheet bisa berbeda bentuknya — dan lebih benar — daripada yang disusun di
  // sini; menimpanya diam-diam mengubah angka yang dipakai mengambil keputusan
  // tanpa ada satu pun tanda bahwa sesuatu berubah.
  var sisaSel = ctx.sheet.getRange(row, ctx.cols.sisaStok);
  var formula = sisaFormula(ctx, row);
  if (String(sisaSel.getFormula() || '') === '') sisaSel.setFormula(formula);

  SpreadsheetApp.flush();
  var sisaAfter = num(ctx.sheet.getRange(row, ctx.cols.sisaStok).getValue());
  if (pakaiRumus) after = num(sel.getValue());

  return {
    row: row,
    field: field,
    before: before,
    after: after,
    sisaBefore: sisaBefore,
    sisaAfter: sisaAfter,
    formulaRestored: formula,
  };
}

function readMasterRow(ctx, row) {
  var values = ctx.sheet.getRange(row, 1, 1, ctx.sheet.getLastColumn()).getValues()[0];
  var get = function (field) { return ctx.cols[field] ? values[ctx.cols[field] - 1] : ''; };
  return {
    kode: get('kode'),
    lot: get('lot'),
    nama: get('nama'),
    unit: get('unit'),
    sisaStok: num(get('sisaStok')),
    instalasi: get('instalasi'),
  };
}

/* --------------------------------------------- Master Stok yang turunan */

/**
 * Benar kalau baris Master Stok di workbook ini menghitung dirinya sendiri.
 *
 * Workbook Dinda dibangun begitu: Nama Reagen dan Kode/Lot adalah spill
 * UNIQUE(FILTER(Penerimaan!E:F)), kolom masuk/keluar SUMPRODUCT ke tab
 * transaksi, Sisa Stok penjumlahannya, Status rumus tanggal kedaluwarsa.
 * Tidak ada satu pun yang boleh ditulisi: barisnya muncul dan berubah sendiri
 * begitu baris transaksinya ada.
 *
 * Diperiksa lewat kolom Nama Reagen, bukan Pembelian — kolom masuk masih bisa
 * berupa angka ketikan di workbook yang belum dikonversi, sedangkan identitas
 * baris yang berupa rumus adalah tanda pasti bahwa barisnya turunan.
 */
function masterTurunan_(ctx) {
  var last = ctx.sheet.getLastRow();
  if (last <= ctx.headerRow || !ctx.cols.nama) return false;
  var rumus = ctx.sheet.getRange(ctx.headerRow + 1, ctx.cols.nama, last - ctx.headerRow, 1).getFormulas();
  for (var i = 0; i < rumus.length; i++) {
    if (String(rumus[i][0] || '') !== '') return true;
  }
  return false;
}

/**
 * Nama Reagen dan Kode/Lot persis seperti yang tertulis di Master Stok.
 *
 * Rumusnya mengunci baris Master Stok ke tab transaksi lewat kecocokan teks:
 * SUMPRODUCT((Penerimaan!$E$5:$E$1041=$D32)*(Penerimaan!$F$5:$F$1041=$E32);…)
 * Jadi satu spasi di ujung nama sudah cukup untuk membuat penerimaan dianggap
 * lot lain — UNIQUE() menambah pasangan baru, muncul baris Master Stok kedua
 * untuk lot yang sama, dan stoknya terbelah dua tanpa satu pun error. Nama
 * yang dikirim dashboard sudah di-trim, jadi teksnya diambil dari sheet.
 */
function identitasMaster(ctx, row) {
  return {
    nama: ctx.cols.nama ? ctx.sheet.getRange(row, ctx.cols.nama).getValue() : '',
    lot: ctx.cols.lot ? ctx.sheet.getRange(row, ctx.cols.lot).getValue() : '',
  };
}

/** Daftar nilai yang diizinkan validasi data pada satu sel, atau null. */
function nilaiValidasi_(sheet, row, col) {
  if (!col) return null;
  var rule;
  try {
    rule = sheet.getRange(row, col).getDataValidation();
  } catch (e) {
    return null;
  }
  if (!rule) return null;

  var jenis = rule.getCriteriaType();
  var isi = rule.getCriteriaValues();
  if (jenis === SpreadsheetApp.DataValidationCriteria.VALUE_IN_LIST) {
    return isi[0].map(function (v) { return String(v); });
  }
  if (jenis === SpreadsheetApp.DataValidationCriteria.VALUE_IN_RANGE) {
    return isi[0].getValues()
      .map(function (r) { return String(r[0]); })
      .filter(function (v) { return v !== ''; });
  }
  return null;
}

/**
 * Kategori dengan ejaan persis seperti daftar validasi di sheet.
 *
 * Daftarnya dibaca dari selnya, tidak dihafal di sini — tahun depan
 * "Pembelian 2026" berganti dan kodenya tidak perlu ikut diubah. Kalau tidak
 * ada yang cocok, yang dilempar adalah VALIDATION berisi daftar yang sah;
 * tanpa pemeriksaan ini yang sampai ke pengguna adalah galat panjang dari
 * Google — dan separuh barisnya sudah tertulis sebelum galatnya muncul.
 *
 * Ejaannya bukan kosmetik: kolom masuk Master Stok adalah SUMPRODUCT yang
 * membandingkan teks Kategori apa adanya, jadi "Pembelian" dan
 * "Pembelian 2026" mendarat di kolom yang berbeda.
 */
function cocokkanKategori_(nilai, izin) {
  if (!izin || !izin.length) return nilai || '';
  var k = String(nilai || '').toLowerCase().replace(/\s+/g, ' ').trim();
  for (var i = 0; i < izin.length; i++) {
    if (izin[i].toLowerCase().replace(/\s+/g, ' ').trim() === k) return izin[i];
  }
  throw fail('VALIDATION', 'Kategori "' + (nilai || '')
    + '" tidak ada di daftar yang diizinkan sheet: ' + izin.join(', ') + '.');
}

/**
 * Akibat satu baris transaksi di Master Stok.
 *
 * Kalau barisnya turunan tidak ada yang ditulis — cukup flush lalu baca ulang
 * hasil hitungannya, supaya jawaban ke dashboard memuat angka sungguhan.
 * Workbook yang kolom masuknya masih angka ketikan tetap dilayani bumpMaster
 * seperti sebelumnya.
 */
function terapkanKeMaster_(ctx, row, field, qty, before, sisaBefore) {
  if (!masterTurunan_(ctx)) return bumpMaster(ctx, row, field, qty);

  SpreadsheetApp.flush();
  var col = ctx.cols[field];
  return {
    row: row,
    field: field,
    turunan: true,
    before: before,
    after: col ? num(ctx.sheet.getRange(row, col).getValue()) : 0,
    sisaBefore: sisaBefore,
    sisaAfter: num(ctx.sheet.getRange(row, ctx.cols.sisaStok).getValue()),
  };
}

/* ------------------------------------------------------------ penerimaan */

function createPenerimaan(body) {
  var p = body.payload || {};
  // Kategori wajib: ia yang menentukan kolom masuk mana yang bertambah di
  // Master Stok. Penerimaan tanpa kategori tidak dihitung kolom mana pun —
  // barisnya tertulis, stoknya tidak pernah naik, dan tidak ada yang error.
  requireFields(p, ['instalasi', 'kode', 'nama', 'qty', 'unit', 'pic', 'tanggal', 'kategori']);

  var qty = num(p.qty);
  if (qty <= 0) throw fail('VALIDATION', 'Jumlah harus lebih besar dari nol.');

  var sheet = sheetByName(TABS.penerimaan);
  var header = findHeader(sheet, ['Instalasi']);
  var h = header.headers;

  var cols = {
    no: colOf(h, ['No']),
    instalasi: colOf(h, ['Instalasi']),
    kode: colOf(h, ['Kode']),
    tanggal: colOf(h, ['Tgl Terima', 'Tanggal Terima']),
    nama: colOf(h, ['Nama Reagen']),
    lot: colOf(h, ['Kode/Lot']),
    expDate: colOf(h, ['Exp. Date', 'Exp Date', 'Expired Date']),
    merk: colOf(h, ['Merk']),
    kategori: colOf(h, ['Kategori']),
    supplier: colOf(h, ['Supplier']),
    qty: colOf(h, ['Qty']),
    unit: colOf(h, ['Unit']),
    pic: colOf(h, ['PIC']),
    linkCoa: colOf(h, ['Link COA']),
    linkMsds: colOf(h, ['Link MSDS']),
    statusCoa: colOf(h, ['Status COA']),
    statusMsds: colOf(h, ['Status MSDS']),
    ket: colOf(h, ['Catatan', 'Ket', 'Keterangan']),
    suhuSimpan: colOf(h, ['Suhu Simpan']),
    suhuTerima: colOf(h, ['Suhu Saat Terima']),
    lokasiSimpan: colOf(h, ['Lokasi Simpan']),
    kondisiKemasan: colOf(h, ['Kondisi Kemasan']),
    statusPenerimaan: colOf(h, ['Status Penerimaan']),
    kodeBmn: colOf(h, ['KODE BMN', 'Kode BMN', 'BMN']),
  };

  // Master Stok dibaca DULU. Kalau lot ini sudah ada, nama dan nomor lotnya
  // diambil dari sana — lihat identitasMaster() untuk alasannya.
  var ctx = masterContext();
  var masterRow = findMasterRow(ctx, p.kode, p.lot, p.nama);
  var turunan = masterTurunan_(ctx);

  var fieldMasuk = kolomMasuk(p.kategori);
  if (!ctx.cols[fieldMasuk]) fieldMasuk = 'pembelian';

  var nama = p.nama;
  var lot = p.lot || '';
  var sisaBefore = 0;
  var masukBefore = 0;

  if (masterRow) {
    var id = identitasMaster(ctx, masterRow);
    if (id.nama !== '' && id.nama !== null) nama = id.nama;
    if (id.lot !== '' && id.lot !== null) lot = id.lot;
    sisaBefore = num(ctx.sheet.getRange(masterRow, ctx.cols.sisaStok).getValue());
    masukBefore = ctx.cols[fieldMasuk]
      ? num(ctx.sheet.getRange(masterRow, ctx.cols[fieldMasuk]).getValue())
      : 0;
  }

  var row = nextRow(sheet, header.row, cols.kode || cols.instalasi);

  // Kategori diperiksa sebelum satu sel pun ditulis.
  var kategori = cocokkanKategori_(
    p.kategori,
    nilaiValidasi_(sheet, row, cols.kategori) || nilaiValidasi_(sheet, header.row + 1, cols.kategori)
  );

  var values = {};
  values[cols.no] = nextNumber(sheet, header.row, cols.no, row);
  values[cols.instalasi] = p.instalasi;
  values[cols.kode] = p.kode;
  values[cols.tanggal] = parseDate(p.tanggal);
  values[cols.nama] = nama;
  values[cols.lot] = lot;
  values[cols.expDate] = parseDate(p.expDate);
  values[cols.merk] = p.merk || '';
  values[cols.kategori] = kategori;
  values[cols.supplier] = p.supplier || '';
  values[cols.qty] = qty;
  values[cols.unit] = p.unit;
  values[cols.pic] = p.pic;
  values[cols.linkCoa] = p.linkCoa || '';
  values[cols.linkMsds] = p.linkMsds || '';
  values[cols.statusCoa] = p.linkCoa ? 'AVAILABLE' : 'NOT AVAILABLE';
  values[cols.statusMsds] = p.linkMsds ? 'AVAILABLE' : 'NOT AVAILABLE';
  values[cols.ket] = p.ket || '';
  // Kolom yang tidak ada di sheet datang sebagai 0; kalau disetel lewat
  // values[0] nilainya saling menimpa dulu lalu dibuang tanpa jejak, jadi
  // semuanya lewat setIfCol.
  setIfCol(values, cols.suhuSimpan, p.suhuSimpan);
  setIfCol(values, cols.suhuTerima, p.suhuTerima);
  setIfCol(values, cols.lokasiSimpan, p.lokasiSimpan);
  setIfCol(values, cols.kondisiKemasan, p.kondisiKemasan);
  setIfCol(values, cols.statusPenerimaan, p.statusPenerimaan || 'DITERIMA');
  setIfCol(values, cols.kodeBmn, p.kodeBmn);

  var tulis = writeRow(sheet, row, values);

  var master;
  if (masterRow) {
    // Kategori penerimaannya yang menentukan kolom masuk mana yang bertambah —
    // Hibah, Titipan Daerah, Stok Awal, atau Pembelian.
    master = terapkanKeMaster_(ctx, masterRow, fieldMasuk, qty, masukBefore, sisaBefore);
  } else if (turunan) {
    // Baris Master Stok untuk lot baru TIDAK dibuat di sini: spill UNIQUE()
    // di sheet yang membuatnya, dan menulis baris sendiri di atas spill itu
    // mematikan rumusnya. Yang dikerjakan hanya memastikan barisnya muncul.
    SpreadsheetApp.flush();
    var barisBaru = findMasterRow(ctx, p.kode, lot, nama);
    var ditarik = 0;
    if (!barisBaru) {
      // Spill-nya kehabisan baris berumus. Ditarik satu baris lagi, lalu
      // dicari ulang — lihat tarikBarisMaster_.
      ditarik = tarikBarisMaster_(ctx);
      if (ditarik) barisBaru = findMasterRow(ctx, p.kode, lot, nama);
    }
    master = {
      row: barisBaru,
      field: fieldMasuk,
      turunan: true,
      created: true,
      before: 0,
      after: qty,
      sisaBefore: 0,
      sisaAfter: barisBaru ? num(ctx.sheet.getRange(barisBaru, ctx.cols.sisaStok).getValue()) : 0,
    };
    if (ditarik) master.barisDitarik = ditarik;
    if (!barisBaru) {
      master.catatan = 'Baris Master Stok belum muncul untuk lot ini, bahkan setelah'
        + ' rumusnya ditarik satu baris. Periksa rentang rumus di Master Stok.';
    }
  } else {
    master = createMasterRow(ctx, p, qty, nama, lot);
  }

  return { tab: TABS.penerimaan, row: row, master: master, dilewati: tulis.dilewati };
}

/**
 * Lot yang belum pernah tercatat mendapat baris Master Stok sendiri.
 *
 * Hanya untuk workbook yang Master Stok-nya memang diketik baris per baris;
 * kalau barisnya turunan, createPenerimaan tidak sampai ke sini.
 */
function createMasterRow(ctx, p, qty, nama, lot) {
  var row = nextRow(ctx.sheet, ctx.headerRow, ctx.cols.kode);
  var exp = parseDate(p.expDate);
  var values = {};

  values[ctx.cols.no] = nextNumber(ctx.sheet, ctx.headerRow, ctx.cols.no, row);
  values[ctx.cols.instalasi] = p.instalasi;
  values[ctx.cols.kode] = p.kode;
  values[ctx.cols.nama] = nama || p.nama;
  values[ctx.cols.lot] = lot || p.lot || '';
  values[ctx.cols.expDate] = exp;
  values[ctx.cols.merk] = p.merk || '';
  values[ctx.cols.supplier] = p.supplier || '';
  // Kalau kolom masuk Master Stok sudah memakai rumus, saldo pembuka lot baru
  // adalah 0 dan qty-nya masuk lewat rumus itu dari baris Penerimaan yang
  // barusan ditulis — menaruhnya di sini juga akan menghitungnya dua kali.
  var barisRumus = barisRumusMaster_(ctx);

  var fieldMasuk = kolomMasuk(p.kategori);
  if (!ctx.cols[fieldMasuk]) fieldMasuk = 'pembelian';

  values[ctx.cols.stokAwal] = !barisRumus && fieldMasuk === 'stokAwal' ? qty : 0;
  values[ctx.cols.pembelian] = !barisRumus && fieldMasuk === 'pembelian' ? qty : 0;
  if (ctx.cols.hibah) values[ctx.cols.hibah] = !barisRumus && fieldMasuk === 'hibah' ? qty : 0;
  if (ctx.cols.titipan) values[ctx.cols.titipan] = !barisRumus && fieldMasuk === 'titipan' ? qty : 0;
  values[ctx.cols.distribusi] = 0;
  values[ctx.cols.pemusnahan] = 0;
  values[ctx.cols.unit] = p.unit;
  values[ctx.cols.stokMin] = p.stokMin === undefined ? 1 : num(p.stokMin);
  setIfCol(values, ctx.cols.lokasi, p.lokasi);
  setIfCol(values, ctx.cols.pic, p.pic);
  // Status ikut ditulis hanya kalau kolomnya bukan rumus; writeRow menjaganya.
  values[ctx.cols.status] = exp && exp < new Date() ? 'TIDAK AKTIF' : 'AKTIF';

  writeRow(ctx.sheet, row, values);

  if (barisRumus) {
    // Disalin dari baris yang sudah benar, bukan disusun ulang di sini —
    // rujukan relatifnya ikut menyesuaikan sendiri, dan cuma ada satu tempat
    // yang menentukan bentuk rumusnya (Formulas.gs).
    salinRumusMaster_(ctx, barisRumus, row);
  } else {
    ctx.sheet.getRange(row, ctx.cols.sisaStok).setFormula(sisaFormula(ctx, row));
  }
  SpreadsheetApp.flush();

  return {
    row: row,
    created: true,
    field: fieldMasuk,
    before: 0,
    after: qty,
    sisaBefore: 0,
    sisaAfter: num(ctx.sheet.getRange(row, ctx.cols.sisaStok).getValue()),
  };
}

/**
 * Baris data Master Stok yang kolom Pembelian-nya sudah berupa rumus, atau 0
 * kalau belum ada sama sekali. Dipakai untuk mengetahui apakah workbook ini
 * sudah dikonversi lewat Formulas.gs, sekaligus sebagai contoh yang disalin
 * untuk baris baru.
 */
function barisRumusMaster_(ctx) {
  var last = ctx.sheet.getLastRow();
  if (last <= ctx.headerRow) return 0;

  var awal = ctx.headerRow + 1;
  var jumlah = last - ctx.headerRow;
  var rumus = ctx.sheet.getRange(awal, ctx.cols.pembelian, jumlah, 1).getFormulas();
  for (var i = 0; i < rumus.length; i++) {
    if (String(rumus[i][0] || '') !== '') return awal + i;
  }
  return 0;
}

/** Salin rumus kolom ringkasan dari satu baris Master Stok ke baris lain. */
function salinRumusMaster_(ctx, dariBaris, keBaris) {
  var kolom = [ctx.cols.pembelian, ctx.cols.distribusi, ctx.cols.pemusnahan, ctx.cols.sisaStok];
  for (var i = 0; i < kolom.length; i++) {
    ctx.sheet.getRange(dariBaris, kolom[i])
      .copyTo(ctx.sheet.getRange(keBaris, kolom[i]), SpreadsheetApp.CopyPasteType.PASTE_FORMULA, false);
  }
}

/**
 * Tarik rumus Master Stok satu baris ke bawah, dan kembalikan nomor barisnya.
 *
 * Baris Master Stok di workbook ini muncul sendiri dari spill UNIQUE() — tapi
 * hanya sejauh rumusnya pernah ditarik ke bawah. Lot ke-330 di workbook yang
 * rumusnya berhenti di baris 333 tidak muncul di mana pun: penerimaannya
 * tercatat, stoknya tidak pernah kelihatan, dan tidak ada yang error.
 *
 * Yang disalin hanya kolom yang di baris sumbernya memang berisi rumus, satu
 * per satu, dengan PASTE_FORMULA — jadi rujukan relatifnya menyesuaikan
 * sendiri dan bentuk rumus milik pemilik sheet tetap miliknya. Kolom yang di
 * sana berupa angka ketikan (Unit, Stok Min, Lokasi) dibiarkan kosong, bukan
 * diwarisi dari lot sebelumnya.
 */
function tarikBarisMaster_(ctx) {
  var last = ctx.sheet.getLastRow();
  if (last <= ctx.headerRow || !ctx.cols.nama) return 0;

  var awal = ctx.headerRow + 1;
  var lebar = ctx.sheet.getLastColumn();
  var identitas = ctx.sheet.getRange(awal, ctx.cols.nama, last - awal + 1, 1).getFormulas();

  var sumber = 0;
  for (var i = identitas.length - 1; i >= 0; i--) {
    if (String(identitas[i][0] || '') !== '') { sumber = awal + i; break; }
  }
  if (!sumber) return 0;

  var tujuan = sumber + 1;
  var rumus = ctx.sheet.getRange(sumber, 1, 1, lebar).getFormulas()[0];
  var disalin = 0;
  for (var c = 0; c < lebar; c++) {
    if (String(rumus[c] || '') === '') continue;
    ctx.sheet.getRange(sumber, c + 1)
      .copyTo(ctx.sheet.getRange(tujuan, c + 1), SpreadsheetApp.CopyPasteType.PASTE_FORMULA, false);
    disalin += 1;
  }
  if (!disalin) return 0;

  SpreadsheetApp.flush();
  return tujuan;
}

/* ---------------------------------------------- distribusi & pemusnahan */

function createOutbound(body, kind) {
  var p = body.payload || {};
  var isDisposal = kind === 'pemusnahan';

  // Daftar ini harus sama dengan kolom yang benar-benar ada di tab tujuannya.
  // Tab Pemusnahan tidak punya kolom Unit maupun Metode — mewajibkan field
  // yang tidak bisa disimpan hanya menolak kiriman yang sebenarnya sah.
  requireFields(p, isDisposal
    ? ['instalasi', 'kode', 'lot', 'nama', 'qty', 'tanggal', 'alasan', 'pic']
    : ['instalasi', 'kode', 'lot', 'nama', 'qty', 'unit', 'tanggal', 'picPengirim', 'picPenerima']);

  var qty = num(p.qty);
  if (qty <= 0) throw fail('VALIDATION', 'Jumlah harus lebih besar dari nol.');

  var ctx = masterContext();
  var masterRow = findMasterRow(ctx, p.kode, p.lot, p.nama);
  if (!masterRow) {
    throw fail('NOT_FOUND', 'Lot ' + p.kode + ' / ' + p.lot + ' tidak ada di Master Stok, jadi stoknya tidak bisa dikurangi.');
  }

  // Pemeriksaan ulang di server: sisa stok bisa saja sudah berubah sejak
  // halaman terakhir menyegarkan datanya.
  var current = readMasterRow(ctx, masterRow);
  if (qty > current.sisaStok) {
    throw fail('VALIDATION', 'Sisa stok lot ini tinggal ' + current.sisaStok + ', tidak cukup untuk ' + qty + '.');
  }

  // Nama dan nomor lot diambil dari Master Stok, bukan dari kiriman — rumus
  // kolom keluar mencocokkan teksnya apa adanya (lihat identitasMaster).
  var id = identitasMaster(ctx, masterRow);
  var nama = id.nama !== '' && id.nama !== null ? id.nama : p.nama;
  var lot = id.lot !== '' && id.lot !== null ? id.lot : p.lot;

  var sheet = sheetByName(isDisposal ? TABS.pemusnahan : TABS.distribusi);
  var header = findHeader(sheet, ['Instalasi']);
  var h = header.headers;

  var cols = {
    no: colOf(h, ['No']),
    instalasi: colOf(h, ['Instalasi']),
    kode: colOf(h, ['Kode']),
    tanggal: colOf(h, isDisposal ? ['Tgl Musnah', 'Tanggal Musnah'] : ['Tgl Distribusi', 'Tanggal Distribusi']),
    nama: colOf(h, ['Nama Reagen']),
    lot: colOf(h, ['Kode/Lot']),
    expDate: colOf(h, ['Expired Date', 'Exp. Date', 'Exp Date']),
    merk: colOf(h, ['Merk']),
    kategori: colOf(h, ['Kategori']),
    supplier: colOf(h, ['Supplier']),
    qty: colOf(h, isDisposal ? ['Qty'] : ['Qty Keluar', 'Qty']),
    // Tab Pemusnahan tidak punya kolom Kode maupun Unit; keduanya datang
    // sebagai 0 dan dilewati. Barisnya tetap bisa dikunci ke Master Stok lewat
    // Nama Reagen + Kode/Lot, cara yang sama yang dipakai dashboard.
    unit: colOf(h, ['Unit']),
    ket: colOf(h, ['Ket', 'Keterangan', 'Catatan']),
  };

  var row = nextRow(sheet, header.row, cols.nama || cols.instalasi);

  // Kategori di baris keluar cuma keterangan: kolom Distribusi dan Pemusnahan
  // di Master Stok menjumlahkan qty tanpa melihatnya sama sekali. Dan tiap tab
  // punya daftar validasinya sendiri — Distribusi menerima "Pembelian", bukan
  // "Pembelian 2026", dan tidak menerima "Stok Awal" yang justru kategori asal
  // banyak lot. Jadi yang tidak ada di daftar dikosongkan dan dilaporkan, bukan
  // dipakai untuk menolak pengeluaran stok yang sah.
  var kategori = p.kategori || '';
  var kategoriDitolak = '';
  if (cols.kategori && kategori !== '') {
    var izin = nilaiValidasi_(sheet, row, cols.kategori)
      || nilaiValidasi_(sheet, header.row + 1, cols.kategori);
    try {
      kategori = cocokkanKategori_(kategori, izin);
    } catch (e) {
      kategoriDitolak = kategori;
      kategori = '';
    }
  }

  var values = {};
  values[cols.no] = nextNumber(sheet, header.row, cols.no, row);
  values[cols.instalasi] = p.instalasi;
  setIfCol(values, cols.kode, p.kode);
  values[cols.tanggal] = parseDate(p.tanggal);
  values[cols.nama] = nama;
  values[cols.lot] = lot;
  values[cols.expDate] = parseDate(p.expDate);
  values[cols.merk] = p.merk || '';
  setIfCol(values, cols.kategori, kategori);
  values[cols.supplier] = p.supplier || '';
  values[cols.qty] = qty;
  setIfCol(values, cols.unit, p.unit);
  values[cols.ket] = p.ket || '';

  // Setiap kolom opsional diperiksa dulu: kalau tidak ada, indeksnya 0 dan
  // semua nilai akan saling menimpa di values[0] sebelum dibuang diam-diam.
  if (isDisposal) {
    setIfCol(values, colOf(h, ['Alasan Musnah', 'Alasan']), p.alasan);
    setIfCol(values, colOf(h, ['PIC']), p.pic);
    // Tab Pemusnahan belum punya kolom untuk keduanya; kalau nanti ditambahkan,
    // isinya langsung ikut tertulis tanpa perubahan kode.
    setIfCol(values, colOf(h, ['Metode', 'Metode Pemusnahan']), p.metode);
    setIfCol(values, colOf(h, ['Lokasi']), p.lokasi);
  } else {
    setIfCol(values, colOf(h, ['PIC Pengirim']), p.picPengirim);
    setIfCol(values, colOf(h, ['PIC Penerima']), p.picPenerima);
  }

  var keluarBefore = ctx.cols[kind] ? num(ctx.sheet.getRange(masterRow, ctx.cols[kind]).getValue()) : 0;
  var tulis = writeRow(sheet, row, values);

  var master = terapkanKeMaster_(ctx, masterRow, kind, qty, keluarBefore, current.sisaStok);

  // Status tidak disentuh kalau isinya rumus. Di workbook ini Status adalah
  // rumus tanggal kedaluwarsa — "TIDAK AKTIF" di sana berarti lewat exp date,
  // bukan stok habis — dan menimpanya dengan teks mati menghapus arti itu
  // untuk seterusnya. Lot yang habis sudah tampil sebagai "habis" di
  // dashboard, dihitung dari Sisa Stok, jadi tidak ada yang hilang.
  if (ctx.cols.status && master.sisaAfter <= 0) {
    var selStatus = ctx.sheet.getRange(masterRow, ctx.cols.status);
    if (String(selStatus.getFormula() || '') === '') {
      selStatus.setValue('TIDAK AKTIF');
      master.statusSetTo = 'TIDAK AKTIF';
    }
  }

  var hasil = { tab: sheet.getName(), row: row, master: master, dilewati: tulis.dilewati };
  if (kategoriDitolak) {
    hasil.kategoriDikosongkan = kategoriDitolak + ' (tidak ada di daftar validasi tab '
      + sheet.getName() + ')';
  }
  return hasil;
}

/** Setel nilai hanya kalau kolomnya benar-benar ada di sheet. */
function setIfCol(values, col, value) {
  if (col) values[col] = value === undefined || value === null ? '' : value;
}

/**
 * Tulis satu baris. Kolom yang tidak ada di sheet (indeks 0) dilewati, begitu
 * juga sel yang sudah berisi rumus.
 *
 * Sel berumus tidak boleh ditimpa DAN tidak boleh ikut ditulis ulang: yang
 * terbaca dari sel berumus adalah hasil hitungannya, jadi satu setValues()
 * selebar baris mengganti setiap rumus di baris itu dengan angka mati. Di
 * workbook ini hampir seluruh Master Stok berupa rumus — termasuk Nama Reagen
 * dan Kode/Lot yang menjadi kunci semua rumus lain — sehingga sekali tulis
 * selebar baris sudah cukup untuk memutus barisnya dari tab transaksi, tanpa
 * ada satu pun tanda bahwa sesuatu berubah.
 *
 * Karena itu yang ditulis adalah deret kolom berdampingan yang semuanya bukan
 * rumus; sel berumus di tengah baris memotong deretnya, bukan ikut terbawa.
 */
function writeRow(sheet, row, valuesByCol) {
  var maxCol = 0;
  for (var key in valuesByCol) {
    var c = Number(key);
    if (c > maxCol) maxCol = c;
  }
  if (!maxCol) throw fail('SERVER', 'Tidak ada kolom yang bisa ditulis.');

  var rumus = sheet.getRange(row, 1, 1, maxCol).getFormulas()[0];
  var isi = {};
  var urut = [];
  var dilewati = [];

  for (var col in valuesByCol) {
    var index = Number(col);
    if (!index) continue; // kolom tidak ditemukan di sheet ini
    if (String(rumus[index - 1] || '') !== '') {
      dilewati.push(colLetter(index) + row);
      continue;
    }
    var value = valuesByCol[col];
    isi[index] = value === null || value === undefined ? '' : value;
    urut.push(index);
  }

  urut.sort(function (a, b) { return a - b; });
  var i = 0;
  while (i < urut.length) {
    var j = i;
    while (j + 1 < urut.length && urut[j + 1] === urut[j] + 1) j++;
    var deret = [];
    for (var k = i; k <= j; k++) deret.push(isi[urut[k]]);
    sheet.getRange(row, urut[i], 1, deret.length).setValues([deret]);
    i = j + 1;
  }

  SpreadsheetApp.flush();
  return { ditulis: urut.length, dilewati: dilewati };
}

/* ------------------------------------------------------------ perbaikan */

/**
 * Kembalikan rumus Sisa Stok pada baris yang nilainya diketik manual.
 *
 * dryRun mengembalikan daftar baris yang akan tersentuh tanpa mengubah apa pun,
 * supaya bisa diperiksa dulu sebelum dijalankan sungguhan.
 */
function repairSisa(body) {
  var dryRun = !body.payload || body.payload.dryRun !== false;
  var ctx = masterContext();
  var last = ctx.sheet.getLastRow();
  if (last <= ctx.headerRow) return { rows: [], repaired: 0, dryRun: dryRun };

  var count = last - ctx.headerRow;
  var start = ctx.headerRow + 1;

  var formulas = ctx.sheet.getRange(start, ctx.cols.sisaStok, count, 1).getFormulas();
  var current = ctx.sheet.getRange(start, ctx.cols.sisaStok, count, 1).getValues();
  var kodes = ctx.sheet.getRange(start, ctx.cols.kode, count, 1).getValues();
  var awal = ctx.sheet.getRange(start, ctx.cols.stokAwal, count, 1).getValues();
  var beli = ctx.sheet.getRange(start, ctx.cols.pembelian, count, 1).getValues();
  var hibah = ctx.cols.hibah ? ctx.sheet.getRange(start, ctx.cols.hibah, count, 1).getValues() : null;
  var titipan = ctx.cols.titipan ? ctx.sheet.getRange(start, ctx.cols.titipan, count, 1).getValues() : null;
  var dist = ctx.sheet.getRange(start, ctx.cols.distribusi, count, 1).getValues();
  var musnah = ctx.sheet.getRange(start, ctx.cols.pemusnahan, count, 1).getValues();

  var rows = [];
  for (var i = 0; i < count; i++) {
    var row = start + i;
    if (formulas[i][0]) continue; // sudah rumus
    if (!kodes[i][0]) continue; // baris kosong atau baris total
    var computed = num(awal[i][0]) + num(beli[i][0])
      + (hibah ? num(hibah[i][0]) : 0)
      + (titipan ? num(titipan[i][0]) : 0)
      - num(dist[i][0]) - num(musnah[i][0]);
    rows.push({
      row: row,
      kode: String(kodes[i][0]),
      current: num(current[i][0]),
      computed: computed,
      changes: computed !== num(current[i][0]),
    });
  }

  if (dryRun) return { rows: rows, repaired: 0, dryRun: true };

  for (var j = 0; j < rows.length; j++) {
    var r = rows[j].row;
    ctx.sheet.getRange(r, ctx.cols.sisaStok).setFormula(sisaFormula(ctx, r));
  }
  SpreadsheetApp.flush();

  return { rows: rows, repaired: rows.length, dryRun: false };
}

/**
 * Apa yang sebenarnya ada di sheet, dibaca saja.
 *
 * Dipakai waktu angkanya tidak bergerak seperti yang diharapkan. gviz hanya
 * mengirim nilai, jadi rumus milik pemilik sheet tidak kelihatan dari luar —
 * dan rumus itulah yang biasanya jadi penyebabnya (rentangnya berhenti di
 * nomor baris tertentu, atau kuncinya tidak sama dengan yang ditulis).
 */
function inspect(body) {
  var p = body.payload || {};
  var ctx = masterContext();
  var out = { master: { headerRow: ctx.headerRow, cols: ctx.cols } };

  if (p.kode) {
    var row = findMasterRow(ctx, p.kode, p.lot, p.nama);
    out.master.row = row;
    if (row) {
      var sel = {};
      var fields = ['kode', 'nama', 'lot', 'stokAwal', 'pembelian', 'hibah', 'titipan', 'distribusi', 'pemusnahan', 'sisaStok', 'status'];
      for (var i = 0; i < fields.length; i++) {
        var col = ctx.cols[fields[i]];
        if (!col) continue;
        var cell = ctx.sheet.getRange(row, col);
        sel[fields[i]] = {
          a1: colLetter(col) + row,
          value: cell.getValue(),
          formula: cell.getFormula() || '',
        };
      }
      out.master.cells = sel;
    }
  }

  // Sampai baris berapa setiap tab transaksi terisi, dan rumus contoh dari
  // baris pertama berisi — rentang yang berhenti di nomor baris tertentu
  // ketahuan dari sini.
  out.tabs = {};
  var names = [TABS.penerimaan, TABS.distribusi, TABS.pemusnahan];
  for (var t = 0; t < names.length; t++) {
    var sh = book().getSheetByName(names[t]);
    if (!sh) continue;
    out.tabs[names[t]] = { lastRow: sh.getLastRow(), lastColumn: sh.getLastColumn() };
  }

  return out;
}

/* ------------------------------------------------------------------ log */

/** Catatan penulisan. Tab Log dibuat sendiri kalau belum ada. */
/**
 * Rumus satu rentang, apa adanya, plus ringkasan polanya.
 *
 * Yang penting ringkasan polanya, bukan daftar selnya: nomor baris milik
 * baris itu sendiri diganti `{b}`, sehingga seluruh kolom yang rumusnya
 * seragam runtuh jadi satu pola. Baris yang menyimpang langsung tampak
 * sebagai pola kedua dengan jumlah kecil — persis kegagalan yang tidak
 * kelihatan dari nilainya, karena rumus yang salah tetap menghasilkan angka
 * yang masuk akal (nol).
 *
 * Nomor baris di dalam acuan rentang (`$E$5:$E$1098`) sengaja TIDAK diganti:
 * rentang yang kependekan adalah salah satu cara rumus menyimpang, jadi
 * menyamakannya justru menyembunyikan temuan.
 */
function bacaRumus(body) {
  requireFields(body, ['sheet', 'a1']);
  var sheet = sheetByName(body.sheet);
  var range = sheet.getRange(String(body.a1));
  var sel = range.getNumRows() * range.getNumColumns();
  if (sel > 20000) throw fail('BAD_REQUEST', 'Rentang terlalu besar (' + sel + ' sel, maks 20000): ' + body.a1);

  var rumus = range.getFormulas();
  var tampil = range.getDisplayValues();
  var baris0 = range.getRow();
  var kolom0 = range.getColumn();

  var polaKolom = [];
  for (var c = 0; c < rumus[0].length; c++) {
    var peta = {};
    for (var r = 0; r < rumus.length; r++) {
      var pola = polakan_(rumus[r][c], baris0 + r);
      if (!peta[pola]) peta[pola] = { pola: pola, jumlah: 0, baris: [] };
      peta[pola].jumlah++;
      peta[pola].baris.push(baris0 + r);
    }
    var daftar = [];
    for (var k in peta) {
      if (!peta.hasOwnProperty(k)) continue;
      daftar.push({ pola: peta[k].pola, jumlah: peta[k].jumlah, baris: ringkasBaris_(peta[k].baris) });
    }
    daftar.sort(function (a, b) { return b.jumlah - a.jumlah; });
    polaKolom.push({ kolom: colLetter(kolom0 + c), pola: daftar });
  }

  var hasil = {
    sheet: sheet.getName(),
    a1: range.getA1Notation(),
    baris: { dari: baris0, sampai: baris0 + rumus.length - 1 },
    jumlahSel: sel,
    polaPerKolom: polaKolom,
  };

  // Daftar sel mentah hanya untuk rentang kecil — jawabannya harus tetap muat.
  if (sel <= 300) {
    hasil.sel = [];
    for (var rr = 0; rr < rumus.length; rr++) {
      for (var cc = 0; cc < rumus[rr].length; cc++) {
        hasil.sel.push({
          a1: colLetter(kolom0 + cc) + (baris0 + rr),
          rumus: rumus[rr][cc],
          tampil: tampil[rr][cc],
        });
      }
    }
  }
  return hasil;
}

/** Nomor baris milik baris itu sendiri jadi `{b}`; angka lain dibiarkan. */
function polakan_(rumus, baris) {
  if (!rumus) return '(bukan rumus)';
  // [^0-9$] bukan [^0-9]: acuan mutlak ($E$5) selalu berawalan $, acuan yang
  // barisnya relatif ($D372) tidak pernah. Tanpa itu, baris yang nomornya
  // kebetulan sama dengan ujung rentang tampil sebagai pola palsu.
  var re = new RegExp('([^0-9$]|^)' + baris + '([^0-9]|$)', 'g');
  var out = String(rumus);
  // Diulang karena dua kecocokan bersebelahan bisa berbagi satu karakter.
  for (var i = 0; i < 3; i++) out = out.replace(re, '$1{b}$2');
  return out;
}

/** [372,373,374,380] menjadi "372-374, 380". */
function ringkasBaris_(daftar) {
  var out = [];
  var mulai = daftar[0];
  var akhir = daftar[0];
  for (var i = 1; i < daftar.length; i++) {
    if (daftar[i] === akhir + 1) { akhir = daftar[i]; continue; }
    out.push(mulai === akhir ? String(mulai) : mulai + '-' + akhir);
    mulai = akhir = daftar[i];
  }
  out.push(mulai === akhir ? String(mulai) : mulai + '-' + akhir);
  return out.join(', ');
}

/**
 * Menyalin rumus satu baris ke bawah — yang biasa dilakukan dengan
 * salin-tempel, tapi bisa diperiksa dulu sebelum jadi.
 *
 * Dua pengaman yang disengaja:
 *
 * - **Kolom yang di sumbernya bukan rumus dilewati.** Menyalin nilai mati ke
 *   bawah adalah cara paling gampang mematikan kolom berumus, dan itu persis
 *   kegagalan yang sudah pernah terjadi di workbook ini (lihat `writeRow`).
 * - **Menulis hanya kalau `terapkan: true`.** Tanpa itu ia mengembalikan
 *   rencananya saja. Yang diubah adalah inventaris yang dipakai orang lain;
 *   melihat dulu baru menulis bukan kemewahan.
 */
function salinRumus(body) {
  requireFields(body, ['sheet', 'sumber', 'tujuan']);
  var sheet = sheetByName(body.sheet);
  var src = sheet.getRange(String(body.sumber));
  var dst = sheet.getRange(String(body.tujuan));

  if (src.getNumRows() !== 1) throw fail('BAD_REQUEST', 'Sumber harus satu baris: ' + body.sumber);
  if (src.getNumColumns() !== dst.getNumColumns()) {
    throw fail('BAD_REQUEST', 'Lebar sumber (' + src.getNumColumns() + ') dan tujuan (' + dst.getNumColumns() + ') harus sama.');
  }
  if (dst.getRow() <= src.getRow() && dst.getLastRow() >= src.getRow()) {
    throw fail('BAD_REQUEST', 'Tujuan mencakup baris sumbernya sendiri.');
  }

  var rumusSumber = src.getFormulas()[0];
  var kolom0 = src.getColumn();
  var rencana = [];
  for (var c = 0; c < rumusSumber.length; c++) {
    var huruf = colLetter(kolom0 + c);
    if (!rumusSumber[c]) {
      rencana.push({ kolom: huruf, lewati: true, alasan: 'sumbernya bukan rumus' });
      continue;
    }
    rencana.push({ kolom: huruf, lewati: false, rumusSumber: rumusSumber[c] });
  }

  var sebelumRumus = dst.getFormulas();
  var sebelumTampil = dst.getDisplayValues();

  if (!body.terapkan) {
    return {
      terapkan: false,
      sheet: sheet.getName(),
      sumber: src.getA1Notation(),
      tujuan: dst.getA1Notation(),
      rencana: rencana,
      sebelum: { rumus: sebelumRumus, tampil: sebelumTampil },
      catatan: 'Belum ditulis apa pun. Kirim ulang dengan terapkan: true.',
    };
  }

  var ditulis = [];
  for (var i = 0; i < rencana.length; i++) {
    if (rencana[i].lewati) continue;
    var kol = kolom0 + i;
    var dariSel = sheet.getRange(src.getRow(), kol, 1, 1);
    var keSel = sheet.getRange(dst.getRow(), kol, dst.getNumRows(), 1);
    dariSel.copyTo(keSel, SpreadsheetApp.CopyPasteType.PASTE_FORMULA, false);
    ditulis.push(rencana[i].kolom);
  }
  SpreadsheetApp.flush();

  return {
    terapkan: true,
    sheet: sheet.getName(),
    sumber: src.getA1Notation(),
    tujuan: dst.getA1Notation(),
    kolomDitulis: ditulis,
    kolomDilewati: rencana.filter(function (r) { return r.lewati; }).map(function (r) { return r.kolom; }),
    sebelum: { rumus: sebelumRumus, tampil: sebelumTampil },
    sesudah: { rumus: dst.getFormulas(), tampil: dst.getDisplayValues() },
  };
}

function writeLog(body, result, status) {
  var ss = book();
  var sheet = ss.getSheetByName(TABS.log);
  if (!sheet) {
    sheet = ss.insertSheet(TABS.log);
    sheet.appendRow(['Waktu', 'Aksi', 'Status', 'PIC', 'requestId', 'Payload', 'Hasil']);
    sheet.setFrozenRows(1);
  }
  sheet.appendRow([
    new Date(),
    (body && body.action) || '',
    status,
    (body && body.actor) || '',
    (body && body.requestId) || '',
    JSON.stringify((body && body.payload) || {}).slice(0, 4000),
    JSON.stringify(result || {}).slice(0, 4000),
  ]);
}

/* ------------------------------------------------- pemeriksaan manual */

/**
 * Jalankan dari editor Apps Script (tombol Run) untuk memastikan seluruh kolom
 * yang dibutuhkan ketemu, tanpa menulis apa pun ke spreadsheet.
 */
function selfTest() {
  var ss = book();
  var report = {
    version: VERSION,
    pemasangan: pemasangan_(),
    spreadsheetId: ss.getId(),
    spreadsheetName: ss.getName(),
    sheets: listSheetNames(),
  };

  var ctx = masterContext();
  report.master = { headerRow: ctx.headerRow, cols: ctx.cols };

  var tabs = [
    { name: TABS.penerimaan, anchor: 'Instalasi' },
    { name: TABS.distribusi, anchor: 'Instalasi' },
    { name: TABS.pemusnahan, anchor: 'Instalasi' },
  ];
  report.tabs = tabs.map(function (t) {
    var sheet = sheetByName(t.name);
    var header = findHeader(sheet, [t.anchor]);
    return { tab: t.name, headerRow: header.row, headers: header.headers.filter(String) };
  });

  report.repairPreview = repairSisa({ payload: { dryRun: true } });
  report.token = PropertiesService.getScriptProperties().getProperty('API_TOKEN') ? 'terpasang' : 'BELUM DIATUR';

  Logger.log(JSON.stringify(report, null, 2));
  return report;
}
