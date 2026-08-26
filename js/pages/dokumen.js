import { el, cardHead, chip, barRow, fmtNum, fmtDate, btn } from '../ui/dom.js';
import { dataTable } from '../ui/table.js';
import { router, setParams } from '../ui/router.js';
import { meter } from '../charts/meter.js';
import { groupBy } from '../data/normalize.js';
import { filterBar, applyFilters, openLotDrawer } from '../ui/shared.js';

export const meta = {
  title: 'COA & MSDS',
  subtitle: 'Kelengkapan dokumen mutu dan keselamatan',
  icon: '▣',
};

export function render({ data, summary }) {
  const params = router.params;
  const lots = applyFilters(data.lots, params);
  const page = el('div.page');

  page.append(filterBar({
    lots: data.lots,
    fields: ['instalasi', 'supplier', 'kategori'],
    placeholder: 'Cari reagen atau lot…',
    extra: [
      el('div.seg', {},
        el('button', {
          type: 'button', text: 'Semua lot', 'aria-pressed': String(!params.dok),
          onclick: () => setParams({ dok: '' }),
        }),
        el('button', {
          type: 'button', text: 'Belum lengkap', 'aria-pressed': String(params.dok === 'kurang'),
          onclick: () => setParams({ dok: 'kurang' }),
        })),
    ],
  }));

  /* --------------------------------------------------- kepatuhan umum */

  page.append(el('div.grid.grid--kpi', {},
    meter({
      label: 'COA — baris penerimaan',
      part: summary.docs.coaCount,
      whole: summary.docs.total,
      tone: summary.docs.coaPct >= 80 ? 'ok' : summary.docs.coaPct >= 50 ? 'warn' : 'danger',
    }),
    meter({
      label: 'MSDS — baris penerimaan',
      part: summary.docs.msdsCount,
      whole: summary.docs.total,
      tone: summary.docs.msdsPct >= 80 ? 'ok' : summary.docs.msdsPct >= 50 ? 'warn' : 'danger',
    }),
    meter({
      label: 'COA — lot di Master Stok',
      part: lots.filter((l) => l.hasCoa).length,
      whole: lots.length,
      tone: 'info',
    }),
    meter({
      label: 'Lengkap keduanya',
      part: lots.filter((l) => l.hasCoa && l.hasMsds).length,
      whole: lots.length,
      tone: 'info',
    })));

  /* ----------------------------------------- kepatuhan per dimensi */

  page.append(el('div.grid.grid--2', {},
    complianceCard('Per instalasi', groupBy(lots, (l) => l.instalasi || '(kosong)'), 'instalasi'),
    complianceCard('Per supplier', groupBy(lots, (l) => l.supplier || '(kosong)'), 'supplier')));

  /* -------------------------------------------------------- daftar */

  const rows = params.dok === 'kurang' ? lots.filter((l) => !l.hasCoa || !l.hasMsds) : lots;

  page.append(el('section.card.card--flush', {},
    cardHead(params.dok === 'kurang' ? 'Dokumen yang belum lengkap' : 'Indeks dokumen',
      `${fmtNum(rows.length)} lot`),
    dataTable({
      csvName: 'dokumen',
      maxHeight: '60vh',
      sort: { key: 'nama', dir: 1 },
      rows,
      onRowClick: openLotDrawer,
      columns: [
        {
          key: 'nama',
          label: 'Reagen',
          className: 'wrap strong',
          render: (l) => el('div', {}, l.nama || '—', el('span.sub', { text: `${l.kode} · ${l.lot || 'tanpa lot'}` })),
          csv: (l) => l.nama,
        },
        { key: 'instalasi', label: 'Instalasi' },
        { key: 'supplier', label: 'Supplier', className: 'wrap' },
        { key: 'merk', label: 'Merk' },
        {
          key: 'hasCoa',
          label: 'COA',
          render: (l) => (l.coaUrl
            ? el('a.btn.btn--sm', { href: l.coaUrl, target: '_blank', rel: 'noopener', text: '↗ Buka', onclick: (e) => e.stopPropagation() })
            : chip('Belum ada', 'muted')),
          csv: (l) => (l.coaUrl || 'tidak ada'),
        },
        {
          key: 'hasMsds',
          label: 'MSDS',
          render: (l) => (l.msdsUrl
            ? el('a.btn.btn--sm', { href: l.msdsUrl, target: '_blank', rel: 'noopener', text: '↗ Buka', onclick: (e) => e.stopPropagation() })
            : chip('Belum ada', 'muted')),
          csv: (l) => (l.msdsUrl || 'tidak ada'),
        },
        {
          key: 'expDate',
          label: 'Kedaluwarsa',
          render: (l) => (l.expDate ? fmtDate(l.expDate) : '—'),
          csv: (l) => (l.expDate ? fmtDate(l.expDate) : ''),
        },
        { key: '_row', label: 'Baris', align: 'num' },
      ],
      emptyState: {
        glyph: '✓',
        title: 'Semua dokumen lengkap',
        body: 'Setiap lot pada filter ini punya tautan COA dan MSDS.',
      },
    })));

  return page;
}

function complianceCard(title, groups, paramKey) {
  const rows = [...groups.entries()]
    .map(([label, members]) => ({
      label,
      total: members.length,
      lengkap: members.filter((m) => m.hasCoa && m.hasMsds).length,
      pct: members.length ? Math.round((members.filter((m) => m.hasCoa && m.hasMsds).length / members.length) * 100) : 0,
    }))
    .sort((a, b) => a.pct - b.pct);

  return el('section.card', {},
    cardHead(title, 'Persentase lot yang punya COA dan MSDS sekaligus'),
    el('div', {}, ...rows.map((r) => barRow({
      label: r.label,
      value: r.pct,
      valueLabel: `${r.pct}% · ${fmtNum(r.lengkap)}/${fmtNum(r.total)}`,
      max: 100,
      color: r.pct >= 80 ? 'var(--good)' : r.pct >= 50 ? 'var(--warning)' : 'var(--critical)',
      onclick: r.label === '(kosong)' ? undefined : () => setParams({ [paramKey]: r.label }),
    }))));
}
