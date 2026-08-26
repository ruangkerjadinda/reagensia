import { el, cardHead, chip, fmtNum, fmtDate, btn, notice, empty } from '../ui/dom.js';
import { dataTable } from '../ui/table.js';
import { router, setParams, go } from '../ui/router.js';
import { CONFIG, canWrite } from '../config.js';
import { openTransactionForm } from './transaksi-form.js';
import { openLotDrawer } from '../ui/shared.js';

export const meta = {
  title: 'Transaksi',
  subtitle: 'Penerimaan, distribusi, dan pemusnahan',
  icon: '⇄',
};

const TABS = [
  { key: 'penerimaan', label: 'Penerimaan', tab: 'penerimaan' },
  { key: 'distribusi', label: 'Distribusi', tab: 'distribusi' },
  { key: 'pemusnahan', label: 'Pemusnahan', tab: 'pemusnahan' },
];

export function render({ data }) {
  const active = TABS.find((t) => t.key === router.params.tab) || TABS[0];
  const page = el('div.page');

  const rows = { penerimaan: data.receipts, distribusi: data.issues, pemusnahan: data.disposals }[active.key];

  page.append(el('div.toolbar.no-print', {},
    el('div.seg', {}, ...TABS.map((t) => el('button', {
      type: 'button',
      text: `${t.label} (${fmtNum({ penerimaan: data.receipts, distribusi: data.issues, pemusnahan: data.disposals }[t.key].length)})`,
      'aria-pressed': String(t.key === active.key),
      onclick: () => setParams({ tab: t.key === 'penerimaan' ? '' : t.key }),
    }))),
    el('span.spacer'),
    canWrite()
      ? btn(`+ Tambah ${active.label.toLowerCase()}`, {
        variant: 'primary',
        onclick: () => openTransactionForm(active.key, { data }),
      })
      : null));

  if (!canWrite()) page.append(writeSetupNotice());

  page.append(el('section.card.card--flush', {},
    cardHead(active.label, `${fmtNum(rows.length)} baris di tab "${active.label}"`),
    rows.length ? tableFor(active.key, rows, data) : emptyFor(active.key)));

  return page;
}

/**
 * Kartu penyiapan mode input.
 *
 * Ditulis apa adanya: dashboard ini tidak bisa memasang Apps Script sendiri,
 * dan itu memang bukan sesuatu yang boleh terjadi tanpa sepengetahuan pemilik
 * spreadsheet.
 */
function writeSetupNotice() {
  const configured = Boolean(CONFIG.endpoint.url);
  return notice({
    tone: 'info',
    glyph: 'ℹ',
    title: configured ? 'Mode input belum dinyalakan' : 'Mode input belum disiapkan',
    body: configured
      ? 'Endpoint sudah terisi, tapi mode input masih dimatikan. Nyalakan di halaman Pengaturan kalau memang siap menulis ke spreadsheet.'
      : 'Untuk menambah baris dari dashboard, sebuah Web App Apps Script harus dipasang di spreadsheet ini oleh pemiliknya. Kodenya sudah tersedia di apps-script/Code.gs beserta panduan langkahnya di apps-script/DEPLOY.md. Selama belum dipasang, semua halaman lain tetap berjalan penuh dalam mode baca.',
    action: btn('Buka Pengaturan', { onclick: () => go('pengaturan') }),
  });
}

function emptyFor(kind) {
  const copy = {
    penerimaan: { title: 'Belum ada penerimaan tercatat', body: 'Tab Penerimaan di spreadsheet masih kosong.' },
    distribusi: { title: 'Belum ada distribusi tercatat', body: 'Tab Distribusi di spreadsheet masih kosong.' },
    pemusnahan: {
      title: 'Belum ada pemusnahan tercatat',
      body: 'Tab Pemusnahan hanya berisi baris judul. Selama pemusnahan belum dicatat di sini, reagen yang sudah kedaluwarsa tetap terhitung sebagai sisa stok di Master Stok.',
    },
  }[kind];
  return empty(copy);
}

function lotColumn(data) {
  return {
    key: 'nama',
    label: 'Reagen',
    className: 'wrap strong',
    render: (r) => el('div', {}, r.nama || '—', el('span.sub', { text: `${r.kode} · ${r.lot || 'tanpa lot'}` })),
    csv: (r) => r.nama,
  };
}

function openRow(data) {
  return (row) => {
    const lot = data.lots.find((l) => l.key === row.key);
    if (lot) openLotDrawer(lot);
  };
}

function tableFor(kind, rows, data) {
  const common = [
    { key: 'tanggal', label: 'Tanggal', render: (r) => (r.tanggal ? fmtDate(r.tanggal) : '—'), csv: (r) => (r.tanggal ? fmtDate(r.tanggal) : '') },
    { key: 'instalasi', label: 'Instalasi' },
    lotColumn(data),
  ];
  const tail = [
    { key: 'merk', label: 'Merk' },
    { key: 'kategori', label: 'Kategori' },
    { key: '_row', label: 'Baris', align: 'num' },
  ];

  const columns = {
    penerimaan: [
      ...common,
      { key: 'qty', label: 'Qty', align: 'num', render: (r) => `${fmtNum(r.qty)} ${r.unit || ''}`.trim() },
      {
        key: 'dok',
        label: 'Dokumen',
        sortable: false,
        render: (r) => el('div', { style: { display: 'flex', gap: '4px' } },
          r.hasCoa
            ? el('a.btn.btn--sm', { href: r.linkCoa, target: '_blank', rel: 'noopener', text: 'COA', onclick: (e) => e.stopPropagation() })
            : chip('COA', 'muted'),
          r.hasMsds
            ? el('a.btn.btn--sm', { href: r.linkMsds, target: '_blank', rel: 'noopener', text: 'MSDS', onclick: (e) => e.stopPropagation() })
            : chip('MSDS', 'muted')),
        csv: (r) => `${r.hasCoa ? 'COA' : ''} ${r.hasMsds ? 'MSDS' : ''}`.trim(),
      },
      { key: 'ket', label: 'Keterangan', className: 'wrap' },
      { key: 'pic', label: 'PIC' },
      ...tail,
    ],
    distribusi: [
      ...common,
      { key: 'qty', label: 'Qty keluar', align: 'num', render: (r) => `${fmtNum(r.qty)} ${r.unit || ''}`.trim() },
      { key: 'periodePakai', label: 'Periode pakai' },
      { key: 'picPenerima', label: 'Penerima' },
      { key: 'picPengirim', label: 'Pengirim' },
      ...tail,
    ],
    pemusnahan: [
      ...common,
      { key: 'qty', label: 'Qty', align: 'num', render: (r) => `${fmtNum(r.qty)} ${r.unit || ''}`.trim() },
      { key: 'alasan', label: 'Alasan', className: 'wrap' },
      { key: 'metode', label: 'Metode' },
      { key: 'pic', label: 'PIC' },
      ...tail,
    ],
  }[kind];

  return dataTable({
    csvName: kind,
    maxHeight: '64vh',
    sort: { key: 'tanggal', dir: -1 },
    rows,
    columns,
    onRowClick: openRow(data),
    rowDataset: (r) => (r._optimistic ? { optimistic: 'true' } : {}),
  });
}
