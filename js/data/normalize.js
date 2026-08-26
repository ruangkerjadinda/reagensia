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

/** Kunci gabungan Kode + Lot, dipakai untuk menyambung antar tab. */
export function lotKey(kode, lot) {
  const norm = (s) => String(s ?? '').toUpperCase().replace(/\s+/g, ' ').trim();
  return `${norm(kode)}|${norm(lot)}`;
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

  const receipts = (tables.penerimaan || []).filter(hasIdentity).map((r) => ({
    ...r,
    key: lotKey(r.kode, r.lot),
    qty: num(r.qty),
    hasCoa: isLink(r.linkCoa),
    hasMsds: isLink(r.linkMsds),
  }));

  const issues = (tables.distribusi || []).filter(hasIdentity).map((r) => ({
    ...r,
    key: lotKey(r.kode, r.lot),
    qty: num(r.qty),
  }));

  const disposals = (tables.pemusnahan || []).filter(hasIdentity).map((r) => ({
    ...r,
    key: lotKey(r.kode, r.lot),
    qty: num(r.qty),
  }));

  const cards = (tables.kartuStok || []).filter((r) => r.nama || r.instalasi).map((r) => ({
    ...r,
    key: lotKey('', r.lot),
    masuk: num(r.masuk),
    keluar: num(r.keluar),
    saldo: num(r.saldo),
  }));

  // Dokumen dicatat per lot: satu lot dianggap lengkap kalau ada satu baris
  // penerimaan yang membawa tautannya.
  const docsByKey = new Map();
  for (const r of receipts) {
    const prev = docsByKey.get(r.key) || { coa: null, msds: null, statusCoa: '', statusMsds: '' };
    if (!prev.coa && r.hasCoa) prev.coa = r.linkCoa;
    if (!prev.msds && r.hasMsds) prev.msds = r.linkMsds;
    prev.statusCoa = r.statusCoa || prev.statusCoa;
    prev.statusMsds = r.statusMsds || prev.statusMsds;
    docsByKey.set(r.key, prev);
  }

  const issuesByKey = groupBy(issues, (r) => r.key);
  const receiptsByKey = groupBy(receipts, (r) => r.key);
  const disposalsByKey = groupBy(disposals, (r) => r.key);

  const lots = (tables.master || []).filter(hasIdentity).map((r) => {
    const key = lotKey(r.kode, r.lot);
    const { bucket, days } = bucketFor(r.expDate, today, thresholds);

    const stokAwal = num(r.stokAwal);
    const pembelian = num(r.pembelian);
    const distribusi = num(r.distribusi);
    const pemusnahan = num(r.pemusnahan);
    const sisaStok = num(r.sisaStok);
    const stokMin = num(r.stokMin);
    const computedSisa = stokAwal + pembelian - distribusi - pemusnahan;

    const docs = docsByKey.get(key) || { coa: null, msds: null, statusCoa: '', statusMsds: '' };
    const status = (r.status || '').toUpperCase();
    const isExpired = bucket === BUCKET.EXPIRED;

    return {
      ...r,
      key,
      stokAwal,
      pembelian,
      distribusi,
      pemusnahan,
      sisaStok,
      stokMin,
      computedSisa,
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
