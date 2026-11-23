/**
 * Notifikasi reagen kedaluwarsa lewat surel.
 *
 * Ini bagian "notifikasi" yang sebenarnya: ia sampai ke orangnya **tanpa ada
 * yang membuka dashboard**. Halaman Kedaluwarsa dan Alert sudah menampilkan
 * angka yang sama, tapi keduanya hanya bekerja kalau seseorang ingat untuk
 * melihat — dan reagen yang lewat tanggal justru masalah yang tidak ada yang
 * mengingatkan.
 *
 * **Mingguan, bukan harian.** Hari ini ada 98 lot yang sudah kedaluwarsa.
 * Surel harian berisi 98 baris yang sama persis akan dibaca dua kali lalu
 * difilter ke folder lain selamanya, dan notifikasi yang diabaikan lebih buruk
 * daripada tidak ada notifikasi — ia memberi rasa aman tanpa memberi kabar.
 * Jadi: sekali seminggu, dan yang **baru** sejak surel terakhir ditandai di
 * paling atas, supaya ada sesuatu yang berubah untuk dibaca tiap kali.
 *
 * Penerimanya pemilik skrip sendiri (Dinda) kalau `EMAIL_NOTIFIKASI` di Script
 * Properties kosong. Jadi tidak ada alamat surel yang perlu ditulis di mana
 * pun — repositori ini publik.
 */

/** Ambang baku, disamakan dengan CONFIG.thresholds di dashboard. */
var NOTIF_AMBANG = { kritis: 30, peringatan: 90 };

/** Kunci Script Properties yang boleh disetel dari luar lewat endpoint. */
var NOTIF_PROPERTI = ['EMAIL_NOTIFIKASI', 'NOTIF_HARI_KRITIS', 'NOTIF_HARI_PERINGATAN', 'NOTIF_URL_DASHBOARD'];

var NOTIF_PEMICU = 'kirimNotifikasiKedaluwarsa';

function notifProps_() {
  return PropertiesService.getScriptProperties();
}

function notifAmbang_() {
  var p = notifProps_();
  var kritis = Number(p.getProperty('NOTIF_HARI_KRITIS'));
  var peringatan = Number(p.getProperty('NOTIF_HARI_PERINGATAN'));
  return {
    kritis: kritis > 0 ? kritis : NOTIF_AMBANG.kritis,
    peringatan: peringatan > 0 ? peringatan : NOTIF_AMBANG.peringatan,
  };
}

/**
 * Penerima surel. Kalau `EMAIL_NOTIFIKASI` kosong, dikirim ke pemilik skrip —
 * yaitu akun yang memasang web app ini, yang memang orang yang mengurus
 * reagennya.
 */
function notifPenerima_() {
  var raw = String(notifProps_().getProperty('EMAIL_NOTIFIKASI') || '').trim();
  if (raw) {
    return raw.split(/[;,]/).map(function (s) { return s.trim(); }).filter(Boolean);
  }
  var sendiri = '';
  try { sendiri = Session.getEffectiveUser().getEmail(); } catch (err) { sendiri = ''; }
  return sendiri ? [sendiri] : [];
}

function notifUrl_() {
  return String(notifProps_().getProperty('NOTIF_URL_DASHBOARD') || 'https://ruangkerjadinda.space').trim();
}

/**
 * Jalankan sekali dari editor Apps Script untuk memberi izin yang baru.
 *
 * Menambah scope di manifes membuat otorisasi penerapan yang lama tidak lagi
 * cukup, dan Google hanya menampilkan layar persetujuannya kalau ada orang
 * yang menjalankan fungsi dari editor — tidak bisa lewat web app, tidak bisa
 * lewat clasp.
 *
 * Fungsi ini sengaja **tidak mengirim apa pun**: ia hanya menyentuh ketiga
 * izin itu dengan panggilan yang tidak berakibat. getRemainingDailyQuota()
 * butuh izin kirim surel tapi tidak mengirim satu pun. Yang memberi izin
 * tidak perlu mempertaruhkan satu surel pun untuk melakukannya.
 */
function otorisasi() {
  var hasil = { spreadsheet: null, pemicu: null, surel: null, kuotaSurel: null };
  hasil.spreadsheet = book().getName();
  hasil.pemicu = ScriptApp.getProjectTriggers().length + " pemicu terpasang";
  hasil.surel = Session.getEffectiveUser().getEmail();
  hasil.kuotaSurel = MailApp.getRemainingDailyQuota();
  hasil.pesan = "Izin lengkap. Tidak ada surel yang dikirim.";
  console.log(JSON.stringify(hasil, null, 2));
  return hasil;
}

/* ------------------------------------------------------------- ringkasan */

function notifHariBeda_(dari, ke) {
  var a = new Date(dari.getFullYear(), dari.getMonth(), dari.getDate());
  var b = new Date(ke.getFullYear(), ke.getMonth(), ke.getDate());
  return Math.round((b - a) / 86400000);
}

/**
 * Sidik pendek sebuah lot, untuk membandingkan dengan surel sebelumnya.
 *
 * Yang disimpan sidiknya, bukan kuncinya: 150 pasang "Nama|Lot" bisa menembus
 * batas 9 KB per properti, sementara 8 huruf heksa per lot muat jauh di
 * bawahnya. Tabrakan sidik hanya membuat satu lot tidak ditandai "baru" —
 * tidak ada angka yang salah karenanya.
 */
function notifSidik_(kunci) {
  var b = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, kunci, Utilities.Charset.UTF_8);
  var out = '';
  for (var i = 0; i < 4; i++) {
    var v = (b[i] + 256) % 256;
    out += (v < 16 ? '0' : '') + v.toString(16);
  }
  return out;
}

/** Semua baris Master Stok sebagai objek, dibaca sekali jalan. */
function notifBarisMaster_() {
  var ctx = masterContext();
  var last = ctx.sheet.getLastRow();
  if (last <= ctx.headerRow) return [];

  var n = last - ctx.headerRow;
  var nilai = ctx.sheet.getRange(ctx.headerRow + 1, 1, n, ctx.sheet.getLastColumn()).getValues();
  var c = ctx.cols;
  var ambil = function (baris, kol) { return kol ? baris[kol - 1] : ''; };

  var out = [];
  for (var i = 0; i < nilai.length; i++) {
    var b = nilai[i];
    var nama = String(ambil(b, c.nama) || '').trim();
    var lot = String(ambil(b, c.lot) || '').trim();
    if (!nama && !lot) continue;
    out.push({
      baris: ctx.headerRow + 1 + i,
      nama: nama,
      lot: lot,
      kode: String(ambil(b, c.kode) || '').trim(),
      instalasi: String(ambil(b, c.instalasi) || '').trim() || '(tanpa instalasi)',
      expDate: parseDate(ambil(b, c.expDate)),
      sisaStok: Number(ambil(b, c.sisaStok)) || 0,
      unit: String(ambil(b, c.unit) || '').trim(),
      status: String(ambil(b, c.status) || '').trim(),
    });
  }
  return out;
}

/**
 * Ringkasan kedaluwarsa hari ini.
 *
 * Lot yang sisanya nol sengaja **dilewati**: ia tidak perlu ditarik dari rak,
 * tidak perlu dimusnahkan, dan memasukkannya membuat daftar panjang oleh
 * baris yang tidak bisa ditindaklanjuti. Jumlahnya tetap disebut supaya
 * selisih dengan halaman Kedaluwarsa tidak terlihat seperti kesalahan.
 */
function notifRingkas_() {
  var ambang = notifAmbang_();
  var hariIni = new Date();
  var rows = notifBarisMaster_();

  var kelompok = { kedaluwarsa: [], kritis: [], peringatan: [] };
  var kosong = 0;
  var tanpaTanggal = 0;

  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    if (!r.expDate) { tanpaTanggal++; continue; }
    r.hari = notifHariBeda_(hariIni, r.expDate);
    if (r.hari > ambang.peringatan) continue;
    if (r.sisaStok <= 0) { kosong++; continue; }

    r.kunci = r.nama + '|' + r.lot;
    r.sidik = notifSidik_(r.kunci);
    if (r.hari < 0) kelompok.kedaluwarsa.push(r);
    else if (r.hari <= ambang.kritis) kelompok.kritis.push(r);
    else kelompok.peringatan.push(r);
  }

  var urut = function (a, b) { return a.hari - b.hari; };
  kelompok.kedaluwarsa.sort(urut);
  kelompok.kritis.sort(urut);
  kelompok.peringatan.sort(urut);

  var semua = kelompok.kedaluwarsa.concat(kelompok.kritis, kelompok.peringatan);

  // Yang baru sejak surel terakhir.
  var dulu = {};
  var simpan = String(notifProps_().getProperty('NOTIF_SIDIK_TERAKHIR') || '');
  if (simpan) {
    var daftar = simpan.split(',');
    for (var j = 0; j < daftar.length; j++) dulu[daftar[j]] = true;
  }
  var pernahKirim = Boolean(simpan);
  var baru = pernahKirim ? semua.filter(function (x) { return !dulu[x.sidik]; }) : [];

  var perInstalasi = {};
  for (var k = 0; k < semua.length; k++) {
    var s = semua[k];
    if (!perInstalasi[s.instalasi]) perInstalasi[s.instalasi] = { instalasi: s.instalasi, kedaluwarsa: 0, kritis: 0, peringatan: 0, unit: 0 };
    var slot = s.hari < 0 ? 'kedaluwarsa' : (s.hari <= ambang.kritis ? 'kritis' : 'peringatan');
    perInstalasi[s.instalasi][slot]++;
    if (s.hari < 0) perInstalasi[s.instalasi].unit += s.sisaStok;
  }
  var daftarInstalasi = Object.keys(perInstalasi).map(function (key) { return perInstalasi[key]; })
    .sort(function (a, b) { return (b.kedaluwarsa + b.kritis) - (a.kedaluwarsa + a.kritis); });

  return {
    tanggal: hariIni,
    ambang: ambang,
    kelompok: kelompok,
    semua: semua,
    baru: baru,
    pernahKirim: pernahKirim,
    perInstalasi: daftarInstalasi,
    dilewatiKarenaKosong: kosong,
    tanpaTanggal: tanpaTanggal,
    adaIsi: semua.length > 0,
  };
}

/* ----------------------------------------------------------------- surel */

function notifTanggal_(d) {
  return Utilities.formatDate(d, Session.getScriptTimeZone() || 'Asia/Jakarta', 'd MMM yyyy');
}

function notifEsc_(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function notifBarisHtml_(r, ambang) {
  var warna = r.hari < 0 ? '#b3261e' : (r.hari <= ambang.kritis ? '#9a5b00' : '#444');
  var ket = r.hari < 0 ? ('lewat ' + Math.abs(r.hari) + " hari") : (r.hari + ' hari lagi');
  return '<tr>'
    + '<td style="padding:6px 8px;border-bottom:1px solid #eee">' + notifEsc_(r.instalasi) + '</td>'
    + '<td style="padding:6px 8px;border-bottom:1px solid #eee"><b>' + notifEsc_(r.nama) + '</b>'
    + '<div style="color:#777;font-size:12px">' + notifEsc_(r.kode || 'tanpa kode') + ' · ' + notifEsc_(r.lot || 'tanpa lot') + '</div></td>'
    + '<td style="padding:6px 8px;border-bottom:1px solid #eee;white-space:nowrap">' + notifTanggal_(r.expDate) + '</td>'
    + '<td style="padding:6px 8px;border-bottom:1px solid #eee;white-space:nowrap;color:' + warna + ';font-weight:600">' + ket + '</td>'
    + '<td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right;white-space:nowrap">' + r.sisaStok + ' ' + notifEsc_(r.unit) + '</td>'
    + '</tr>';
}

var NOTIF_BATAS_TABEL = 40;

function notifSurel_(ringkas) {
  var a = ringkas.ambang;
  var k = ringkas.kelompok;
  var url = notifUrl_();

  var subjek = 'Reagen kedaluwarsa — ' + k.kedaluwarsa.length + ' lewat tanggal, '
    + k.kritis.length + ' dalam ' + a.kritis + ' hari';
  if (ringkas.baru.length) subjek = '[' + ringkas.baru.length + ' baru] ' + subjek;

  var h = [];
  h.push('<div style="font-family:system-ui,Segoe UI,Arial,sans-serif;color:#111;max-width:760px">');
  h.push('<h2 style="margin:0 0 4px">Pemantauan reagen kedaluwarsa</h2>');
  h.push('<div style="color:#666;font-size:13px;margin-bottom:16px">Keadaan per ' + notifTanggal_(ringkas.tanggal)
    + ' · ambang kritis ' + a.kritis + ' hari, peringatan ' + a.peringatan + ' hari</div>');

  h.push('<table cellspacing="0" cellpadding="0" style="margin-bottom:18px"><tr>');
  h.push('<td style="padding:10px 16px;background:#fdeceb;border-radius:8px 0 0 8px"><div style="font-size:12px;color:#8c1d18">Sudah kedaluwarsa</div>'
    + '<div style="font-size:26px;font-weight:700;color:#b3261e">' + k.kedaluwarsa.length + '</div></td>');
  h.push('<td style="padding:10px 16px;background:#fff4e5"><div style="font-size:12px;color:#7a4a00">≤ ' + a.kritis + ' hari</div>'
    + '<div style="font-size:26px;font-weight:700;color:#9a5b00">' + k.kritis.length + '</div></td>');
  h.push('<td style="padding:10px 16px;background:#f3f4f6;border-radius:0 8px 8px 0"><div style="font-size:12px;color:#555">≤ ' + a.peringatan + ' hari</div>'
    + '<div style="font-size:26px;font-weight:700;color:#333">' + k.peringatan.length + '</div></td>');
  h.push('</tr></table>');

  // Yang baru lebih dulu: itu satu-satunya bagian yang berubah tiap minggu.
  if (ringkas.baru.length) {
    h.push('<h3 style="margin:0 0 6px">Baru sejak kiriman terakhir (' + ringkas.baru.length + ')</h3>');
    h.push('<table cellspacing="0" style="border-collapse:collapse;width:100%;font-size:13px;margin-bottom:18px">');
    h.push('<thead><tr style="background:#f3f4f6;text-align:left">'
      + '<th style="padding:6px 8px">Instalasi</th><th style="padding:6px 8px">Reagen</th>'
      + '<th style="padding:6px 8px">Kedaluwarsa</th><th style="padding:6px 8px">Selisih</th>'
      + '<th style="padding:6px 8px;text-align:right">Sisa</th></tr></thead><tbody>');
    for (var b = 0; b < Math.min(ringkas.baru.length, NOTIF_BATAS_TABEL); b++) {
      h.push(notifBarisHtml_(ringkas.baru[b], a));
    }
    h.push('</tbody></table>');
  } else if (ringkas.pernahKirim) {
    h.push('<p style="margin:0 0 18px;color:#555">Tidak ada lot baru yang melewati ambang sejak kiriman terakhir.</p>');
  }

  if (ringkas.perInstalasi.length) {
    h.push('<h3 style="margin:0 0 6px">Per instalasi</h3>');
    h.push('<table cellspacing="0" style="border-collapse:collapse;width:100%;font-size:13px;margin-bottom:18px">');
    h.push('<thead><tr style="background:#f3f4f6;text-align:left">'
      + '<th style="padding:6px 8px">Instalasi</th><th style="padding:6px 8px;text-align:right">Kedaluwarsa</th>'
      + '<th style="padding:6px 8px;text-align:right">≤ ' + a.kritis + ' hari</th>'
      + '<th style="padding:6px 8px;text-align:right">≤ ' + a.peringatan + ' hari</th>'
      + '<th style="padding:6px 8px;text-align:right">Unit terdampak</th></tr></thead><tbody>');
    for (var i = 0; i < ringkas.perInstalasi.length; i++) {
      var p = ringkas.perInstalasi[i];
      h.push('<tr><td style="padding:6px 8px;border-bottom:1px solid #eee">' + notifEsc_(p.instalasi) + '</td>'
        + '<td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right">' + p.kedaluwarsa + '</td>'
        + '<td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right">' + p.kritis + '</td>'
        + '<td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right">' + p.peringatan + '</td>'
        + '<td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right">' + p.unit + '</td></tr>');
    }
    h.push('</tbody></table>');
  }

  var paling = ringkas.kelompok.kedaluwarsa.concat(ringkas.kelompok.kritis);
  if (paling.length) {
    h.push('<h3 style="margin:0 0 6px">Paling mendesak</h3>');
    h.push('<table cellspacing="0" style="border-collapse:collapse;width:100%;font-size:13px">');
    h.push('<thead><tr style="background:#f3f4f6;text-align:left">'
      + '<th style="padding:6px 8px">Instalasi</th><th style="padding:6px 8px">Reagen</th>'
      + '<th style="padding:6px 8px">Kedaluwarsa</th><th style="padding:6px 8px">Selisih</th>'
      + '<th style="padding:6px 8px;text-align:right">Sisa</th></tr></thead><tbody>');
    for (var m = 0; m < Math.min(paling.length, NOTIF_BATAS_TABEL); m++) {
      h.push(notifBarisHtml_(paling[m], a));
    }
    h.push('</tbody></table>');
    if (paling.length > NOTIF_BATAS_TABEL) {
      h.push('<p style="color:#666;font-size:13px">… dan ' + (paling.length - NOTIF_BATAS_TABEL)
        + ' lot lagi. Daftar lengkapnya ada di dashboard.</p>');
    }
  }

  // Angka di surel ini sengaja berbeda dari halaman Kedaluwarsa, dan bedanya
  // disebutkan — selisih yang tidak dijelaskan selalu dikira kesalahan.
  h.push('<p style="color:#666;font-size:12px;margin-top:18px;border-top:1px solid #eee;padding-top:10px">');
  h.push('Lot yang sisa stoknya nol tidak ikut didaftar di sini (' + ringkas.dilewatiKarenaKosong
    + ' lot) karena tidak ada yang perlu ditarik dari rak. ');
  h.push(ringkas.tanpaTanggal + ' lot belum punya tanggal kedaluwarsa dan tidak bisa dinilai.');
  h.push('</p>');

  h.push('<p style="margin-top:14px"><a href="' + notifEsc_(url) + '/#/kedaluwarsa" '
    + 'style="background:#b3261e;color:#fff;padding:9px 16px;border-radius:999px;text-decoration:none;font-size:13px">'
    + 'Buka daftar lengkap</a></p>');
  h.push('<p style="color:#888;font-size:11px;margin-top:16px">Dikirim otomatis oleh Reagensia writer. '
    + 'Untuk berhenti, hapus pemicu mingguannya di proyek Apps Script.</p>');
  h.push('</div>');

  return { subjek: subjek, html: h.join(''), penerima: notifPenerima_() };
}

/* ---------------------------------------------------------------- kirim */

/**
 * @param {{kirim?: boolean, paksa?: boolean}} opsi
 *   `kirim: false` (baku) hanya menyusun surelnya dan mengembalikannya — dipakai
 *   memeriksa isinya sebelum ada yang terkirim ke siapa pun.
 */
function notifJalankan_(opsi) {
  opsi = opsi || {};
  var ringkas = notifRingkas_();
  var surel = notifSurel_(ringkas);

  var hasil = {
    subjek: surel.subjek,
    penerima: surel.penerima,
    kedaluwarsa: ringkas.kelompok.kedaluwarsa.length,
    kritis: ringkas.kelompok.kritis.length,
    peringatan: ringkas.kelompok.peringatan.length,
    baru: ringkas.baru.length,
    pernahKirim: ringkas.pernahKirim,
    dilewatiKarenaKosong: ringkas.dilewatiKarenaKosong,
    tanpaTanggal: ringkas.tanpaTanggal,
    perInstalasi: ringkas.perInstalasi,
    terkirim: false,
  };

  if (!opsi.kirim) {
    hasil.catatan = 'Belum dikirim ke siapa pun. Kirim ulang dengan kirim: true.';
    hasil.html = surel.html;
    return hasil;
  }

  if (!surel.penerima.length) {
    throw fail('CONFIG', 'Tidak ada penerima: isi EMAIL_NOTIFIKASI di Script Properties, atau pastikan pemilik skrip punya alamat surel.');
  }

  // Tidak ada yang perlu dikabarkan: diam. Surel "semuanya aman" tiap minggu
  // adalah cara tercepat membuat orang berhenti membaca surel berikutnya.
  if (!ringkas.adaIsi && !opsi.paksa) {
    hasil.catatan = 'Tidak ada lot yang melewati ambang; tidak ada surel yang dikirim.';
    return hasil;
  }

  MailApp.sendEmail({
    to: surel.penerima.join(','),
    subject: surel.subjek,
    htmlBody: surel.html,
    name: 'Reagensia',
  });

  // Sidik disimpan SESUDAH berhasil kirim. Kalau pengiriman gagal, daftar
  // lamanya tetap, jadi lot yang belum pernah dikabarkan tidak kehilangan
  // status "baru"-nya di kiriman berikutnya.
  var sidik = ringkas.semua.map(function (x) { return x.sidik; }).join(',');
  notifProps_().setProperty('NOTIF_SIDIK_TERAKHIR', sidik);
  notifProps_().setProperty('NOTIF_TERAKHIR', new Date().toISOString());

  hasil.terkirim = true;
  return hasil;
}

/** Titik masuk pemicu mingguan. Jangan diganti namanya — pemicunya menunjuk ke sini. */
function kirimNotifikasiKedaluwarsa() {
  try {
    var hasil = notifJalankan_({ kirim: true });
    console.log('Notifikasi kedaluwarsa: ' + JSON.stringify(hasil));
    return hasil;
  } catch (err) {
    console.error('Notifikasi kedaluwarsa gagal: ' + (err && err.message ? err.message : err));
    throw err;
  }
}

/* --------------------------------------------------------------- pemicu */

function notifDaftarPemicu_() {
  return ScriptApp.getProjectTriggers().filter(function (t) {
    return t.getHandlerFunction() === NOTIF_PEMICU;
  });
}

/**
 * Pasang pemicu mingguan. Yang lama dihapus lebih dulu — memanggil fungsi ini
 * dua kali tidak boleh menghasilkan dua surel tiap minggu.
 *
 * @param {{hari?: string, jam?: number}} opsi hari: SENIN..MINGGU
 */
function notifPasangPemicu_(opsi) {
  opsi = opsi || {};
  var hariKe = {
    SENIN: ScriptApp.WeekDay.MONDAY, SELASA: ScriptApp.WeekDay.TUESDAY,
    RABU: ScriptApp.WeekDay.WEDNESDAY, KAMIS: ScriptApp.WeekDay.THURSDAY,
    JUMAT: ScriptApp.WeekDay.FRIDAY, SABTU: ScriptApp.WeekDay.SATURDAY,
    MINGGU: ScriptApp.WeekDay.SUNDAY,
  };
  var namaHari = String(opsi.hari || 'SENIN').toUpperCase();
  if (!hariKe[namaHari]) throw fail('BAD_REQUEST', 'Hari tidak dikenal: ' + opsi.hari);
  var jam = opsi.jam == null ? 7 : Number(opsi.jam);
  if (!(jam >= 0 && jam <= 23)) throw fail('BAD_REQUEST', 'Jam harus 0–23.');

  var lama = notifDaftarPemicu_();
  for (var i = 0; i < lama.length; i++) ScriptApp.deleteTrigger(lama[i]);

  ScriptApp.newTrigger(NOTIF_PEMICU).timeBased().onWeekDay(hariKe[namaHari]).atHour(jam).create();

  return {
    dipasang: true, hari: namaHari, jam: jam,
    dihapusLebihDulu: lama.length,
    zonaWaktu: Session.getScriptTimeZone(),
    penerima: notifPenerima_(),
  };
}

function notifHapusPemicu_() {
  var lama = notifDaftarPemicu_();
  for (var i = 0; i < lama.length; i++) ScriptApp.deleteTrigger(lama[i]);
  return { dihapus: lama.length };
}

function notifStatusPemicu_() {
  var daftar = notifDaftarPemicu_().map(function (t) {
    return { id: t.getUniqueId(), fungsi: t.getHandlerFunction(), jenis: String(t.getEventType()) };
  });
  return {
    pemicu: daftar,
    aktif: daftar.length > 0,
    penerima: notifPenerima_(),
    ambang: notifAmbang_(),
    terakhirKirim: notifProps_().getProperty('NOTIF_TERAKHIR') || null,
    zonaWaktu: Session.getScriptTimeZone(),
  };
}

/* -------------------------------------------------------------- properti */

/**
 * Setel properti notifikasi dari luar.
 *
 * Daftar kuncinya dibatasi dengan sengaja: endpoint ini bisa dipanggil siapa
 * pun yang punya token, dan `SPREADSHEET_ID` atau `API_TOKEN` tidak boleh
 * pernah bisa diubah lewat jalur yang dibuat untuk mengatur alamat surel.
 */
function notifAturProperti_(body) {
  var isi = body && body.properti;
  if (!isi || typeof isi !== 'object') throw fail('BAD_REQUEST', 'Kirim objek "properti".');

  var props = notifProps_();
  var diubah = [];
  for (var kunci in isi) {
    if (!isi.hasOwnProperty(kunci)) continue;
    if (NOTIF_PROPERTI.indexOf(kunci) === -1) {
      throw fail('BAD_REQUEST', 'Properti "' + kunci + '" tidak boleh diubah lewat endpoint ini. Yang boleh: ' + NOTIF_PROPERTI.join(', '));
    }
    var nilai = String(isi[kunci] == null ? '' : isi[kunci]).trim();
    if (nilai) props.setProperty(kunci, nilai);
    else props.deleteProperty(kunci);
    diubah.push(kunci);
  }
  return { diubah: diubah, status: notifStatusPemicu_() };
}
