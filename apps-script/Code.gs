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

var VERSION = '1.0.0';

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

function doGet(e) {
  return json({
    ok: true,
    version: VERSION,
    message: 'Reagensia writer aktif. Gunakan POST untuk menulis.',
    sheets: listSheetNames(),
  });
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
      return json({ ok: true, version: VERSION, sheets: listSheetNames() });
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

function listSheetNames() {
  return SpreadsheetApp.getActiveSpreadsheet().getSheets().map(function (s) { return s.getName(); });
}

function sheetByName(name) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
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

/** Cari baris Master Stok menurut Kode + Kode/Lot. */
function findMasterRow(ctx, kode, lot) {
  var last = ctx.sheet.getLastRow();
  if (last <= ctx.headerRow) return 0;

  var count = last - ctx.headerRow;
  var kodes = ctx.sheet.getRange(ctx.headerRow + 1, ctx.cols.kode, count, 1).getValues();
  var lots = ctx.sheet.getRange(ctx.headerRow + 1, ctx.cols.lot, count, 1).getValues();
  var target = normKey(kode, lot);

  for (var i = 0; i < count; i++) {
    if (normKey(kodes[i][0], lots[i][0]) === target) return ctx.headerRow + 1 + i;
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

/* ------------------------------------------------------------ penerimaan */

function createPenerimaan(body) {
  var p = body.payload || {};
  requireFields(p, ['instalasi', 'kode', 'nama', 'qty', 'unit', 'pic', 'tanggal']);

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
    lokasiSimpan: colOf(h, ['Lokasi Simpan']),
    kondisiKemasan: colOf(h, ['Kondisi Kemasan']),
    statusPenerimaan: colOf(h, ['Status Penerimaan']),
    kodeBmn: colOf(h, ['KODE BMN', 'Kode BMN', 'BMN']),
  };

  var row = nextRow(sheet, header.row, cols.kode || cols.instalasi);
  var values = {};
  values[cols.no] = nextNumber(sheet, header.row, cols.no, row);
  values[cols.instalasi] = p.instalasi;
  values[cols.kode] = p.kode;
  values[cols.tanggal] = parseDate(p.tanggal);
  values[cols.nama] = p.nama;
  values[cols.lot] = p.lot || '';
  values[cols.expDate] = parseDate(p.expDate);
  values[cols.merk] = p.merk || '';
  values[cols.kategori] = p.kategori || '';
  values[cols.supplier] = p.supplier || '';
  values[cols.qty] = qty;
  values[cols.unit] = p.unit;
  values[cols.pic] = p.pic;
  values[cols.linkCoa] = p.linkCoa || '';
  values[cols.linkMsds] = p.linkMsds || '';
  values[cols.statusCoa] = p.linkCoa ? 'AVAILABLE' : 'NOT AVAILABLE';
  values[cols.statusMsds] = p.linkMsds ? 'AVAILABLE' : 'NOT AVAILABLE';
  values[cols.ket] = p.ket || '';
  // Kolom yang tidak ada di sheet datang sebagai 0 dan dilewati writeRow, tapi
  // menulis semuanya ke values[0] membuat nilainya saling menimpa tanpa jejak —
  // jadi yang kosong tidak usah disetel sama sekali.
  if (cols.suhuSimpan) values[cols.suhuSimpan] = p.suhuSimpan || '';
  if (cols.lokasiSimpan) values[cols.lokasiSimpan] = p.lokasiSimpan || '';
  if (cols.kondisiKemasan) values[cols.kondisiKemasan] = p.kondisiKemasan || '';
  if (cols.statusPenerimaan) values[cols.statusPenerimaan] = p.statusPenerimaan || 'DITERIMA';
  if (cols.kodeBmn) values[cols.kodeBmn] = p.kodeBmn || '';

  writeRow(sheet, row, values);

  var ctx = masterContext();
  var masterRow = findMasterRow(ctx, p.kode, p.lot);
  var master;

  if (masterRow) {
    // Kategori penerimaannya yang menentukan kolom masuk mana yang bertambah —
    // Hibah, Titipan Daerah, Stok Awal, atau Pembelian. Kalau kolom itu sudah
    // berisi SUMIFS, bumpMaster membiarkannya dan rumusnya yang menghitung.
    var fieldMasuk = kolomMasuk(p.kategori);
    if (!ctx.cols[fieldMasuk]) fieldMasuk = 'pembelian';
    master = bumpMaster(ctx, masterRow, fieldMasuk, qty, body.actor);
  } else {
    master = createMasterRow(ctx, p, qty);
  }

  return { tab: TABS.penerimaan, row: row, master: master };
}

/** Lot yang belum pernah tercatat mendapat baris Master Stok sendiri. */
function createMasterRow(ctx, p, qty) {
  var row = nextRow(ctx.sheet, ctx.headerRow, ctx.cols.kode);
  var exp = parseDate(p.expDate);
  var values = {};

  values[ctx.cols.no] = nextNumber(ctx.sheet, ctx.headerRow, ctx.cols.no, row);
  values[ctx.cols.instalasi] = p.instalasi;
  values[ctx.cols.kode] = p.kode;
  values[ctx.cols.nama] = p.nama;
  values[ctx.cols.lot] = p.lot || '';
  values[ctx.cols.expDate] = exp;
  values[ctx.cols.merk] = p.merk || '';
  values[ctx.cols.supplier] = p.supplier || '';
  // Kalau Master Stok sudah memakai rumus, saldo pembuka lot baru adalah 0 dan
  // qty-nya masuk lewat SUMIFS ke baris Penerimaan yang barusan ditulis —
  // menaruhnya di Stok Awal juga akan menghitungnya dua kali.
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
  values[ctx.cols.status] = exp && exp < new Date() ? 'TIDAK AKTIF' : 'AKTIF';
  values[ctx.cols.lokasi] = p.lokasi || '';
  values[ctx.cols.pic] = p.pic || '';

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

/* ---------------------------------------------- distribusi & pemusnahan */

function createOutbound(body, kind) {
  var p = body.payload || {};
  var isDisposal = kind === 'pemusnahan';

  requireFields(p, isDisposal
    ? ['instalasi', 'kode', 'lot', 'nama', 'qty', 'unit', 'tanggal', 'alasan', 'metode', 'pic']
    : ['instalasi', 'kode', 'lot', 'nama', 'qty', 'unit', 'tanggal', 'picPengirim', 'picPenerima']);

  var qty = num(p.qty);
  if (qty <= 0) throw fail('VALIDATION', 'Jumlah harus lebih besar dari nol.');

  var ctx = masterContext();
  var masterRow = findMasterRow(ctx, p.kode, p.lot);
  if (!masterRow) {
    throw fail('NOT_FOUND', 'Lot ' + p.kode + ' / ' + p.lot + ' tidak ada di Master Stok, jadi stoknya tidak bisa dikurangi.');
  }

  // Pemeriksaan ulang di server: sisa stok bisa saja sudah berubah sejak
  // halaman terakhir menyegarkan datanya.
  var current = readMasterRow(ctx, masterRow);
  if (qty > current.sisaStok) {
    throw fail('VALIDATION', 'Sisa stok lot ini tinggal ' + current.sisaStok + ', tidak cukup untuk ' + qty + '.');
  }

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

  var row = nextRow(sheet, header.row, cols.kode || cols.instalasi);
  var values = {};
  values[cols.no] = nextNumber(sheet, header.row, cols.no, row);
  values[cols.instalasi] = p.instalasi;
  if (cols.kode) values[cols.kode] = p.kode;
  values[cols.tanggal] = parseDate(p.tanggal);
  values[cols.nama] = p.nama;
  values[cols.lot] = p.lot;
  values[cols.expDate] = parseDate(p.expDate);
  values[cols.merk] = p.merk || '';
  if (cols.kategori) values[cols.kategori] = p.kategori || '';
  values[cols.supplier] = p.supplier || '';
  values[cols.qty] = qty;
  if (cols.unit) values[cols.unit] = p.unit;
  values[cols.ket] = p.ket || '';

  // Setiap kolom opsional diperiksa dulu: kalau tidak ada, indeksnya 0 dan
  // semua nilai akan saling menimpa di values[0] sebelum dibuang diam-diam.
  if (isDisposal) {
    setIfCol(values, colOf(h, ['Alasan Musnah']), p.alasan);
    setIfCol(values, colOf(h, ['PIC']), p.pic);
  } else {
    setIfCol(values, colOf(h, ['PIC Pengirim']), p.picPengirim);
    setIfCol(values, colOf(h, ['PIC Penerima']), p.picPenerima);
  }

  writeRow(sheet, row, values);

  var master = bumpMaster(ctx, masterRow, kind, qty, body.actor);

  // Lot yang habis atau sudah lewat tanggal tidak boleh tetap tertulis AKTIF.
  if (ctx.cols.status && master.sisaAfter <= 0) {
    ctx.sheet.getRange(masterRow, ctx.cols.status).setValue('TIDAK AKTIF');
    master.statusSetTo = 'TIDAK AKTIF';
  }

  return { tab: sheet.getName(), row: row, master: master };
}

/** Setel nilai hanya kalau kolomnya benar-benar ada di sheet. */
function setIfCol(values, col, value) {
  if (col) values[col] = value === undefined || value === null ? '' : value;
}

/** Tulis sekali jalan; kolom yang tidak ada di sheet (index 0) dilewati. */
function writeRow(sheet, row, valuesByCol) {
  var maxCol = 0;
  for (var key in valuesByCol) {
    var c = Number(key);
    if (c > maxCol) maxCol = c;
  }
  if (!maxCol) throw fail('SERVER', 'Tidak ada kolom yang bisa ditulis.');

  var existing = sheet.getRange(row, 1, 1, maxCol).getValues()[0];
  for (var col in valuesByCol) {
    var index = Number(col);
    if (!index) continue; // kolom tidak ditemukan di sheet ini
    var value = valuesByCol[col];
    existing[index - 1] = value === null || value === undefined ? '' : value;
  }
  sheet.getRange(row, 1, 1, maxCol).setValues([existing]);
  SpreadsheetApp.flush();
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

/* ------------------------------------------------------------------ log */

/** Catatan penulisan. Tab Log dibuat sendiri kalau belum ada. */
function writeLog(body, result, status) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
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
  var report = { version: VERSION, sheets: listSheetNames() };

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
