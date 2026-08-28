/**
 * Kartu stok yang disusun ulang dari tab transaksi.
 *
 * Tab "Kartu Stok" di workbook aslinya tersembunyi dan rumusnya menunjuk ke
 * sheet bernama 'Master Reagen' yang tidak ada, jadi sebagian besar barisnya
 * kosong. Di sini kartunya dibangun dari Penerimaan, Distribusi, dan Pemusnahan
 * — sumber yang memang terisi — sehingga saldo berjalannya selalu utuh.
 */

import { el, cardHead, chip, fmtNum, fmtDate, btn, empty, notice } from '../ui/dom.js';
import { dataTable } from '../ui/table.js';
import { router, setParams } from '../ui/router.js';
import { filterBar, applyFilters, bucketChip } from '../ui/shared.js';
import { printWithTitle } from '../ui/export.js';

export const meta = {
  title: 'Kartu Stok',
  subtitle: 'Saldo berjalan per lot, disusun dari transaksi',
  icon: 'kartustok',
};

export function render({ data }) {
  const params = router.params;
  const lots = applyFilters(data.lots, params);
  const page = el('div.page');

  page.append(filterBar({
    lots: data.lots,
    fields: ['instalasi', 'kategori'],
    placeholder: 'Cari reagen untuk membuka kartunya…',
  }));

  const selected = params.lot ? data.lots.find((l) => l.key === params.lot) : null;

  if (selected) {
    page.append(card(selected, data));
    return page;
  }

  page.append(el('section.card.card--flush', {},
    cardHead('Pilih lot', `${fmtNum(lots.length)} lot tersedia`),
    dataTable({
      csvName: 'kartu-stok-daftar',
      maxHeight: '64vh',
      sort: { key: 'transaksi', dir: -1 },
      rows: lots,
      onRowClick: (l) => setParams({ lot: l.key }),
      columns: [
        {
          key: 'nama',
          label: 'Reagen',
          className: 'wrap strong',
          render: (l) => el('div', {}, l.nama || '—', el('span.sub', { text: `${l.kode} · ${l.lot || 'tanpa lot'}` })),
          csv: (l) => l.nama,
        },
        { key: 'instalasi', label: 'Instalasi' },
        {
          key: 'transaksi',
          label: 'Transaksi',
          align: 'num',
          get: (l) => l.receipts.length + l.issues.length + l.disposals.length,
          render: (l) => {
            const n = l.receipts.length + l.issues.length + l.disposals.length;
            return n ? fmtNum(n) : el('span', { text: '0', style: { color: 'var(--ink-muted)' } });
          },
        },
        { key: 'sisaStok', label: 'Sisa', align: 'num', render: (l) => `${fmtNum(l.sisaStok)} ${l.unit || ''}`.trim() },
        { key: 'bucket', label: 'Risiko', render: bucketChip, csv: (l) => l.bucket },
        { key: 'expDate', label: 'Kedaluwarsa', render: (l) => (l.expDate ? fmtDate(l.expDate) : '—'), csv: (l) => (l.expDate ? fmtDate(l.expDate) : '') },
      ],
      emptyState: { title: 'Tidak ada lot', body: 'Bersihkan filter untuk melihat semuanya.' },
    })));

  return page;
}

/** Entri buku besar satu lot, urut waktu, dengan saldo berjalan. */
export function ledger(lot) {
  const entries = [
    ...lot.receipts.map((r) => ({ date: r.tanggal, jenis: 'Penerimaan', masuk: r.qty, keluar: 0, ket: r.ket || '', pic: r.pic || '', row: r })),
    ...lot.issues.map((r) => ({ date: r.tanggal, jenis: 'Distribusi', masuk: 0, keluar: r.qty, ket: [r.instalasi, r.picPenerima].filter(Boolean).join(' · '), pic: r.picPengirim || '', row: r })),
    ...lot.disposals.map((r) => ({ date: r.tanggal, jenis: 'Pemusnahan', masuk: 0, keluar: r.qty, ket: r.alasan || '', pic: r.pic || '', row: r })),
  ].sort((a, b) => {
    if (!a.date && !b.date) return 0;
    if (!a.date) return 1;
    if (!b.date) return -1;
    return a.date - b.date;
  });

  let saldo = 0;
  for (const e of entries) {
    saldo += e.masuk - e.keluar;
    e.saldo = saldo;
  }
  return entries;
}

function card(lot, data) {
  const entries = ledger(lot);
  const akhir = entries.length ? entries[entries.length - 1].saldo : 0;
  const cocok = akhir === lot.sisaStok;

  return el('section.page-section', {},
    el('div.toolbar.no-print', {},
      btn('Kembali ke daftar', { icon: 'kembali', variant: 'ghost', onclick: () => setParams({ lot: '' }) }),
      el('span.spacer'),
      btn('Cetak kartu', { icon: 'cetak', onclick: () => printWithTitle(`Kartu Stok — ${lot.nama}`) })),

    el('div.print-only.print-head', {},
      el('h1', { text: 'Kartu Stok Reagen' }),
      el('div.meta', { text: `${lot.nama} · ${lot.kode} · lot ${lot.lot || '-'} · dicetak ${fmtDate(new Date())}` })),

    el('section.card', {},
      cardHead(lot.nama || lot.kode, `${lot.kode} · ${lot.lot || 'tanpa nomor lot'}`),
      el('dl.dl', {},
        ...[['Instalasi', lot.instalasi], ['Merk', lot.merk], ['Kategori', lot.kategori],
          ['Supplier', lot.supplier], ['Unit', lot.unit], ['Suhu simpan', lot.lokasi],
          ['Kedaluwarsa', lot.expDate ? fmtDate(lot.expDate) : '—'], ['PIC', lot.pic]]
          .flatMap(([k, v]) => [el('dt', { text: k }), el('dd', { text: v || '—' })]))),

    !cocok
      ? notice({
        tone: 'warn',
        icon: 'alert',
        title: 'Saldo kartu berbeda dengan Sisa Stok di Master Stok',
        body: `Menjumlahkan transaksi menghasilkan ${fmtNum(akhir)}, sementara Master Stok baris ${lot._row} menulis ${fmtNum(lot.sisaStok)}. Selisih ini muncul kalau ada transaksi yang belum tercatat di tabnya, atau Sisa Stok diketik manual.`,
      })
      : null,

    el('section.card.card--flush', {},
      cardHead('Mutasi', `${fmtNum(entries.length)} transaksi · saldo akhir ${fmtNum(akhir)} ${lot.unit || ''}`.trim()),
      entries.length
        ? dataTable({
          csvName: `kartu-stok-${lot.kode}`,
          sort: null,
          rows: entries,
          columns: [
            { key: 'date', label: 'Tanggal', render: (e) => (e.date ? fmtDate(e.date) : '—'), csv: (e) => (e.date ? fmtDate(e.date) : ''), sortable: false },
            {
              key: 'jenis',
              label: 'Jenis',
              sortable: false,
              render: (e) => chip(e.jenis, e.jenis === 'Penerimaan' ? 'ok' : e.jenis === 'Pemusnahan' ? 'danger' : 'watch'),
              csv: (e) => e.jenis,
            },
            { key: 'masuk', label: 'Masuk', align: 'num', sortable: false, render: (e) => (e.masuk ? fmtNum(e.masuk) : '—') },
            { key: 'keluar', label: 'Keluar', align: 'num', sortable: false, render: (e) => (e.keluar ? fmtNum(e.keluar) : '—') },
            { key: 'saldo', label: 'Saldo', align: 'num', sortable: false, className: 'strong', render: (e) => fmtNum(e.saldo) },
            { key: 'ket', label: 'Keterangan', className: 'wrap', sortable: false },
            { key: 'pic', label: 'PIC', sortable: false },
            { key: 'row', label: 'Baris', align: 'num', sortable: false, get: (e) => e.row._row },
          ],
        })
        : empty({
          title: 'Belum ada mutasi',
          body: 'Lot ini belum pernah muncul di tab Penerimaan, Distribusi, maupun Pemusnahan.',
        })),

    data.cards.length
      ? el('section.card.card--flush.no-print', {},
        cardHead('Isi tab "Kartu Stok" di spreadsheet', `${fmtNum(data.cards.length)} baris — tab ini tersembunyi dan sebagian rumusnya rusak`),
        dataTable({
          csvName: 'kartu-stok-asli',
          maxHeight: '30vh',
          rows: data.cards,
          columns: [
            { key: 'tanggal', label: 'Tanggal', render: (r) => (r.tanggal ? fmtDate(r.tanggal) : '—'), csv: (r) => (r.tanggal ? fmtDate(r.tanggal) : '') },
            { key: 'instalasi', label: 'Instalasi' },
            { key: 'nama', label: 'Reagen', className: 'wrap' },
            { key: 'lot', label: 'Lot' },
            { key: 'masuk', label: 'In', align: 'num' },
            { key: 'keluar', label: 'Out', align: 'num' },
            { key: 'saldo', label: 'Balance', align: 'num' },
            { key: 'pic', label: 'PIC' },
          ],
        }))
      : null);
}
