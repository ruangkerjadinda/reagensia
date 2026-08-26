/**
 * Potongan yang dipakai bersama beberapa halaman: chip risiko, bilah filter
 * yang terikat ke URL, dan laci detail lot.
 */

import { el, chip, fmtDate, fmtDays, fmtNum, btn, empty } from './dom.js';
import { icon } from './icons.js';
import { drawer } from './overlay.js';
import { router, setParams } from './router.js';
import { BUCKET_META } from '../data/normalize.js';
import { sheetUrl } from '../config.js';

export function bucketChip(lot) {
  const meta = BUCKET_META[lot.bucket];
  const detail = lot.expDate ? `${fmtDate(lot.expDate)} · ${fmtDays(lot.daysToExpiry)}` : 'Tanggal kedaluwarsa belum diisi';
  return chip(meta.short, meta.tone, `${meta.label} — ${detail}`);
}

export function statusChip(lot) {
  if (lot.status === 'AKTIF') return chip('Aktif', lot.expiredButActive ? 'danger' : 'ok');
  if (lot.status === 'TIDAK AKTIF') return chip('Tidak aktif', 'muted');
  return chip('Tanpa status', 'muted');
}

export function stockChip(lot) {
  if (lot.isOutOfStock) return chip('Habis', 'danger');
  if (lot.isLowStock) return chip('Stok rendah', 'warn');
  return null;
}

export function sheetLinkBtn(tabKey, row, label = 'Buka di Sheets') {
  return el('a.btn.btn--sm.btn--ghost.no-print', {
    href: sheetUrl(tabKey, row),
    target: '_blank',
    rel: 'noopener',
    title: `Buka baris ${row} tab ini di Google Sheets`,
  }, icon('keluar', { size: 14 }), el('span', { text: label }));
}

/* ------------------------------------------------------------------ filter */

/** Nilai filter tinggal di URL, jadi setiap tampilan bisa ditautkan dan dibagikan. */
export const FILTER_KEYS = ['q', 'instalasi', 'kategori', 'status', 'risiko', 'lokasi', 'supplier', 'merk', 'pic'];

export function applyFilters(lots, params) {
  const q = (params.q || '').toLowerCase().trim();
  const terms = q ? q.split(/\s+/) : [];

  return lots.filter((lot) => {
    if (params.instalasi && lot.instalasi !== params.instalasi) return false;
    if (params.kategori && lot.kategori !== params.kategori) return false;
    if (params.status && lot.status !== params.status) return false;
    if (params.risiko && lot.bucket !== params.risiko) return false;
    if (params.lokasi && lot.lokasi !== params.lokasi) return false;
    if (params.supplier && lot.supplier !== params.supplier) return false;
    if (params.merk && lot.merk !== params.merk) return false;
    if (params.pic && lot.pic !== params.pic) return false;
    if (params.temuan === 'ya' && !(lot.expiredButActive || lot.sisaMismatch || lot.missingExpiry || lot.missingLot)) return false;

    if (!terms.length) return true;
    const haystack = [lot.kode, lot.nama, lot.lot, lot.merk, lot.supplier, lot.instalasi, lot.pic]
      .filter(Boolean).join(' ').toLowerCase();
    return terms.every((t) => haystack.includes(t));
  });
}

const uniq = (lots, pick) => [...new Set(lots.map(pick).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'id'));

/**
 * Bilah filter. Perubahan apa pun menulis ke URL, dan router yang memicu
 * gambar ulang — jadi tidak ada state filter yang hidup di dua tempat.
 */
export function filterBar({ lots, fields = ['instalasi', 'kategori', 'status', 'risiko'], placeholder = 'Cari reagen, kode, lot, merk, supplier…', extra = [] }) {
  const params = router.params;

  const searchInput = el('input.input', {
    type: 'search',
    value: params.q || '',
    placeholder,
    'aria-label': placeholder,
  });
  let timer;
  searchInput.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => setParams({ q: searchInput.value }), 220);
  });

  const options = {
    instalasi: { label: 'Semua instalasi', values: uniq(lots, (l) => l.instalasi) },
    kategori: { label: 'Semua kategori', values: uniq(lots, (l) => l.kategori) },
    status: { label: 'Semua status', values: ['AKTIF', 'TIDAK AKTIF'] },
    risiko: {
      label: 'Semua tingkat risiko',
      values: Object.keys(BUCKET_META),
      labelFor: (v) => BUCKET_META[v].label,
    },
    lokasi: { label: 'Semua suhu simpan', values: uniq(lots, (l) => l.lokasi) },
    supplier: { label: 'Semua supplier', values: uniq(lots, (l) => l.supplier) },
    merk: { label: 'Semua merk', values: uniq(lots, (l) => l.merk) },
    pic: { label: 'Semua PIC', values: uniq(lots, (l) => l.pic) },
  };

  const selects = fields.map((field) => {
    const spec = options[field];
    if (!spec) return null;
    const select = el('select.select', {
      'aria-label': spec.label,
      style: { width: 'auto' },
      onchange: (e) => setParams({ [field]: e.target.value }),
    },
    el('option', { value: '', text: spec.label }),
    ...spec.values.map((v) => el('option', {
      value: v,
      text: spec.labelFor ? spec.labelFor(v) : v,
      selected: params[field] === v,
    })));
    return select;
  }).filter(Boolean);

  const active = FILTER_KEYS.filter((k) => params[k]).length + (params.temuan ? 1 : 0);
  const reset = active
    ? btn(`Bersihkan filter (${active})`, {
      variant: 'ghost',
      onclick: () => setParams(Object.fromEntries([...FILTER_KEYS, 'temuan'].map((k) => [k, '']))),
    })
    : null;

  return el('div.toolbar.no-print', {},
    el('div.search', {}, el('span.search-icon', {}, icon('cari', { size: 15 })), searchInput),
    ...selects,
    ...extra,
    reset ? el('span.spacer') : null,
    reset);
}

/* ------------------------------------------------------------------- laci */

const money = (n) => fmtNum(n);

/** Detail satu lot beserta seluruh riwayatnya dari ketiga tab transaksi. */
export function openLotDrawer(lot) {
  const rows = [
    ['Instalasi', lot.instalasi],
    ['Kode', lot.kode],
    ['Nomor lot', lot.lot],
    ['Merk', lot.merk],
    ['Kategori', lot.kategori],
    ['Supplier', lot.supplier],
    ['Unit', lot.unit],
    ['Suhu simpan', lot.lokasi],
    ['PIC', lot.pic],
    ['Pembaruan terakhir', lot.lastUpdate ? fmtDate(lot.lastUpdate) : null],
  ];

  const stock = el('div.diff', {},
    diff('Stok awal', money(lot.stokAwal)),
    diff('Pembelian', `+ ${money(lot.pembelian)}`),
    diff('Distribusi', `− ${money(lot.distribusi)}`),
    diff('Pemusnahan', `− ${money(lot.pemusnahan)}`),
    diff('Sisa menurut hitungan', money(lot.computedSisa)),
    diff('Sisa tertulis di sheet', money(lot.sisaStok)),
    diff('Stok minimum', money(lot.stokMin)));

  const history = [
    ...lot.receipts.map((r) => ({ type: 'penerimaan', date: r.tanggal, text: `Diterima ${money(r.qty)} ${r.unit || ''} — ${r.ket || 'tanpa keterangan'}`, row: r })),
    ...lot.issues.map((r) => ({ type: 'distribusi', date: r.tanggal, text: `Keluar ${money(r.qty)} ${r.unit || ''} ke ${r.instalasi || '—'} (${r.picPenerima || 'penerima tidak dicatat'})`, row: r })),
    ...lot.disposals.map((r) => ({ type: 'pemusnahan', date: r.tanggal, text: `Dimusnahkan ${money(r.qty)} ${r.unit || ''} — ${r.alasan || 'alasan tidak dicatat'}`, row: r })),
  ].filter((x) => x.date).sort((a, b) => b.date - a.date);

  const findings = [
    lot.expiredButActive && 'Sudah kedaluwarsa tapi status masih AKTIF.',
    lot.validButInactive && 'Masih berlaku tapi status TIDAK AKTIF.',
    lot.sisaMismatch && `Sisa Stok di sheet (${money(lot.sisaStok)}) tidak sama dengan hasil hitungan (${money(lot.computedSisa)}).`,
    lot.missingExpiry && 'Tanggal kedaluwarsa belum diisi.',
    lot.missingLot && 'Nomor lot belum diisi.',
    lot.missingSupplier && 'Supplier belum diisi.',
    !lot.hasCoa && 'Tautan COA belum ada.',
    !lot.hasMsds && 'Tautan MSDS belum ada.',
  ].filter(Boolean);

  drawer({
    title: lot.nama || lot.kode,
    subtitle: `${lot.kode} · ${lot.lot || 'tanpa nomor lot'}`,
    body: el('div', { style: { display: 'grid', gap: '20px' } },
      el('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } },
        bucketChip(lot), statusChip(lot), stockChip(lot),
        lot.hasCoa ? chip('COA ada', 'ok') : chip('COA belum ada', 'muted'),
        lot.hasMsds ? chip('MSDS ada', 'ok') : chip('MSDS belum ada', 'muted')),

      section('Identitas', el('dl.dl', {}, ...rows.flatMap(([k, v]) => (v
        ? [el('dt', { text: k }), el('dd', { text: String(v) })]
        : [el('dt', { text: k }), el('dd', { text: '—', style: { color: 'var(--ink-muted)' } })])))),

      section('Pergerakan stok', stock),

      findings.length ? section('Temuan', el('ul', { style: { margin: 0, paddingLeft: '18px', display: 'grid', gap: '4px' } },
        ...findings.map((f) => el('li', { text: f, style: { fontSize: '13px', color: 'var(--ink-secondary)' } })))) : null,

      section(`Riwayat (${history.length})`, history.length
        ? el('div.timeline', {}, ...history.map((h) => el('div.timeline-item', { dataset: { type: h.type } },
          el('span.timeline-dot'),
          el('div', {},
            el('div', { text: h.text }),
            el('div.timeline-when', { text: `${fmtDate(h.date)} · ${h.type} baris ${h.row._row}` })))))
        : empty({ title: 'Belum ada transaksi', body: 'Lot ini belum pernah muncul di tab Penerimaan, Distribusi, atau Pemusnahan.' })),

      lot.coaUrl || lot.msdsUrl ? section('Dokumen', el('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } },
        lot.coaUrl && el('a.btn.btn--sm', { href: lot.coaUrl, target: '_blank', rel: 'noopener' }, icon('keluar', { size: 14 }), el('span', { text: 'COA' })),
        lot.msdsUrl && el('a.btn.btn--sm', { href: lot.msdsUrl, target: '_blank', rel: 'noopener' }, icon('keluar', { size: 14 }), el('span', { text: 'MSDS' })))) : null),
    actions: [sheetLinkBtn('master', lot._row, `Baris ${lot._row} di Master Stok`)],
  });
}

function section(title, body) {
  return el('section', { style: { display: 'grid', gap: '8px' } },
    el('h4', { text: title, style: { fontSize: '12px', color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' } }),
    body);
}

function diff(label, value) {
  return el('div.diff-row', {},
    el('span.diff-key', { text: label }),
    el('span.diff-val', { text: String(value) }));
}
