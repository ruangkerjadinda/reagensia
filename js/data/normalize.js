/**
 * Ubah baris mentah tiap tab menjadi record kanonis, lalu turunkan field yang
 * dipakai di seluruh dashboard (risiko kedaluwarsa, stok rendah, ketidakcocokan
 * data, kelengkapan dokumen).
 *
 * Semua perhitungan tanggal memakai awal hari supaya selisih hari stabil dan
 * tidak bergeser karena jam pengambilan data.
 */

import { CONFIG } from '../config.js';

export const BUCKET = {
  EXPIRED: 'EXPIRED',
  CRITICAL: 'CRITICAL',
  WARNING: 'WARNING',
  WATCH: 'WATCH',
  SAFE: 'SAFE',
  UNKNOWN: 'UNKNOWN',
};

export const BUCKET_META = {
  EXPIRED: { label: 'Kedaluwarsa', short: 'Kedaluwarsa', tone: 'danger', order: 0 },
  CRITICAL: { label: 'Kritis (≤30 hari)', short: '≤30 hari', tone: 'danger', order: 1 },
  WARNING: { label: 'Peringatan (≤90 hari)', short: '≤90 hari', tone: 'warn', order: 2 },
  WATCH: { label: 'Pantau (≤180 hari)', short: '≤180 hari', tone: 'watch', order: 3 },
  SAFE: { label: 'Aman', short: 'Aman', tone: 'ok', order: 4 },
  UNKNOWN: { label: 'Tanpa tanggal', short: 'Tanpa tanggal', tone: 'muted', order: 5 },
};

const DAY_MS = 86400000;

export function startOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function daysBetween(from, to) {
  return Math.round((startOfDay(to) - startOfDay(from)) / DAY_MS);
}

const norm = (s) => String(s ?? '').toUpperCase().replace(/\s+/g, ' ').trim();

/** Kunci gabungan Kode + Lot, dipakai untuk menyambung antar tab. */
export function lotKey(kode, lot) {
  return `${norm(kode)}|${norm(lot)}`;
}

/**
 * Tab Pemusnahan tidak punya kolom Kode sama sekali, jadi barisnya tidak bisa
 * langsung dikunci ke Master Stok. Kodenya dicari lewat Nama Reagen + Kode/Lot
 * — pasangan itu unik di Master Stok untuk seluruh baris pemusnahan yang ada —
 * dan kalau namanya meleset, lot sendirian dipakai sebagai cadangan, tapi hanya
 * kalau lot itu cuma dimiliki satu kode (ada 14 nomor lot yang dipakai lebih
 * dari satu reagen; menebak di situ akan memindahkan transaksi ke lot lain).
 */
function kodeResolver(masterRows) {
  const byNamaLot = new Map();
  const byLot = new Map();

  for (const r of masterRows) {
    if (!r.kode) continue;
    const nl = `${norm(r.nama)}|${norm(r.lot)}`;
    if (!byNamaLot.has(nl)) byNamaLot.set(nl, r.kode);

    const l = norm(r.lot);
    if (!byLot.has(l)) byLot.set(l, r.kode);
    else if (byLot.get(l) !== r.kode) byLot.set(l, null); // ambigu — jangan tebak
  }

  return (row) => {
    if (row.kode) return { kode: row.kode, resolved: false };
    const hit = byNamaLot.get(`${norm(row.nama)}|${norm(row.lot)}`) || byLot.get(norm(row.lot)) || '';
    return { kode: hit, resolved: Boolean(hit) };
  };
}

function bucketFor(expDate, today, thresholds) {
  if (!expDate) return { bucket: BUCKET.UNKNOWN, days: null };
  const days = daysBetween(today, expDate);
  if (days < 0) return { bucket: BUCKET.EXPIRED, days };
  if (days <= thresholds.critical) return { bucket: BUCKET.CRITICAL, days };
  if (days <= thresholds.warning) return { bucket: BUCKET.WARNING, days };
  if (days <= thresholds.watch) return { bucket: BUCKET.WATCH, days };
  return { bucket: BUCKET.SAFE, days };
}

/** Baris kosong di ekor sheet ikut terbawa gviz; buang yang tidak punya identitas. */
const hasIdentity = (r) => Boolean(r.kode || r.nama || r.instalasi);

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const isLink = (v) => typeof v === 'string' && /^https?:\/\//i.test(v.trim());

/**
 * @param {object} tables hasil fetchAll — tiap nilai array baris atau null
 * @param {{today?: Date, thresholds?: object}} [options]
 */
export function normalize(tables, options = {}) {
  const today = startOfDay(options.today || new Date());
  const thresholds = options.thresholds || CONFIG.thresholds;

  const masterRows = (tables.master || []).filter(hasIdentity);
  const resolveKode = kodeResolver(masterRows);

  /** Lengkapi kode yang tidak ada di tabnya, lalu kunci barisnya ke lot. */
  const withKey = (rows, extra) => (rows || []).filter(hasIdentity).map((r) => {
    const { kode, resolved } = resolveKode(r);
    return {
      ...r,
      kode,
      kodeDariMaster: resolved,
      key: lotKey(kode, r.lot),
      qty: num(r.qty),
      ...(extra ? extra(r) : null),
    };
  });

  const receipts = withKey(tables.penerimaan, (r) => ({
    hasCoa: isLink(r.linkCoa),
    hasMsds: isLink(r.linkMsds),
    kodeBmn: r.kodeBmn == null || r.kodeBmn === '' ? '' : String(r.kodeBmn).trim(),
  }));

  const issues = withKey(tables.distribusi);

  const disposals = withKey(tables.pemusnahan);

  const cards = (tables.kartuStok || []).filter((r) => r.nama || r.instalasi).map((r) => ({
    ...r,
    key: lotKey('', r.lot),
    masuk: num(r.masuk),
    keluar: num(r.keluar),
    saldo: num(r.saldo),
  }));

  // Dokumen dicatat per lot: satu lot dianggap lengkap kalau ada satu baris
  // penerimaan yang membawa tautannya.
  //
  // Tab Penerimaan juga jadi sumber beberapa field yang sudah tidak ada lagi di
  // Master Stok — Kategori — dan beberapa yang memang tidak pernah ada di sana:
  // nomor BMN, lokasi fisik penyimpanan, suhu simpan saat diterima. Semuanya
  // diambil dari baris penerimaan pertama yang mengisinya.
  const fromReceipts = new Map();
  for (const r of receipts) {
    const prev = fromReceipts.get(r.key) || {
      coa: null, msds: null, statusCoa: '', statusMsds: '',
      kategori: '', kodeBmn: '', lokasiSimpan: '', suhuSimpan: '',
    };
    if (!prev.coa && r.hasCoa) prev.coa = r.linkCoa;
    if (!prev.msds && r.hasMsds) prev.msds = r.linkMsds;
    prev.statusCoa = r.statusCoa || prev.statusCoa;
    prev.statusMsds = r.statusMsds || prev.statusMsds;
    prev.kategori = prev.kategori || r.kategori || '';
    prev.kodeBmn = prev.kodeBmn || r.kodeBmn || '';
    prev.lokasiSimpan = prev.lokasiSimpan || r.lokasiSimpan || '';
    prev.suhuSimpan = prev.suhuSimpan || r.suhuSimpan || '';
    fromReceipts.set(r.key, prev);
  }

  // Lot yang belum pernah muncul di Penerimaan masih bisa punya kategori dari
  // tab transaksi lain; keduanya menyimpan kolom Kategori sendiri.
  const kategoriByKey = new Map();
  for (const r of [...issues, ...disposals]) {
    if (r.kategori && !kategoriByKey.has(r.key)) kategoriByKey.set(r.key, r.kategori);
  }

  const issuesByKey = groupBy(issues, (r) => r.key);
  const receiptsByKey = groupBy(receipts, (r) => r.key);
  const disposalsByKey = groupBy(disposals, (r) => r.key);

  const lots = masterRows.map((r) => {
    const key = lotKey(r.kode, r.lot);
    const { bucket, days } = bucketFor(r.expDate, today, thresholds);

    const stokAwal = num(r.stokAwal);
    const pembelian = num(r.pembelian);
    const hibah = num(r.hibah);
    const titipan = num(r.titipan);
    const distribusi = num(r.distribusi);
    const pemusnahan = num(r.pemusnahan);
    const sisaStok = num(r.sisaStok);
    const stokMin = num(r.stokMin);
    // Hibah dan Titipan Daerah ikut dijumlahkan di rumus Sisa Stok milik sheet;
    // kalau dilewatkan di sini, setiap lot hibah akan dilaporkan tidak cocok.
    const masuk = stokAwal + pembelian + hibah + titipan;
    const computedSisa = masuk - distribusi - pemusnahan;

    const docs = fromReceipts.get(key) || {
      coa: null, msds: null, statusCoa: '', statusMsds: '',
      kategori: '', kodeBmn: '', lokasiSimpan: '', suhuSimpan: '',
    };
    const status = (r.status || '').toUpperCase();
    const isExpired = bucket === BUCKET.EXPIRED;

    return {
      ...r,
      key,
      stokAwal,
      pembelian,
      hibah,
      titipan,
      distribusi,
      pemusnahan,
      sisaStok,
      stokMin,
      masuk,
      computedSisa,

      // Tidak ada lagi di Master Stok — diambil dari tab transaksi.
      kategori: docs.kategori || kategoriByKey.get(key) || '',
      kodeBmn: docs.kodeBmn,
      lokasiSimpan: docs.lokasiSimpan,
      suhuSimpan: docs.suhuSimpan || r.lokasi || '',
      status,
      bucket,
      daysToExpiry: days,
      isExpired,
      isOutOfStock: sisaStok <= 0,
      isLowStock: sisaStok > 0 && sisaStok <= stokMin,
      atOrBelowMin: sisaStok <= stokMin,

      // Temuan integritas — dipakai halaman Audit Data.
      sisaMismatch: computedSisa !== sisaStok,
      sisaDelta: sisaStok - computedSisa,
      // Dua arah ketidakcocokan status dipisah karena artinya berbeda: yang
      // pertama berarti reagen kedaluwarsa masih dianggap boleh dipakai.
      expiredButActive: isExpired && status === 'AKTIF',
      validButInactive: !isExpired && bucket !== BUCKET.UNKNOWN && status === 'TIDAK AKTIF',
      statusMismatch: isExpired
        ? status === 'AKTIF'
        : status === 'TIDAK AKTIF' && bucket !== BUCKET.UNKNOWN,
      missingExpiry: !r.expDate,
      missingSupplier: !r.supplier,
      missingLot: !r.lot,

      coaUrl: docs.coa,
      msdsUrl: docs.msds,
      hasCoa: Boolean(docs.coa),
      hasMsds: Boolean(docs.msds),

      receipts: receiptsByKey.get(key) || [],
      issues: issuesByKey.get(key) || [],
      disposals: disposalsByKey.get(key) || [],
    };
  });

  // Baris transaksi yang kodenya tidak ada di Master Stok — kandidat salah ketik.
  const masterKeys = new Set(lots.map((l) => l.key));
  const orphans = [...issues, ...disposals, ...receipts]
    .filter((r) => !masterKeys.has(r.key))
    .map((r) => ({ tab: r._tab, row: r._row, kode: r.kode, lot: r.lot, nama: r.nama }));

  return { lots, receipts, issues, disposals, cards, orphans, today, thresholds };
}

export function groupBy(items, keyFn) {
  const map = new Map();
  for (const item of items) {
    const k = keyFn(item);
    const list = map.get(k);
    if (list) list.push(item);
    else map.set(k, [item]);
  }
  return map;
}
