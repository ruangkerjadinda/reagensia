/**
 * Uji terima otomatis untuk Web App Apps Script (mode input).
 *
 * Daftar periksa di apps-script/DEPLOY.md ditulis untuk dikerjakan manusia
 * sambil memelototi spreadsheet. Berkas ini mengerjakan kesembilan langkahnya
 * sendiri: mengirim permintaan ke Web App, lalu membaca ulang sheet-nya lewat
 * gviz untuk memastikan yang terjadi memang yang seharusnya.
 *
 *   node tools/acceptance.mjs --url <URL /exec> --token <token> --sheet <id salinan>
 *
 * PENTING: ini MENULIS ke spreadsheet yang ditunjuk — baris penerimaan,
 * distribusi, pemusnahan, dan satu lot percobaan. Karena itu ia menolak
 * berjalan terhadap workbook produksi, dicocokkan dengan CONFIG.spreadsheetId.
 * Jalankan di salinan, seperti yang diminta DEPLOY.md.
 *
 * Keluar dengan status bukan-nol kalau ada langkah yang gagal, supaya bisa
 * dipakai sebagai gerbang sebelum deployment dipasang di workbook asli.
 */

import { CONFIG } from '../js/config.js';
import { fetchAll } from '../js/data/sheets.js';
import { normalize } from '../js/data/normalize.js';

/* ------------------------------------------------------------- argumen */

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
}

const URL_EXEC = arg('url', process.env.REAGENSIA_URL);
const TOKEN = arg('token', process.env.REAGENSIA_TOKEN);
const SHEET = arg('sheet', process.env.REAGENSIA_SHEET);
const ACTOR = arg('actor', 'Uji Otomatis');

if (!URL_EXEC || !TOKEN || !SHEET) {
  console.error('Perlu --url, --token, dan --sheet (id spreadsheet SALINAN).');
  process.exit(2);
}

if (SHEET === CONFIG.spreadsheetId) {
  console.error('DITOLAK: --sheet menunjuk workbook produksi. Uji terima menulis baris sungguhan; jalankan di salinan.');
  process.exit(2);
}

/* ------------------------------------------------------------- pembantu */

const stamp = Date.now();
let gagal = 0;
let lulus = 0;

function periksa(nomor, judul, kondisi, detail = '') {
  if (kondisi) {
    lulus += 1;
    console.log(`  ✓ ${nomor}. ${judul}`);
  } else {
    gagal += 1;
    console.log(`  ✗ ${nomor}. ${judul}${detail ? `\n       ${detail}` : ''}`);
  }
}

/** Kontrak yang sama dengan js/data/writer.js: text/plain, tanggal sebagai {__date}. */
async function post(action, payload, requestId) {
  const body = {
    action,
    token: TOKEN,
    actor: ACTOR,
    requestId: requestId || `uji-${stamp}-${Math.random().toString(36).slice(2, 10)}`,
    payload,
  };
  const res = await fetch(URL_EXEC, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(body),
    redirect: 'follow',
  });
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { ok: false, code: 'BAD_RESPONSE', error: text.slice(0, 300) };
  }
}

/** Keadaan sheet sekarang, dibaca lewat jalur yang sama dengan dashboard. */
async function state() {
  const { tables, errors } = await fetchAll(SHEET, { bust: true });
  if (errors.length === 5) {
    // Semua tab gagal sekaligus hampir selalu berarti satu hal: salinannya
    // belum dibagikan. gviz membaca sebagai tamu, tanpa login — kalau
    // berkasnya masih privat, setiap tab menjawab sama-sama gagal.
    throw new Error(
      'Tidak satu pun tab terbaca. Hampir pasti salinannya belum dibagikan:\n'
      + '  Buka salinan → Bagikan → Akses umum → "Siapa saja yang memiliki link" → Pelihat.\n'
      + '  Uji terima membaca ulang sheet lewat gviz (tanpa login), persis seperti dashboard,\n'
      + '  supaya yang memeriksa hasil bukan skrip yang barusan menulisnya.',
    );
  }
  if (errors.length) throw new Error(`Gagal membaca salinan: ${errors.map((e) => `${e.tab} (${e.message})`).join(', ')}`);
  const data = normalize(tables);
  const byKey = new Map(data.lots.map((l) => [l.key, l]));
  return { data, byKey, lot: (k) => byKey.get(k) };
}

/**
 * Jawaban server, dipendekkan.
 *
 * Setiap kegagalan menyertakan ini. Tanpanya, langkah yang gagal karena
 * servernya menolak terlihat sama persis dengan langkah yang gagal karena
 * angkanya salah — dan satu kali kejadian ("Kolom wajib belum diisi:
 * metode") sudah cukup untuk menghabiskan satu putaran diagnosis penuh.
 */
const jawab = (r) => (r && r.ok === false
  ? `ditolak: ${r.code || ''} ${String(r.error || '').slice(0, 180)}`
  : `jawaban: ${JSON.stringify(r).slice(0, 180)}`);

const iso = (d) => ({ __date: d.toISOString() });
const hariIni = iso(new Date());

/* --------------------------------------------------------------- jalan */

console.log(`Uji terima terhadap ${URL_EXEC}\nSalinan: ${SHEET}\n`);

const awal = await state();

// Lot percobaan dipilih dari isi salinan: harus punya nomor lot dan sisa yang
// cukup untuk dikurangi beberapa kali tanpa menyentuh nol di tengah jalan.
// Kuncinya harus unik di salinan ini. Satu lot bisa muncul dua kali kalau
// pernah ditulis dengan ejaan nama yang berbeda (lihat identitasMaster di
// Code.gs); peta byKey menyimpan yang terakhir, jadi lot kembar akan membuat
// langkah 1 membandingkan baris yang berbeda dengan yang barusan ditambah.
const berapaKali = new Map();
for (const l of awal.data.lots) berapaKali.set(l.key, (berapaKali.get(l.key) || 0) + 1);
const subjek = awal.data.lots.find((l) => l.lot && l.sisaStok >= 5 && l.kode && berapaKali.get(l.key) === 1);
if (!subjek) {
  console.error('Tidak ada lot dengan nomor lot dan sisa >= 5 di salinan ini; uji terima butuh satu.');
  process.exit(2);
}
console.log(`Lot percobaan: ${subjek.kode} / ${subjek.lot} (sisa ${subjek.sisaStok} ${subjek.unit || ''})\n`);

const identitas = {
  instalasi: subjek.instalasi,
  kode: subjek.kode,
  nama: subjek.nama,
  lot: subjek.lot,
  merk: subjek.merk,
  supplier: subjek.supplier,
  unit: subjek.unit,
  kategori: subjek.kategori || 'Pembelian',
};

/* 1. Penerimaan untuk lot yang sudah ada */
const r1 = await post('penerimaan.create', { ...identitas, tanggal: hariIni, qty: 2, pic: ACTOR, ket: 'uji terima 1' });
let s = await state();
periksa(1, 'Penerimaan lot yang sudah ada menambah stok',
  r1.ok && s.lot(subjek.key) && s.lot(subjek.key).sisaStok === subjek.sisaStok + 2,
  r1.ok ? `sisa ${subjek.sisaStok} → ${s.lot(subjek.key)?.sisaStok} (diharapkan ${subjek.sisaStok + 2})` : JSON.stringify(r1).slice(0, 200));

/* 2. Penerimaan untuk lot yang belum pernah ada */
const kodeBaru = `UJI-${stamp}`;
const namaBaru = `REAGEN UJI ${stamp}`;
const lotBaru = `LOT-UJI-${stamp}`;
// Lot baru dicari lewat nama + lot, bukan lewat kode. Kolom Kode di tab
// Penerimaan adalah rumus yang mencari kode dari nama reagen di Daftar Kode,
// jadi reagen yang belum terdaftar di sana memang tidak punya kode — dan
// kunci kode|lot untuk lot seperti itu tidak akan pernah ketemu.
const lotBaruDi = (st) => st.data.lots.find((l) => l.nama === namaBaru && l.lot === lotBaru);
const r2 = await post('penerimaan.create', {
  instalasi: subjek.instalasi, kode: kodeBaru, nama: namaBaru, lot: lotBaru,
  merk: 'UJI', supplier: 'UJI', unit: subjek.unit || 'Kit', kategori: identitas.kategori,
  tanggal: hariIni, qty: 4, pic: ACTOR, ket: 'uji terima 2',
});
s = await state();
periksa(2, 'Penerimaan lot baru membuat baris Master Stok sendiri',
  r2.ok && lotBaruDi(s) && lotBaruDi(s).sisaStok === 4,
  `baris ${lotBaruDi(s)?._row || '(belum muncul)'}, sisa ${lotBaruDi(s)?.sisaStok} (diharapkan 4); ${jawab(r2)}`);

/* 3. Distribusi */
const sebelum3 = s.lot(subjek.key)?.sisaStok ?? 0;
const idUlang = `uji-${stamp}-distribusi`;
const r3 = await post('distribusi.create', {
  ...identitas, tanggal: hariIni, qty: 1, picPengirim: ACTOR, picPenerima: 'Penerima Uji', ket: 'uji terima 3',
}, idUlang);
s = await state();
periksa(3, 'Distribusi mengurangi stok',
  r3.ok && s.lot(subjek.key)?.sisaStok === sebelum3 - 1,
  `sisa ${sebelum3} → ${s.lot(subjek.key)?.sisaStok} (diharapkan ${sebelum3 - 1}); ${jawab(r3)}`);

/* 4. Pemusnahan */
const sebelum4 = s.lot(subjek.key)?.sisaStok ?? 0;
const r4 = await post('pemusnahan.create', {
  ...identitas, tanggal: hariIni, qty: 1, alasan: 'Kedaluwarsa', pic: ACTOR, ket: 'uji terima 4',
});
s = await state();
periksa(4, 'Pemusnahan mengurangi stok',
  r4.ok && s.lot(subjek.key)?.sisaStok === sebelum4 - 1,
  `sisa ${sebelum4} → ${s.lot(subjek.key)?.sisaStok} (diharapkan ${sebelum4 - 1}); ${jawab(r4)}`);

/* 5. Distribusi melebihi sisa harus ditolak */
const sebelum5 = s.lot(subjek.key)?.sisaStok ?? 0;
const jumlahBaris5 = s.data.issues.length;
const r5 = await post('distribusi.create', {
  ...identitas, tanggal: hariIni, qty: sebelum5 + 1000, picPengirim: ACTOR, picPenerima: 'Penerima Uji',
});
s = await state();
periksa(5, 'Distribusi melebihi sisa ditolak dan tidak meninggalkan baris',
  !r5.ok && s.data.issues.length === jumlahBaris5 && s.lot(subjek.key)?.sisaStok === sebelum5,
  jawab(r5));

/* 6. Kiriman ganda */
const jumlahBaris6 = s.data.issues.length;
const r6 = await post('distribusi.create', {
  ...identitas, tanggal: hariIni, qty: 1, picPengirim: ACTOR, picPenerima: 'Penerima Uji', ket: 'uji terima 3',
}, idUlang);
s = await state();
periksa(6, 'requestId yang sama tidak membuat baris kedua',
  r6.duplicate === true && s.data.issues.length === jumlahBaris6,
  `duplicate=${r6.duplicate}, baris distribusi ${jumlahBaris6} → ${s.data.issues.length}; ${jawab(r6)}`);

/* 7. Sisa Stok harus berupa rumus.
 *    gviz hanya mengirim nilai, bukan rumus — jadi yang ditanya adalah skripnya
 *    sendiri: repairSisa dengan dryRun mendaftar baris yang Sisa Stok-nya BUKAN
 *    rumus. Baris yang barusan tersentuh tidak boleh ada di daftar itu. */
const r7 = await post('maintenance.repairSisa', { dryRun: true });
const barisTanpaRumus = new Set((r7.result?.rows || r7.rows || []).map((x) => x.row));
const barisSubjek = s.lot(subjek.key)?._row;
const barisBaru = lotBaruDi(s)?._row;
periksa(7, 'Sisa Stok pada baris yang tersentuh tetap berupa rumus',
  r7.ok !== false && !barisTanpaRumus.has(barisSubjek) && !barisTanpaRumus.has(barisBaru),
  `baris ${barisSubjek} dan ${barisBaru}; ${barisTanpaRumus.size} baris tanpa rumus di seluruh sheet`);

/* 8. Tab Log terisi */
const log = await logRows();
periksa(8, 'Tab Log mencatat setiap penulisan',
  log >= 5,
  `${log} baris di tab Log (minimal 5 penulisan berhasil di atas)`);

/* 9. Distribusi sampai nol: sisa 0, dan kolom Status tidak ikut dirusak.
 *
 *    Harapan lama ("statusnya jadi TIDAK AKTIF") salah untuk workbook ini.
 *    Status di Master Stok adalah rumus tanggal kedaluwarsa — TIDAK AKTIF di
 *    sana berarti lewat exp date, bukan stok habis. Menulis TIDAK AKTIF ke
 *    sana justru yang merusak: rumusnya hilang dan kolomnya berhenti ikut
 *    tanggal. Jadi yang diperiksa adalah sisa benar-benar nol DAN rumus
 *    Status-nya masih utuh. Lot yang habis ditandai dashboard sendiri, dari
 *    Sisa Stok. */
const sisaBaru = lotBaruDi(s)?.sisaStok ?? 0;
let r9 = { ok: true };
if (sisaBaru > 0) {
  r9 = await post('distribusi.create', {
    instalasi: subjek.instalasi, kode: kodeBaru, nama: namaBaru, lot: lotBaru,
    merk: 'UJI', supplier: 'UJI', unit: subjek.unit || 'Kit', kategori: identitas.kategori,
    tanggal: hariIni, qty: sisaBaru, picPengirim: ACTOR, picPenerima: 'Penerima Uji', ket: 'uji terima 9',
  });
}
s = await state();
const sel9 = await post('maintenance.inspect', { kode: kodeBaru, nama: namaBaru, lot: lotBaru }, `uji-${stamp}-inspect`);
const status9 = sel9.result?.master?.cells?.status || {};
// Rumus utuh, atau — di workbook yang Status-nya memang diketik — TIDAK AKTIF.
const statusUtuh = String(status9.formula || '') !== '' || s.lot(kunciBaru)?.status === 'TIDAK AKTIF';
periksa(9, 'Lot yang habis jadi sisa 0 tanpa merusak kolom Status',
  r9.ok && lotBaruDi(s)?.sisaStok === 0 && statusUtuh,
  `sisa ${lotBaruDi(s)?.sisaStok}, status "${lotBaruDi(s)?.status}", `
  + `rumus Status ${status9.formula ? 'utuh' : 'TIDAK ada'}; ${jawab(r9)}`);

/* -------------------------------------------------------------- tutup */

console.log(`\n${lulus} lulus, ${gagal} gagal.`);
if (gagal === 0) {
  console.log('Kesembilan langkah DEPLOY.md lulus di salinan ini.');
  console.log(`Baris uji tertinggal di salinan: lot ${kodeBaru} / ${lotBaru} dan beberapa baris transaksi bertanda "uji terima".`);
}
process.exit(gagal ? 1 : 0);

/** Tab Log tidak ada di SCHEMA, jadi dibaca langsung. */
async function logRows() {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET}/gviz/tq?tqx=out:json&sheet=Log&_=${Date.now()}`;
  try {
    const text = await fetch(url).then((r) => r.text());
    const payload = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
    return (payload.table?.rows || []).filter((r) => (r.c || []).some((c) => c && c.v)).length;
  } catch {
    return 0;
  }
}
