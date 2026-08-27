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

/** Sapaan mengikuti jam di perangkat pengguna, bukan `data.today` — itu tanggal
 * "per kapan" data dihitung, bukan jam pengguna melihatnya. */
function greeting(now = new Date()) {
  const h = now.getHours();
  if (h < 11) return 'Selamat pagi';
  if (h < 15) return 'Selamat siang';
  if (h < 19) return 'Selamat sore';
  return 'Selamat malam';
}

/** Maskot labu erlenmeyer kecil, khusus halaman Dashboard — lihat CLAUDE.md
 * "Yang belum dikerjakan" untuk batasannya (tidak pernah di halaman lain atau
 * saat dicetak). Warnanya semua token, jadi ikut berganti tema/palet. */
function mascotSvg() {
  return `
    <svg viewBox="0 0 64 64" width="40" height="40" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="mascotLiquid" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style="stop-color:var(--accent)"/>
          <stop offset="1" style="stop-color:var(--accent-strong)"/>
        </linearGradient>
        <clipPath id="mascotClip"><circle cx="32" cy="41" r="19"/></clipPath>
      </defs>
      <circle cx="32" cy="41" r="19" fill="var(--surface)" stroke="var(--border-strong)" stroke-width="2"/>
      <rect x="28" y="6" width="8" height="18" rx="2" fill="var(--surface)" stroke="var(--border-strong)" stroke-width="2"/>
      <g clip-path="url(#mascotClip)">
        <path d="M8 48 C15 44 21 51 28 47 C35 43 41 50 48 46 L48 66 L8 66 Z" fill="url(#mascotLiquid)"/>
      </g>
      <path d="M20 30 A14 14 0 0 1 28 24" stroke="var(--highlight)" stroke-width="2" fill="none" stroke-linecap="round"/>
      <circle cx="30" cy="10" r="1.3" fill="var(--accent)" opacity="0.5"/>
      <circle cx="35" cy="4.5" r="1" fill="var(--accent)" opacity="0.35"/>
      <circle cx="26" cy="36" r="2.1" fill="var(--ink)"/>
      <circle cx="38" cy="36" r="2.1" fill="var(--ink)"/>
      <ellipse cx="20.5" cy="38.5" rx="2.4" ry="1.5" fill="var(--accent)" opacity="0.35"/>
      <ellipse cx="43.5" cy="38.5" rx="2.4" ry="1.5" fill="var(--accent)" opacity="0.35"/>
      <path d="M27 41.5 Q32 45.5 37 41.5" stroke="var(--ink)" stroke-width="2" fill="none" stroke-linecap="round"/>
    </svg>
  `;
}

export function render({ data, summary }) {
  const { buckets, audit } = summary;

  const page = el('div.page');

  /* ------------------------------------------------------------ maskot */

  page.append(el('div.mascot-row.no-print', {},
    el('div.mascot-badge', { html: mascotSvg() }),
    el('div.mascot-greet', { text: `${greeting()}!` })));

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
