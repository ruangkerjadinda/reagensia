import { el, cardHead, chip, fmtNum, fmtDate, fmtDays } from '../ui/dom.js';
import { dataTable } from '../ui/table.js';
import { router, setParams } from '../ui/router.js';
import { filterBar, applyFilters, bucketChip, statusChip, openLotDrawer } from '../ui/shared.js';
import { groupBy } from '../data/normalize.js';

export const meta = {
  title: 'Inventori',
  subtitle: 'Seluruh lot di Master Stok',
  icon: 'inventori',
};

export function render({ data }) {
  const params = router.params;
  const lots = applyFilters(data.lots, params);
  const grouped = params.tampilan === 'reagen';

  const page = el('div.page');

  page.append(filterBar({
    lots: data.lots,
    fields: ['instalasi', 'kategori', 'status', 'risiko', 'lokasi'],
    extra: [
      el('div.seg', {},
        el('button', {
          type: 'button', text: 'Per lot', 'aria-pressed': String(!grouped),
          onclick: () => setParams({ tampilan: '' }),
        }),
        el('button', {
          type: 'button', text: 'Per reagen', 'aria-pressed': String(grouped),
          onclick: () => setParams({ tampilan: 'reagen' }),
        })),
    ],
  }));

  const totalStok = lots.reduce((a, l) => a + l.sisaStok, 0);
  page.append(el('div.grid.grid--kpi', {},
    stat('Lot tampil', fmtNum(lots.length), `dari ${fmtNum(data.lots.length)} lot`),
    stat('Jenis reagen', fmtNum(new Set(lots.map((l) => l.kode)).size), 'kode unik'),
    stat('Total stok', fmtNum(totalStok), 'unit'),
    stat('Perlu perhatian', fmtNum(lots.filter((l) => l.isExpired || l.atOrBelowMin).length), 'kedaluwarsa atau stok rendah')));

  page.append(el('section.card.card--flush', {},
    cardHead(grouped ? 'Ringkasan per reagen' : 'Daftar lot',
      grouped ? 'Satu baris per kode reagen, semua lot digabung' : 'Satu baris per lot, sesuai Master Stok'),
    grouped ? groupedTable(lots) : lotTable(lots)));

  return page;
}

function stat(label, value, note) {
  return el('div.kpi', {},
    el('span.kpi-label', { text: label }),
    el('span.kpi-value', { text: value }),
    el('span.kpi-note', { text: note }));
}

function lotTable(lots) {
  return dataTable({
    csvName: 'inventori-lot',
    maxHeight: '64vh',
    sort: { key: 'expDate', dir: 1 },
    rows: lots,
    onRowClick: openLotDrawer,
    columns: [
      {
        key: 'nama',
        label: 'Reagen',
        className: 'wrap strong',
        render: (l) => el('div', {},
          l.nama || '—',
          el('span.sub', { text: `${l.kode} · ${l.lot || 'tanpa lot'}` })),
        csv: (l) => l.nama,
      },
      { key: 'instalasi', label: 'Instalasi' },
      {
        key: 'expDate',
        label: 'Kedaluwarsa',
        render: (l) => el('div', {},
          l.expDate ? fmtDate(l.expDate) : '—',
          el('span.sub', { text: l.expDate ? fmtDays(l.daysToExpiry) : 'belum diisi' })),
        csv: (l) => (l.expDate ? fmtDate(l.expDate) : ''),
      },
      { key: 'bucket', label: 'Risiko', render: bucketChip, csv: (l) => l.bucket },
      {
        key: 'sisaStok',
        label: 'Sisa',
        align: 'num',
        render: (l) => el('div', {},
          fmtNum(l.sisaStok),
          el('span.sub', { text: `min ${fmtNum(l.stokMin)} ${l.unit || ''}`.trim() })),
        csv: (l) => l.sisaStok,
      },
      { key: 'status', label: 'Status', render: statusChip, csv: (l) => l.status },
      { key: 'merk', label: 'Merk' },
      { key: 'supplier', label: 'Supplier', className: 'wrap' },
      { key: 'lokasi', label: 'Suhu' },
      {
        key: 'dokumen',
        label: 'Dokumen',
        sortable: false,
        render: (l) => el('div', { style: { display: 'flex', gap: '4px' } },
          chip('COA', l.hasCoa ? 'ok' : 'muted'),
          chip('MSDS', l.hasMsds ? 'ok' : 'muted')),
        csv: (l) => `${l.hasCoa ? 'COA' : ''} ${l.hasMsds ? 'MSDS' : ''}`.trim(),
      },
      { key: '_row', label: 'Baris', align: 'num', title: 'Nomor baris di tab Master Stok' },
    ],
    emptyState: {
      title: 'Tidak ada lot yang cocok',
      body: 'Longgarkan filter atau bersihkan kata kunci pencarian.',
    },
  });
}

/** Tampilan per reagen: satu baris per kode, dengan lot paling cepat kedaluwarsa. */
function groupedTable(lots) {
  const groups = groupBy(lots, (l) => l.kode);
  const rows = [...groups.entries()].map(([kode, members]) => {
    const dated = members.filter((m) => m.expDate).sort((a, b) => a.expDate - b.expDate);
    const soonest = dated[0] || null;
    return {
      kode,
      nama: members[0].nama,
      instalasi: [...new Set(members.map((m) => m.instalasi))].join(', '),
      unit: members[0].unit,
      lotCount: members.length,
      stok: members.reduce((a, m) => a + m.sisaStok, 0),
      stokMin: Math.max(...members.map((m) => m.stokMin)),
      expired: members.filter((m) => m.isExpired).length,
      soonest,
      members,
    };
  });

  return dataTable({
    csvName: 'inventori-reagen',
    maxHeight: '64vh',
    sort: { key: 'stok', dir: 1 },
    rows,
    onRowClick: (row) => openLotDrawer(row.soonest || row.members[0]),
    columns: [
      {
        key: 'nama',
        label: 'Reagen',
        className: 'wrap strong',
        render: (r) => el('div', {}, r.nama || '—', el('span.sub', { text: r.kode })),
      },
      { key: 'instalasi', label: 'Instalasi', className: 'wrap' },
      { key: 'lotCount', label: 'Jumlah lot', align: 'num' },
      {
        key: 'stok',
        label: 'Total stok',
        align: 'num',
        render: (r) => el('div', {}, fmtNum(r.stok), el('span.sub', { text: `min ${fmtNum(r.stokMin)} ${r.unit || ''}`.trim() })),
      },
      {
        key: 'expired',
        label: 'Kedaluwarsa',
        align: 'num',
        render: (r) => (r.expired ? chip(`${r.expired} lot`, 'danger') : el('span', { text: '—', style: { color: 'var(--ink-muted)' } })),
      },
      {
        key: 'soonest',
        label: 'Paling cepat habis masa',
        get: (r) => (r.soonest ? r.soonest.expDate : null),
        render: (r) => (r.soonest
          ? el('div', {}, fmtDate(r.soonest.expDate), el('span.sub', { text: fmtDays(r.soonest.daysToExpiry) }))
          : '—'),
      },
    ],
    emptyState: { title: 'Tidak ada reagen yang cocok', body: 'Longgarkan filter yang aktif.' },
  });
}
