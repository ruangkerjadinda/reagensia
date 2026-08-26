import { el, kpi, sectionHead, cardHead, chip, barRow, fmtNum, fmtDate, notice, btn, empty } from '../ui/dom.js';
import { go } from '../ui/router.js';
import { expiryTimeline } from '../charts/timeline.js';
import { meter } from '../charts/meter.js';
import { byInstalasi, expiryTimeline as buildTimeline, activityFeed } from '../data/analytics.js';
import { BUCKET, BUCKET_META } from '../data/normalize.js';
import { openLotDrawer } from '../ui/shared.js';

export const meta = {
  title: 'Dashboard',
  subtitle: 'Ringkasan stok reagen hari ini',
  icon: 'dashboard',
};

export function render({ data, summary }) {
  const { buckets, audit } = summary;

  const page = el('div.page');

  /* --------------------------------------------------- baris peringatan */

  if (audit.expiredButActive.length) {
    page.append(notice({
      tone: 'danger',
      icon: 'alert',
      title: `${audit.expiredButActive.length} lot sudah kedaluwarsa tapi masih berstatus AKTIF`,
      body: 'Selama statusnya AKTIF, reagen ini masih terbaca sebagai boleh dipakai. Ubah statusnya atau catat pemusnahannya.',
      action: btn('Lihat daftarnya', {
        variant: 'danger',
        onclick: () => go('audit', { temuan: 'expired-aktif' }),
      }),
    }));
  }

  /* ------------------------------------------------------------- KPI */

  page.append(el('div.grid.grid--kpi', {},
    kpi({
      label: 'Lot terdaftar',
      value: fmtNum(summary.totalLots),
      note: `${fmtNum(summary.totalReagen)} jenis reagen`,
      onclick: () => go('inventori'),
    }),
    kpi({
      label: 'Total stok',
      value: fmtNum(summary.totalStok),
      note: `${fmtNum(summary.aktif)} lot berstatus aktif`,
      onclick: () => go('inventori'),
    }),
    kpi({
      label: 'Kedaluwarsa',
      value: fmtNum(buckets.EXPIRED.count),
      tone: buckets.EXPIRED.count ? 'danger' : undefined,
      note: `${fmtNum(buckets.EXPIRED.qty)} unit menunggu dimusnahkan`,
      onclick: () => go('kadaluarsa', { risiko: BUCKET.EXPIRED }),
    }),
    kpi({
      label: `Kritis ≤${data.thresholds.critical} hari`,
      value: fmtNum(buckets.CRITICAL.count),
      tone: buckets.CRITICAL.count ? 'warn' : 'ok',
      note: `${fmtNum(buckets.WARNING.count)} lagi dalam ${data.thresholds.warning} hari`,
      onclick: () => go('kadaluarsa', { risiko: BUCKET.CRITICAL }),
    }),
    kpi({
      label: 'Stok rendah',
      value: fmtNum(summary.atOrBelowMin),
      tone: summary.outOfStock ? 'danger' : summary.atOrBelowMin ? 'warn' : 'ok',
      note: summary.outOfStock ? `${fmtNum(summary.outOfStock)} di antaranya sudah habis` : 'tidak ada yang habis',
      onclick: () => go('stok'),
    }),
    kpi({
      label: 'Temuan data',
      value: fmtNum(audit.total),
      tone: audit.total ? 'warn' : 'ok',
      note: 'baris yang perlu dirapikan di sheet',
      onclick: () => go('audit'),
    })));

  /* -------------------------------------------------- kurva kedaluwarsa */

  const series = buildTimeline(data.lots, data.today, 12);
  page.append(el('section.card', {},
    cardHead('Kurva kedaluwarsa', 'Dua belas bulan ke depan, ditambah tunggakan yang sudah lewat',
      btn('Buka halaman kedaluwarsa', { variant: 'ghost', onclick: () => go('kadaluarsa') })),
    expiryTimeline(series, {
      onSelect: (d) => go('kadaluarsa', d.isBacklog ? { risiko: BUCKET.EXPIRED } : { bulan: d.key }),
    })));

  /* ------------------------------------- sebaran risiko + kepatuhan dokumen */

  const riskMax = Math.max(...Object.values(buckets).map((b) => b.count), 1);
  page.append(el('div.grid.grid--2', {},
    el('section.card', {},
      cardHead('Sebaran tingkat risiko', `${fmtNum(summary.totalLots)} lot`),
      el('div', {}, ...Object.keys(BUCKET_META).map((key) => barRow({
        label: BUCKET_META[key].label,
        chipEl: chip('', BUCKET_META[key].tone, BUCKET_META[key].label),
        value: buckets[key].count,
        valueLabel: `${fmtNum(buckets[key].count)} lot`,
        max: riskMax,
        onclick: () => go('inventori', { risiko: key }),
      })))),

    el('section.card', {},
      cardHead('Kelengkapan dokumen', `${fmtNum(summary.docs.total)} baris penerimaan`),
      el('div.grid.grid--kpi', { style: { gap: '12px' } },
        meter({
          label: 'COA tersedia',
          part: summary.docs.coaCount,
          whole: summary.docs.total,
          tone: summary.docs.coaPct >= 80 ? 'ok' : summary.docs.coaPct >= 50 ? 'warn' : 'danger',
          onclick: () => go('dokumen'),
        }),
        meter({
          label: 'MSDS tersedia',
          part: summary.docs.msdsCount,
          whole: summary.docs.total,
          tone: summary.docs.msdsPct >= 80 ? 'ok' : summary.docs.msdsPct >= 50 ? 'warn' : 'danger',
          onclick: () => go('dokumen'),
        })))));

  /* ------------------------------------------------------ per instalasi */

  const rollup = byInstalasi(data.lots);
  page.append(el('section.page-section', {},
    sectionHead('Per instalasi', `${rollup.length} instalasi terdaftar di Master Stok`),
    el('div.grid.grid--3', {}, ...rollup.map((row) => el('button.kpi', {
      type: 'button',
      onclick: () => go('inventori', { instalasi: row.instalasi }),
      title: `Buka inventori ${row.instalasi}`,
    },
    el('span.kpi-label', { text: row.instalasi }),
    el('span.kpi-value', {}, fmtNum(row.lots), el('small', { text: 'lot' })),
    el('div', { style: { display: 'flex', gap: '5px', flexWrap: 'wrap', marginTop: '6px' } },
      row.expired ? chip(`${row.expired} kedaluwarsa`, 'danger') : null,
      row.kritis ? chip(`${row.kritis} ≤${data.thresholds.critical} hari`, 'serious') : null,
      row.stokRendah ? chip(`${row.stokRendah} stok rendah`, 'warn') : null,
      row.temuan ? chip(`${row.temuan} temuan`, 'watch') : null,
      !row.expired && !row.kritis && !row.stokRendah && !row.temuan ? chip('Bersih', 'ok') : null),
    el('span.kpi-note', { text: `${fmtNum(row.stok)} unit · COA ${row.coaPct}%` }))))));

  /* ---------------------------------------------------- aktivitas terbaru */

  const feed = activityFeed(data, 12);
  page.append(el('section.card', {},
    cardHead('Aktivitas terbaru', 'Gabungan tab Penerimaan, Distribusi, dan Pemusnahan',
      btn('Semua transaksi', { variant: 'ghost', onclick: () => go('transaksi') })),
    feed.length
      ? el('div.timeline', {}, ...feed.map((item) => {
        const lot = data.lots.find((l) => l.key === item.row.key);
        return el('div.timeline-item', {
          dataset: { type: item.type },
          style: lot ? { cursor: 'pointer' } : {},
          onclick: lot ? () => openLotDrawer(lot) : undefined,
        },
        el('span.timeline-dot'),
        el('div', {},
          el('div', { text: `${item.label} · ${item.row.nama || item.row.kode} — ${fmtNum(item.row.qty)} ${item.row.unit || ''}`.trim() }),
          el('div.timeline-when', { text: `${fmtDate(item.date)} · ${item.row.instalasi || '—'}` })));
      }))
      : empty({ title: 'Belum ada aktivitas', body: 'Tab transaksi masih kosong atau tanggalnya belum diisi.' })));

  return page;
}
