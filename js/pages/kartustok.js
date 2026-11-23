/**
 * Kartu stok yang disusun ulang dari tab transaksi.
 *
 * Tab "Kartu Stok" di workbook aslinya tersembunyi dan rumusnya menunjuk ke
 * sheet bernama 'Master Reagen' yang tidak ada, jadi sebagian besar barisnya
 * kosong. Di sini kartunya dibangun dari Penerimaan, Distribusi, dan Pemusnahan
 * — sumber yang memang terisi — sehingga saldo berjalannya selalu utuh.
 */

import { el, cardHead, chip, fmtNum, fmtDate, btn, empty, notice } from '../ui/dom.js';
import { piktogramB3, bacaB3, NAMA_B3 } from '../ui/b3.js';
import { dataTable } from '../ui/table.js';
import { router, setParams } from '../ui/router.js';
import { filterBar, applyFilters, bucketChip } from '../ui/shared.js';
import { printWithTitle } from '../ui/export.js';
import { cetakLabel, UKURAN_BAKU } from '../ui/label.js';

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
    placeholder: 'Cari nama reagen, kode, nomor BMN, atau lot…',
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
          render: (l) => el('div', {}, l.nama || '—', el('span.sub', {
            text: [l.kode, l.kodeBmn ? `BMN ${l.kodeBmn}` : null, l.lot || 'tanpa lot'].filter(Boolean).join(' · '),
          })),
          csv: (l) => l.nama,
        },
        { key: 'kodeBmn', label: 'Kode BMN', render: (l) => l.kodeBmn || '—' },
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
    // `pengguna` dipisah dari `ket` dengan sengaja: nama penerima adalah teks
    // terpanjang di baris distribusi, dan selama ia ikut di Keterangan, kolom
    // itu membungkus jadi dua baris di kartu cetak sementara kolom lain
    // kosong melompong. Dipisah, keduanya muat satu baris.
    ...lot.receipts.map((r) => ({ date: r.tanggal, jenis: 'Penerimaan', masuk: r.qty, keluar: 0, ket: r.ket || '', pengguna: '', pic: r.pic || '', row: r })),
    ...lot.issues.map((r) => ({ date: r.tanggal, jenis: 'Distribusi', masuk: 0, keluar: r.qty, ket: r.instalasi || '', pengguna: r.picPenerima || '', pic: r.picPengirim || '', row: r })),
    ...lot.disposals.map((r) => ({ date: r.tanggal, jenis: 'Pemusnahan', masuk: 0, keluar: r.qty, ket: r.alasan || '', pengguna: '', pic: r.pic || '', row: r })),
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

/**
 * Kartu stok versi cetak — satu lembar, sengaja meniru kartu fisik yang
 * ditempel di lemari pendingin: blok identitas di atas, lalu tabel mutasi
 * dengan kolom paraf.
 *
 * Barisnya diganjal sampai `MIN_BARIS` supaya kartu yang baru dicetak tetap
 * punya ruang tulis tangan — kartu ini dipakai berdampingan dengan dashboard,
 * bukan menggantikannya, dan transaksi berikutnya sering ditulis dulu di
 * kertas sebelum masuk ke spreadsheet.
 */
const MIN_BARIS = 14;

/**
 * Pita simbol B3. Dipakai di kartu layar maupun kartu cetak.
 *
 * Simbolnya tidak pernah berdiri sendiri: namanya ikut tertulis di sebelahnya.
 * Kartu ini difotokopi hitam-putih dan dibaca orang yang mungkin buta warna —
 * belah ketupat merah saja bukan peringatan yang bisa diandalkan.
 *
 * Kalau kolomnya belum diisi untuk reagen ini, pita ini tidak muncul sama
 * sekali. Deretan kosong akan terbaca sebagai "sudah diperiksa, tidak
 * berbahaya", dan itu keterangan yang tidak pernah kita punya.
 */
function pitaB3(lot, { cetak = false } = {}) {
  const baca = bacaB3(lot.b3);
  if (!baca.kunci.length) return null;
  const ukuran = cetak ? 9 : 26;
  const satuan = cetak ? 'mm' : 'px';
  return el(cetak ? 'div.kartu-cetak-b3' : 'div.kartu-b3', {},
    ...baca.kunci.map((k) => el('span.b3-item', {},
      piktogramB3(k, { size: ukuran, satuan }),
      el('span.b3-nama', { text: NAMA_B3[k] }))));
}

function printCard(lot, entries, akhir) {
  const idRows = [
    ['Nama Reagen', lot.nama],
    ['Merk / Pabrikan', lot.merk],
    ['REF / Kode', lot.kode],
    ['Kode BMN', lot.kodeBmn],
    ['No. LOT', lot.lot],
    ['Satuan', lot.unit],
    ['Expired Date', lot.expDate ? fmtDate(lot.expDate) : ''],
    ['Lokasi Penyimpanan', [lot.lokasiSimpan, lot.suhuSimpan].filter(Boolean).join(' · ')],
    ['Instalasi', lot.instalasi],
    ['Kategori', lot.kategori],
    ['Supplier', lot.supplier],
    ['PIC', lot.pic],
  ];

  const body = entries.map((e) => el('tr', {},
    el('td', { text: e.date ? fmtDate(e.date) : '' }),
    el('td.wrap', { text: [e.jenis, e.ket].filter(Boolean).join(' — ') }),
    el('td.wrap', { text: e.pengguna || '' }),
    el('td.num', { text: e.masuk ? fmtNum(e.masuk) : '' }),
    el('td.num', { text: e.keluar ? fmtNum(e.keluar) : '' }),
    el('td.num', { text: fmtNum(e.saldo) }),
    el('td', { text: e.pic || '' })));

  for (let i = entries.length; i < MIN_BARIS; i += 1) {
    body.push(el('tr.kosong', {}, ...Array.from({ length: 7 }, () => el('td', { text: ' ' }))));
  }

  return el('section.print-only.kartu-cetak', {},
    el('header.kartu-cetak-head', {},
      el('h1', { text: 'KARTU STOK REAGEN' }),
      el('span.kartu-cetak-cap', { text: `Dicetak ${fmtDate(new Date())}` })),

    el('table.kartu-cetak-id', {}, el('tbody', {}, ...pairRows(idRows))),

    pitaB3(lot, { cetak: true }),

    el('table.kartu-cetak-mutasi', {},
      el('thead', {}, el('tr', {},
        el('th', { text: 'Tanggal' }),
        el('th', { text: 'Keterangan' }),
        el('th', { text: 'Pengguna' }),
        el('th.num', { text: 'Masuk' }),
        el('th.num', { text: 'Keluar' }),
        el('th.num', { text: 'Sisa Stok' }),
        el('th', { text: 'Paraf' }))),
      el('tbody', {}, ...body)),

    el('div.kartu-cetak-kaki', {},
      el('span', { text: `Saldo akhir menurut transaksi: ${fmtNum(akhir)} ${lot.unit || ''}`.trim() }),
      el('span', { text: `Sisa Stok di Master Stok: ${fmtNum(lot.sisaStok)} ${lot.unit || ''}`.trim() })));
}

/** Dua pasang label:nilai per baris, supaya blok identitas tetap pendek. */
function pairRows(rows) {
  const out = [];
  for (let i = 0; i < rows.length; i += 2) {
    const [k1, v1] = rows[i];
    const pair = rows[i + 1];
    out.push(el('tr', {},
      el('th', { text: k1 }),
      el('td', { text: v1 || '—' }),
      el('th', { text: pair ? pair[0] : '' }),
      el('td', { text: pair ? (pair[1] || '—') : '' })));
  }
  return out;
}

function card(lot, data) {
  const entries = ledger(lot);
  const akhir = entries.length ? entries[entries.length - 1].saldo : 0;
  const cocok = akhir === lot.sisaStok;

  return el('section.page-section', {},
    el('div.toolbar.no-print', {},
      btn('Kembali ke daftar', { icon: 'kembali', variant: 'ghost', onclick: () => setParams({ lot: '' }) }),
      el('span.spacer'),
      // Satu stiker untuk botol lot ini. Bentuknya sama persis dengan yang
      // dicetak selembar di halaman Label — satu-satunya bedanya jumlahnya.
      btn('Cetak label', { icon: 'cetak', variant: 'ghost', onclick: () => cetakLabel([lot], UKURAN_BAKU, `Label — ${lot.nama}`) }),
      btn('Cetak kartu', { icon: 'cetak', onclick: () => printWithTitle(`Kartu Stok — ${lot.nama}`) })),

    // Versi cetak dibangun terpisah, bukan versi layar yang disembunyikan
    // sebagian: yang dicetak harus muat satu lembar dan berbentuk kartu stok
    // yang biasa dipakai di lab, bukan tangkapan layar dashboard.
    printCard(lot, entries, akhir),

    el('section.card.no-print', {},
      cardHead(lot.nama || lot.kode, `${lot.kode} · ${lot.lot || 'tanpa nomor lot'}`),
      el('dl.dl', {},
        ...[['Instalasi', lot.instalasi], ['Kode BMN', lot.kodeBmn], ['Merk', lot.merk],
          ['Kategori', lot.kategori], ['Supplier', lot.supplier], ['Unit', lot.unit],
          ['Suhu simpan', lot.suhuSimpan], ['Lokasi simpan', lot.lokasiSimpan],
          ['Kedaluwarsa', lot.expDate ? fmtDate(lot.expDate) : '—'], ['PIC', lot.pic]]
          .flatMap(([k, v]) => [el('dt', { text: k }), el('dd', { text: v || '—' })])),
      pitaB3(lot)),

    !cocok
      ? el('div.no-print', {}, notice({
        tone: 'warn',
        icon: 'alert',
        title: 'Saldo kartu berbeda dengan Sisa Stok di Master Stok',
        body: `Menjumlahkan transaksi menghasilkan ${fmtNum(akhir)}, sementara Master Stok baris ${lot._row} menulis ${fmtNum(lot.sisaStok)}. Selisih ini muncul kalau ada transaksi yang belum tercatat di tabnya, atau Sisa Stok diketik manual.`,
      }))
      : null,

    el('section.card.card--flush.no-print', {},
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
            { key: 'pengguna', label: 'Pengguna', className: 'wrap', sortable: false },
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
