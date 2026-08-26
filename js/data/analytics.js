/**
 * Agregasi di atas record kanonis: ringkasan KPI, kurva kedaluwarsa, laju pakai,
 * kepatuhan dokumen, dan daftar temuan untuk halaman Audit Data.
 *
 * Semua fungsi di sini murni — masukan record, keluaran angka. Tidak ada
 * penyentuhan DOM supaya bisa diuji langsung lewat tools/verify-data.mjs.
 */

import { BUCKET, BUCKET_META, groupBy, daysBetween } from './normalize.js';

const sum = (items, pick) => items.reduce((acc, x) => acc + (pick(x) || 0), 0);
const pct = (part, whole) => (whole ? Math.round((part / whole) * 1000) / 10 : 0);
const uniqSorted = (items, pick) => [...new Set(items.map(pick).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'id'));

/** Ringkasan menyeluruh — dipakai dashboard, halaman audit, dan skrip verifikasi. */
export function summarize(data) {
  const { lots, receipts, issues, disposals, orphans } = data;

  const buckets = {};
  for (const key of Object.values(BUCKET)) {
    const members = lots.filter((l) => l.bucket === key);
    buckets[key] = { count: members.length, qty: sum(members, (l) => l.sisaStok), lots: members };
  }

  const audit = {
    expiredButActive: lots.filter((l) => l.expiredButActive),
    validButInactive: lots.filter((l) => l.validButInactive),
    sisaMismatch: lots.filter((l) => l.sisaMismatch),
    missingExpiry: lots.filter((l) => l.missingExpiry),
    missingSupplier: lots.filter((l) => l.missingSupplier),
    missingLot: lots.filter((l) => l.missingLot),
    orphans,
  };
  audit.duplicates = nearDuplicates(lots);
  // Satu baris bisa kena beberapa temuan sekaligus, jadi yang dihitung adalah
  // jumlah baris berbeda yang perlu disentuh — bukan jumlah temuan.
  const touched = new Set();
  for (const key of ['expiredButActive', 'validButInactive', 'sisaMismatch', 'missingExpiry', 'missingSupplier', 'missingLot']) {
    for (const lot of audit[key]) touched.add(lot._row);
  }
  audit.total = touched.size + orphans.length;

  const coaCount = receipts.filter((r) => r.hasCoa).length;
  const msdsCount = receipts.filter((r) => r.hasMsds).length;

  const totals = {
    penerimaanQty: sum(receipts, (r) => r.qty),
    distribusiQty: sum(issues, (r) => r.qty),
    pemusnahanQty: sum(disposals, (r) => r.qty),
    masterMasuk: sum(lots, (l) => l.stokAwal) + sum(lots, (l) => l.pembelian),
    masterStokAwal: sum(lots, (l) => l.stokAwal),
    masterPembelian: sum(lots, (l) => l.pembelian),
    masterDistribusi: sum(lots, (l) => l.distribusi),
    masterPemusnahan: sum(lots, (l) => l.pemusnahan),
  };

  // Di workbook ini setiap baris Penerimaan tercatat di kolom Stok Awal, jadi
  // sisi Master dari rekonsiliasi adalah Stok Awal + Pembelian, bukan Pembelian
  // saja. Selisih di sini berarti ada qty yang dihitung dua kali atau terlewat.
  const reconciliation = [
    recon('Penerimaan → Stok Awal + Pembelian', totals.penerimaanQty, totals.masterMasuk),
    recon('Distribusi → kolom Distribusi', totals.distribusiQty, totals.masterDistribusi),
    recon('Pemusnahan → kolom Pemusnahan', totals.pemusnahanQty, totals.masterPemusnahan),
  ];

  return {
    totalLots: lots.length,
    totalReagen: new Set(lots.map((l) => l.kode)).size,
    totalStok: sum(lots, (l) => l.sisaStok),
    instalasiList: uniqSorted(lots, (l) => l.instalasi),
    aktif: lots.filter((l) => l.status === 'AKTIF').length,
    tidakAktif: lots.filter((l) => l.status === 'TIDAK AKTIF').length,
    atOrBelowMin: lots.filter((l) => l.atOrBelowMin).length,
    outOfStock: lots.filter((l) => l.isOutOfStock).length,
    buckets,
    audit,
    totals,
    reconciliation,
    docs: {
      total: receipts.length,
      coaCount,
      msdsCount,
      coaPct: pct(coaCount, receipts.length),
      msdsPct: pct(msdsCount, receipts.length),
    },
  };
}

/**
 * Nilai teks yang sebenarnya sama tapi ditulis berbeda — spasi ganda, beda
 * huruf besar-kecil, titik yang hilang.
 *
 * Ini bukan kesalahan yang terlihat saat menggulir sheet, tapi akibatnya nyata:
 * satu supplier terpecah jadi dua baris di setiap pengelompokan dan penyaringan.
 */
export function nearDuplicates(lots) {
  const fields = [
    { key: 'supplier', label: 'Supplier' },
    { key: 'merk', label: 'Merk' },
    { key: 'nama', label: 'Nama reagen' },
    { key: 'instalasi', label: 'Instalasi' },
  ];

  const out = [];
  for (const field of fields) {
    const byNormal = new Map();
    for (const lot of lots) {
      const raw = lot[field.key];
      if (!raw) continue;
      const norm = String(raw).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
      if (!norm) continue;
      if (!byNormal.has(norm)) byNormal.set(norm, new Map());
      const variants = byNormal.get(norm);
      if (!variants.has(raw)) variants.set(raw, []);
      variants.get(raw).push(lot);
    }

    for (const [, variants] of byNormal) {
      if (variants.size < 2) continue;
      out.push({
        field: field.key,
        fieldLabel: field.label,
        variants: [...variants.entries()]
          .map(([value, members]) => ({ value, count: members.length, rows: members.map((m) => m._row) }))
          .sort((a, b) => b.count - a.count),
      });
    }
  }
  return out;
}

function recon(label, transaksi, master) {
  return { label, transaksi, master, ok: Math.abs(transaksi - master) < 1e-9 };
}

/** Rollup per instalasi untuk kartu skor di dashboard. */
export function byInstalasi(lots) {
  const groups = groupBy(lots, (l) => l.instalasi || '(tanpa instalasi)');
  return [...groups.entries()]
    .map(([instalasi, members]) => ({
      instalasi,
      lots: members.length,
      stok: sum(members, (l) => l.sisaStok),
      expired: members.filter((l) => l.bucket === BUCKET.EXPIRED).length,
      kritis: members.filter((l) => l.bucket === BUCKET.CRITICAL).length,
      peringatan: members.filter((l) => l.bucket === BUCKET.WARNING).length,
      stokRendah: members.filter((l) => l.atOrBelowMin).length,
      temuan: members.filter((l) => l.expiredButActive || l.sisaMismatch || l.missingExpiry).length,
      coaPct: pct(members.filter((l) => l.hasCoa).length, members.length),
      members,
    }))
    .sort((a, b) => b.lots - a.lots);
}

/**
 * Sebaran kedaluwarsa per bulan untuk `months` bulan ke depan, ditambah satu
 * kolom tunggakan berisi semua lot yang sudah lewat tanggal.
 */
export function expiryTimeline(lots, today, months = 12) {
  const key = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  const series = [];

  const expired = lots.filter((l) => l.bucket === BUCKET.EXPIRED);
  series.push({
    key: 'expired',
    label: 'Tunggakan',
    sublabel: 'sudah lewat',
    count: expired.length,
    qty: sum(expired, (l) => l.sisaStok),
    isBacklog: true,
    lots: expired,
  });

  for (let i = 0; i < months; i += 1) {
    const d = new Date(today.getFullYear(), today.getMonth() + i, 1);
    const k = key(d);
    const members = lots.filter((l) => l.expDate && !l.isExpired && key(l.expDate) === k);
    series.push({
      key: k,
      label: d.toLocaleDateString('id-ID', { month: 'short' }),
      sublabel: String(d.getFullYear()).slice(2),
      count: members.length,
      qty: sum(members, (l) => l.sisaStok),
      isBacklog: false,
      lots: members,
    });
  }

  return series;
}

/**
 * Laju pakai per lot dari riwayat distribusi, dan berapa bulan stok tersisa
 * masih menutupi laju itu.
 *
 * Riwayat distribusi di workbook ini pendek, jadi laju dihitung atas rentang
 * sejak pengeluaran pertama, bukan jendela tetap — itu jauh lebih jujur untuk
 * data beberapa bulan daripada memaksakan rata-rata 12 bulan.
 */
export function consumption(lots, issues, today) {
  const byKey = groupBy(issues, (r) => r.key);
  const rows = [];

  for (const lot of lots) {
    const history = byKey.get(lot.key) || [];
    const keluar = sum(history, (r) => r.qty);
    const dates = history.map((r) => r.tanggal).filter(Boolean).sort((a, b) => a - b);
    const spanDays = dates.length ? Math.max(daysBetween(dates[0], today), 30) : 0;
    const perMonth = keluar > 0 && spanDays > 0 ? (keluar / spanDays) * 30.44 : 0;
    const cover = perMonth > 0 ? lot.sisaStok / perMonth : null;

    rows.push({
      lot,
      keluar,
      transaksi: history.length,
      perMonth: Math.round(perMonth * 100) / 100,
      monthsOfCover: cover == null ? null : Math.round(cover * 10) / 10,
      lastIssue: dates.length ? dates[dates.length - 1] : null,
      /** Tidak pernah keluar sejak dicatat — kandidat stok mati. */
      dormant: history.length === 0,
    });
  }

  return rows;
}

/** Pareto: kelompokkan lot menurut satu dimensi, urut dari kontribusi terbesar. */
export function pareto(lots, pick, { limit = 10 } = {}) {
  const groups = groupBy(lots, (l) => pick(l) || '(kosong)');
  const rows = [...groups.entries()]
    .map(([label, members]) => ({
      label,
      lots: members.length,
      stok: sum(members, (l) => l.sisaStok),
      expired: members.filter((l) => l.isExpired).length,
    }))
    .sort((a, b) => b.lots - a.lots);

  const head = rows.slice(0, limit);
  const tail = rows.slice(limit);
  if (tail.length) {
    head.push({
      label: `Lainnya (${tail.length})`,
      lots: sum(tail, (r) => r.lots),
      stok: sum(tail, (r) => r.stok),
      expired: sum(tail, (r) => r.expired),
      isTail: true,
    });
  }
  return head;
}

/** Aliran aktivitas gabungan dari ketiga tab transaksi, terbaru di atas. */
export function activityFeed(data, limit = 25) {
  const items = [
    ...data.receipts.map((r) => ({ type: 'penerimaan', label: 'Penerimaan', date: r.tanggal, row: r })),
    ...data.issues.map((r) => ({ type: 'distribusi', label: 'Distribusi', date: r.tanggal, row: r })),
    ...data.disposals.map((r) => ({ type: 'pemusnahan', label: 'Pemusnahan', date: r.tanggal, row: r })),
  ].filter((x) => x.date);

  items.sort((a, b) => b.date - a.date);
  return items.slice(0, limit);
}

/**
 * Daftar tindakan berprioritas — inti halaman Alert.
 *
 * Urutan sengaja mengikuti konsekuensi, bukan jumlah: reagen kedaluwarsa yang
 * masih ditandai AKTIF bisa terpakai pada pasien, jadi ia di atas segalanya.
 */
export function buildAlerts(data) {
  const { lots } = data;
  const alerts = [];

  const push = (severity, kind, title, why, members) => {
    if (!members.length) return;
    alerts.push({ severity, kind, title, why, members, count: members.length });
  };

  push('critical', 'expired-active',
    'Kedaluwarsa tapi masih berstatus AKTIF',
    'Reagen ini bisa terpakai padahal sudah lewat tanggal. Ubah Status ke TIDAK AKTIF atau musnahkan.',
    lots.filter((l) => l.expiredButActive));

  push('critical', 'out-of-stock',
    'Stok habis',
    'Sisa stok nol. Pemeriksaan yang bergantung pada reagen ini akan berhenti.',
    lots.filter((l) => l.isOutOfStock));

  push('critical', 'expiring-30',
    `Kedaluwarsa dalam ${data.thresholds.critical} hari`,
    'Segera pakai lebih dulu atau jadwalkan penggantian.',
    lots.filter((l) => l.bucket === BUCKET.CRITICAL));

  push('high', 'expired-backlog',
    'Tunggakan pemusnahan',
    'Lot yang sudah kedaluwarsa dan belum tercatat dimusnahkan.',
    lots.filter((l) => l.bucket === BUCKET.EXPIRED));

  push('high', 'low-stock',
    'Stok di bawah atau sama dengan minimum',
    'Ajukan pengadaan sebelum stok benar-benar habis.',
    lots.filter((l) => l.isLowStock));

  push('medium', 'expiring-90',
    `Kedaluwarsa dalam ${data.thresholds.warning} hari`,
    'Masukkan ke rencana pemakaian kuartal ini.',
    lots.filter((l) => l.bucket === BUCKET.WARNING));

  push('medium', 'sisa-mismatch',
    'Sisa Stok tidak cocok dengan hitungan',
    'Sisa Stok berbeda dari Stok Awal + Pembelian − Distribusi − Pemusnahan. Angka di sheet ditulis manual.',
    lots.filter((l) => l.sisaMismatch));

  push('medium', 'no-expiry',
    'Tanpa tanggal kedaluwarsa',
    'Tidak bisa dipantau risikonya sampai tanggalnya diisi.',
    lots.filter((l) => l.missingExpiry));

  push('low', 'no-coa',
    'Tanpa dokumen COA',
    'Kelengkapan dokumen dibutuhkan saat penilaian akreditasi.',
    lots.filter((l) => !l.hasCoa));

  push('low', 'no-msds',
    'Tanpa dokumen MSDS',
    'Lembar keselamatan wajib tersedia di tempat penyimpanan.',
    lots.filter((l) => !l.hasMsds));

  return alerts;
}

export const SEVERITY_META = {
  critical: { label: 'Kritis', tone: 'danger', order: 0 },
  high: { label: 'Tinggi', tone: 'warn', order: 1 },
  medium: { label: 'Sedang', tone: 'watch', order: 2 },
  low: { label: 'Rendah', tone: 'muted', order: 3 },
};

export { BUCKET, BUCKET_META, pct, sum };
