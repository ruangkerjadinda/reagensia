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
 * 1. Menambah baris di tab transaksi saja TIDAK CUKUP. Di workbook ini kolom
 *    Pembelian, Distribusi, dan Pemusnahan pada Master Stok diisi manual —
 *    bukan rumus SUMIF ke tab transaksi. Karena itu setiap penulisan di sini
 *    selalu sepasang: baris transaksi ditambahkan, lalu kolom ringkasan di
 *    Master Stok ikut disesuaikan dalam satu kunci yang sama.
 *
 * 2. Sisa Stok seharusnya rumus =Stok Awal + Pembelian − Distribusi −
 *    Pemusnahan. Di sebagian baris rumus itu tergantikan angka ketikan. Setiap
 *    baris yang tersentuh transaksi akan dikembalikan rumusnya, dan
 *    maintenance.repairSisa memperbaiki semuanya sekaligus bila diminta.
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
    kategori: colOf(h, ['Kategori']),
    supplier: colOf(h, ['Supplier']),
    stokAwal: colOf(h, ['Stok Awal']),
    pembelian: colOf(h, ['Pembelian']),
    distribusi: colOf(h, ['Distribusi']),
    pemusnahan: colOf(h, ['Pemusnahan']),
    sisaStok: colOf(h, ['Sisa Stok']),
    unit: colOf(h, ['Unit']),
    stokMin: colOf(h, ['Stok Min']),
    status: colOf(h, ['Status']),
    lokasi: colOf(h, ['Lokasi']),
    lastUpdate: colOf(h, ['Last Update']),
    pic: colOf(h, ['PIC']),
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
 * Terapkan perubahan ke satu baris Master Stok: tambah kolom yang bersangkutan,
 * pulihkan rumus Sisa Stok, dan cap tanggal pembaruan.
 */
function bumpMaster(ctx, row, field, delta, actor) {
  var col = ctx.cols[field];
  if (!col) throw fail('NOT_FOUND', 'Kolom "' + field + '" tidak ada di Master Stok.');

  var before = num(ctx.sheet.getRange(row, col).getValue());
  var sisaBefore = num(ctx.sheet.getRange(row, ctx.cols.sisaStok).getValue());
  var after = before + delta;

  ctx.sheet.getRange(row, col).setValue(after);

  // Rumus dibangun dari posisi kolom yang benar-benar ditemukan, bukan huruf
  // yang dihafal — supaya tetap benar kalau ada kolom disisipkan.
  var formula = '='
    + colLetter(ctx.cols.stokAwal) + row + '+'
    + colLetter(ctx.cols.pembelian) + row + '-'
    + colLetter(ctx.cols.distribusi) + row + '-'
    + colLetter(ctx.cols.pemusnahan) + row;
  ctx.sheet.getRange(row, ctx.cols.sisaStok).setFormula(formula);

  if (ctx.cols.lastUpdate) ctx.sheet.getRange(row, ctx.cols.lastUpdate).setValue(new Date());

  SpreadsheetApp.flush();
  var sisaAfter = num(ctx.sheet.getRange(row, ctx.cols.sisaStok).getValue());

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
    ket: colOf(h, ['Ket', 'Keterangan']),
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

  writeRow(sheet, row, values);

  var ctx = masterContext();
  var masterRow = findMasterRow(ctx, p.kode, p.lot);
  var master;

  if (masterRow) {
    // Lot sudah ada: penambahan masuk ke kolom Pembelian, bukan Stok Awal —
    // Stok Awal adalah saldo pembuka dan tidak boleh berubah lagi.
    master = bumpMaster(ctx, masterRow, 'pembelian', qty, body.actor);
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
  values[ctx.cols.kategori] = p.kategori || '';
  values[ctx.cols.supplier] = p.supplier || '';
  values[ctx.cols.stokAwal] = qty;
  values[ctx.cols.pembelian] = 0;
  values[ctx.cols.distribusi] = 0;
  values[ctx.cols.pemusnahan] = 0;
  values[ctx.cols.unit] = p.unit;
  values[ctx.cols.stokMin] = p.stokMin === undefined ? 1 : num(p.stokMin);
  values[ctx.cols.status] = exp && exp < new Date() ? 'TIDAK AKTIF' : 'AKTIF';
  values[ctx.cols.lokasi] = p.lokasi || '';
  values[ctx.cols.lastUpdate] = new Date();
  values[ctx.cols.pic] = p.pic || '';

  writeRow(ctx.sheet, row, values);

  var formula = '='
    + colLetter(ctx.cols.stokAwal) + row + '+'
    + colLetter(ctx.cols.pembelian) + row + '-'
    + colLetter(ctx.cols.distribusi) + row + '-'
    + colLetter(ctx.cols.pemusnahan) + row;
  ctx.sheet.getRange(row, ctx.cols.sisaStok).setFormula(formula);
  SpreadsheetApp.flush();

  return {
    row: row,
    created: true,
    field: 'stokAwal',
    before: 0,
    after: qty,
    sisaBefore: 0,
    sisaAfter: num(ctx.sheet.getRange(row, ctx.cols.sisaStok).getValue()),
  };
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
    unit: colOf(h, ['Unit']),
    ket: colOf(h, ['Ket', 'Keterangan']),
  };

  var row = nextRow(sheet, header.row, cols.kode || cols.instalasi);
  var values = {};
  values[cols.no] = nextNumber(sheet, header.row, cols.no, row);
  values[cols.instalasi] = p.instalasi;
  values[cols.kode] = p.kode;
  values[cols.tanggal] = parseDate(p.tanggal);
  values[cols.nama] = p.nama;
  values[cols.lot] = p.lot;
  values[cols.expDate] = parseDate(p.expDate);
  values[cols.merk] = p.merk || '';
  values[cols.kategori] = p.kategori || '';
  values[cols.supplier] = p.supplier || '';
  values[cols.qty] = qty;
  values[cols.unit] = p.unit;
  values[cols.ket] = p.ket || '';

  if (isDisposal) {
    values[colOf(h, ['Alasan Musnah'])] = p.alasan;
    values[colOf(h, ['Metode Pemusnahan'])] = p.metode;
    values[colOf(h, ['PIC'])] = p.pic;
    values[colOf(h, ['Lokasi'])] = p.lokasi || '';
  } else {
    values[colOf(h, ['Periode Pakai'])] = p.periodePakai || '';
    values[colOf(h, ['PIC Pengirim'])] = p.picPengirim;
    values[colOf(h, ['PIC Penerima'])] = p.picPenerima;
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
  var dist = ctx.sheet.getRange(start, ctx.cols.distribusi, count, 1).getValues();
  var musnah = ctx.sheet.getRange(start, ctx.cols.pemusnahan, count, 1).getValues();

  var rows = [];
  for (var i = 0; i < count; i++) {
    var row = start + i;
    if (formulas[i][0]) continue; // sudah rumus
    if (!kodes[i][0]) continue; // baris kosong atau baris total
    var computed = num(awal[i][0]) + num(beli[i][0]) - num(dist[i][0]) - num(musnah[i][0]);
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
    ctx.sheet.getRange(r, ctx.cols.sisaStok).setFormula('='
      + colLetter(ctx.cols.stokAwal) + r + '+'
      + colLetter(ctx.cols.pembelian) + r + '-'
      + colLetter(ctx.cols.distribusi) + r + '-'
      + colLetter(ctx.cols.pemusnahan) + r);
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
