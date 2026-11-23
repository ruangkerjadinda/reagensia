/**
 * Empat laporan yang diminta Dinda, dalam satu halaman.
 *
 * Kenapa satu halaman dan bukan empat: keempatnya berbagi kerangka yang sama —
 * pilih periode, ringkas per instalasi, rinci per baris, cetak bertanda tangan.
 * Yang berbeda hanya sumber barisnya. Memecahnya jadi empat berkas akan
 * menyalin kerangka itu empat kali, dan tiga di antaranya pasti ketinggalan
 * waktu kerangkanya berubah.
 *
 * Dua laporan bersifat **periodik** (penerimaan, distribusi): barisnya
 * kejadian, jadi pertanyaannya "selama bulan apa". Dua lagi **potret**
 * (stok per instalasi, kedaluwarsa): barisnya keadaan hari ini, dan memberinya
 * periode justru menyesatkan — stok tidak punya rentang tanggal, ia punya
 * tanggal potret. Karena itu pemilih periodenya hanya muncul di dua yang
 * pertama, dan kepala laporannya menulis "Periode …" atau "Per …" sesuai
 * jenisnya.
 */

import { el, cardHead, chip, kpi, btn, notice, empty, fmtNum, fmtDate, fmtDays, toInputDate, fromInputDate } from '../ui/dom.js';
import { dataTable } from '../ui/table.js';
import { router, setParams } from '../ui/router.js';
import { bucketChip, sheetLinkBtn } from '../ui/shared.js';
import { printWithTitle } from '../ui/export.js';
import { groupBy, BUCKET } from '../data/normalize.js';
import { APP } from '../config.js';

export const meta = {
  title: 'Laporan',
  subtitle: 'Empat laporan siap cetak',
  icon: 'laporan',
};

const JENIS = [
  {
    key: 'stok',
    tab: 'Stok per instalasi',
    judul: 'Laporan Stok Reagensia per Instalasi',
    periodik: false,
  },
  {
    key: 'penerimaan',
    tab: 'Penerimaan',
    judul: 'Laporan Penerimaan Reagensia',
    periodik: true,
  },
  {
    key: 'distribusi',
    tab: 'Distribusi',
    judul: 'Laporan Distribusi Reagensia',
    periodik: true,
  },
  {
    key: 'kedaluwarsa',
    tab: 'Kedaluwarsa',
    judul: 'Laporan Reagensia Kedaluwarsa',
    periodik: false,
  },
];

export function render({ data }) {
  const params = router.params;
  const jenis = JENIS.find((j) => j.key === params.jenis) || JENIS[0];
  const periode = rentang(params, data.today);

  const page = el('div.page');
  page.append(pemilihJenis(jenis));
  page.append(penyaring(jenis, periode, data));

  const laporan = susun(jenis, periode, params, data);

  page.append(kepalaLaporan(jenis, periode, laporan, data));
  if (laporan.kpi.length) page.append(el('div.grid.grid--kpi', {}, ...laporan.kpi));
  if (laporan.catatan) page.append(laporan.catatan);

  if (!laporan.jumlahBaris) {
    page.append(el('section.card', {}, kosong(jenis, periode)));
    return page;
  }

  for (const bagian of laporan.bagian) {
    page.append(el('section.card.card--flush', {},
      cardHead(bagian.judul, bagian.subjudul),
      bagian.isi));
  }

  return page;
}

/* ------------------------------------------------------------ pilih laporan */

function pemilihJenis(aktif) {
  return el('div.seg.seg--wrap.no-print', { role: 'tablist', 'aria-label': 'Jenis laporan' },
    ...JENIS.map((j) => el('button', {
      type: 'button',
      role: 'tab',
      text: j.tab,
      'aria-pressed': String(j.key === aktif.key),
      // Periode ikut dibuang saat berpindah ke laporan potret: membawa
      // "Oktober 2026" ke laporan stok akan menampilkan judul periode yang
      // tidak berpengaruh apa pun pada angkanya.
      onclick: () => setParams(j.periodik ? { jenis: j.key } : { jenis: j.key, periode: '', dari: '', sampai: '' }),
    })));
}

/* ------------------------------------------------------------------ periode */

function awalBulan(d, geser = 0) {
  return new Date(d.getFullYear(), d.getMonth() + geser, 1);
}

function akhirBulan(d, geser = 0) {
  return new Date(d.getFullYear(), d.getMonth() + geser + 1, 0);
}

const PRESET = {
  'bulan-ini': (t) => ({ dari: awalBulan(t), sampai: akhirBulan(t), label: namaBulan(t) }),
  'bulan-lalu': (t) => ({ dari: awalBulan(t, -1), sampai: akhirBulan(t, -1), label: namaBulan(awalBulan(t, -1)) }),
  'tahun-ini': (t) => ({ dari: new Date(t.getFullYear(), 0, 1), sampai: new Date(t.getFullYear(), 11, 31), label: `Tahun ${t.getFullYear()}` }),
  semua: () => ({ dari: null, sampai: null, label: 'Seluruh periode' }),
};

function namaBulan(d) {
  return new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' }).format(d);
}

/**
 * Periode yang sedang berlaku. Bakunya **bulan berjalan**, karena laporan ini
 * dipakai sebagai laporan bulanan; "seluruh periode" selalu satu klik jauhnya
 * dan keadaan kosong menyebutkannya sendiri.
 */
function rentang(params, today) {
  if (params.dari || params.sampai) {
    const dari = fromInputDate(params.dari) || null;
    const sampai = fromInputDate(params.sampai) || null;
    return {
      preset: 'khusus',
      dari,
      sampai,
      label: `${dari ? fmtDate(dari) : 'awal'} – ${sampai ? fmtDate(sampai) : 'kini'}`,
    };
  }
  const key = PRESET[params.periode] ? params.periode : 'bulan-ini';
  return { preset: key, ...PRESET[key](today) };
}

function penyaring(jenis, periode, data) {
  const params = router.params;
  const instalasi = [...new Set(data.lots.map((l) => l.instalasi).filter(Boolean))].sort();

  const pilihInstalasi = el('select.select', {
    'aria-label': 'Semua instalasi',
    style: { width: 'auto' },
    onchange: (e) => setParams({ instalasi: e.target.value }),
  },
  el('option', { value: '', text: 'Semua instalasi' }),
  ...instalasi.map((v) => el('option', { value: v, text: v, selected: params.instalasi === v })));

  const kendali = [pilihInstalasi];

  if (jenis.periodik) {
    kendali.push(el('div.seg', {},
      ...Object.keys(PRESET).map((key) => el('button', {
        type: 'button',
        text: { 'bulan-ini': 'Bulan ini', 'bulan-lalu': 'Bulan lalu', 'tahun-ini': 'Tahun ini', semua: 'Semua' }[key],
        'aria-pressed': String(periode.preset === key),
        onclick: () => setParams({ periode: key, dari: '', sampai: '' }),
      }))));

    kendali.push(el('label.field-inline', {},
      el('span', { text: 'dari' }),
      el('input.input', {
        type: 'date',
        value: periode.dari ? toInputDate(periode.dari) : '',
        'aria-label': 'Tanggal mulai',
        onchange: (e) => setParams({ dari: e.target.value, periode: '' }),
      })));
    kendali.push(el('label.field-inline', {},
      el('span', { text: 'sampai' }),
      el('input.input', {
        type: 'date',
        value: periode.sampai ? toInputDate(periode.sampai) : '',
        'aria-label': 'Tanggal akhir',
        onchange: (e) => setParams({ sampai: e.target.value, periode: '' }),
      })));
  }

  if (jenis.key === 'kedaluwarsa') {
    kendali.push(el('div.seg', {},
      el('button', {
        type: 'button', text: 'Sudah kedaluwarsa',
        'aria-pressed': String(params.termasuk !== 'akan'),
        onclick: () => setParams({ termasuk: '' }),
      }),
      el('button', {
        type: 'button', text: 'Termasuk akan kedaluwarsa',
        'aria-pressed': String(params.termasuk === 'akan'),
        onclick: () => setParams({ termasuk: 'akan' }),
      })));
  }

  return el('div.toolbar.no-print', {}, ...kendali);
}

/* -------------------------------------------------------------- penyusunan */

/** Baris kejadian yang jatuh di dalam periode. */
function dalamPeriode(rows, periode) {
  if (!periode.dari && !periode.sampai) return { cocok: rows, tanpaTanggal: 0 };
  const dari = periode.dari ? periode.dari.getTime() : -Infinity;
  // Akhir hari, supaya baris bertanggal sama dengan "sampai" ikut terhitung.
  const sampai = periode.sampai ? new Date(periode.sampai).setHours(23, 59, 59, 999) : Infinity;

  const cocok = [];
  let tanpaTanggal = 0;
  for (const r of rows) {
    if (!r.tanggal) { tanpaTanggal++; continue; }
    const t = r.tanggal.getTime();
    if (t >= dari && t <= sampai) cocok.push(r);
  }
  return { cocok, tanpaTanggal };
}

function saringInstalasi(rows, params) {
  if (!params.instalasi) return rows;
  return rows.filter((r) => r.instalasi === params.instalasi);
}

function susun(jenis, periode, params, data) {
  if (jenis.key === 'stok') return laporanStok(params, data);
  if (jenis.key === 'penerimaan') return laporanTransaksi(data.receipts, periode, params, data, 'penerimaan');
  if (jenis.key === 'distribusi') return laporanTransaksi(data.issues, periode, params, data, 'distribusi');
  return laporanKedaluwarsa(params, data);
}

/* ------------------------------------------------- 1. stok per instalasi */

function laporanStok(params, data) {
  const lots = saringInstalasi(data.lots, params);
  const groups = groupBy(lots, (l) => l.instalasi || '(tanpa instalasi)');

  const ringkas = [...groups.entries()].map(([instalasi, anggota]) => ({
    instalasi,
    lot: anggota.length,
    reagen: new Set(anggota.map((a) => a.kode || a.nama)).size,
    stok: jumlah(anggota, (a) => a.sisaStok),
    rendah: anggota.filter((a) => a.isLowStock).length,
    habis: anggota.filter((a) => a.isOutOfStock).length,
    kedaluwarsa: anggota.filter((a) => a.isExpired).length,
    anggota,
  })).sort((a, b) => b.stok - a.stok);

  const totalStok = jumlah(lots, (l) => l.sisaStok);

  return {
    jumlahBaris: lots.length,
    kpi: [
      kpi({ label: 'Instalasi', value: fmtNum(ringkas.length) }),
      kpi({ label: 'Lot', value: fmtNum(lots.length) }),
      kpi({ label: 'Total stok', value: fmtNum(totalStok), note: 'unit' }),
      kpi({
        label: 'Perlu perhatian',
        value: fmtNum(lots.filter((l) => l.atOrBelowMin || l.isExpired).length),
        note: 'stok rendah atau kedaluwarsa',
        tone: 'warn',
      }),
    ],
    ringkasUntukCetak: {
      kolom: ['Instalasi', 'Lot', 'Jenis reagen', 'Total stok', 'Stok rendah', 'Habis', 'Kedaluwarsa'],
      baris: ringkas.map((r) => [r.instalasi, r.lot, r.reagen, r.stok, r.rendah, r.habis, r.kedaluwarsa]),
      total: ['Total', jumlah(ringkas, (r) => r.lot), '', totalStok, jumlah(ringkas, (r) => r.rendah), jumlah(ringkas, (r) => r.habis), jumlah(ringkas, (r) => r.kedaluwarsa)],
    },
    rinciUntukCetak: {
      kolom: ['Instalasi', 'Kode', 'Nama Reagen', 'Lot', 'Kedaluwarsa', 'Sisa', 'Unit', 'Status'],
      baris: lots.slice().sort(urutStok).map((l) => [
        l.instalasi || '—', l.kode || '—', l.nama || '—', l.lot || '—',
        l.expDate ? fmtDate(l.expDate) : '—', l.sisaStok, l.unit || '—', l.status || '—',
      ]),
    },
    bagian: [
      {
        judul: 'Ringkasan per instalasi',
        subjudul: 'Satu baris per instalasi, seluruh lot digabung',
        isi: dataTable({
          csvName: 'laporan-stok-per-instalasi',
          rows: ringkas,
          sort: { key: 'stok', dir: 1 },
          foot: el('span', { text: `Total ${fmtNum(totalStok)} unit` }),
          columns: [
            { key: 'instalasi', label: 'Instalasi', className: 'strong' },
            { key: 'lot', label: 'Lot', align: 'num' },
            { key: 'reagen', label: 'Jenis reagen', align: 'num' },
            { key: 'stok', label: 'Total stok', align: 'num', render: (r) => fmtNum(r.stok) },
            { key: 'rendah', label: 'Stok rendah', align: 'num', render: (r) => (r.rendah ? chip(String(r.rendah), 'warn') : '—') },
            { key: 'habis', label: 'Habis', align: 'num', render: (r) => (r.habis ? chip(String(r.habis), 'danger') : '—') },
            { key: 'kedaluwarsa', label: 'Kedaluwarsa', align: 'num', render: (r) => (r.kedaluwarsa ? chip(String(r.kedaluwarsa), 'danger') : '—') },
          ],
          emptyState: { title: 'Belum ada lot', body: 'Tidak ada baris di Master Stok.' },
        }),
      },
      {
        judul: 'Rincian lot',
        subjudul: 'Sesuai Master Stok, urut instalasi lalu nama reagen',
        isi: dataTable({
          csvName: 'laporan-stok-rincian',
          maxHeight: '60vh',
          rows: lots.slice().sort(urutStok),
          columns: [
            { key: 'instalasi', label: 'Instalasi' },
            {
              key: 'nama',
              label: 'Reagen',
              className: 'wrap strong',
              render: (l) => el('div', {}, l.nama || '—', el('span.sub', { text: `${l.kode || 'tanpa kode'} · ${l.lot || 'tanpa lot'}` })),
              csv: (l) => l.nama,
            },
            { key: 'expDate', label: 'Kedaluwarsa', render: (l) => (l.expDate ? fmtDate(l.expDate) : '—'), csv: (l) => (l.expDate ? fmtDate(l.expDate) : '') },
            { key: 'bucket', label: 'Risiko', render: bucketChip, csv: (l) => l.bucket },
            { key: 'sisaStok', label: 'Sisa', align: 'num', render: (l) => fmtNum(l.sisaStok) },
            { key: 'unit', label: 'Unit' },
            { key: 'status', label: 'Status' },
            { key: '_row', label: 'Baris', align: 'num', title: 'Nomor baris di tab Master Stok' },
          ],
          emptyState: { title: 'Tidak ada lot', body: 'Longgarkan filter instalasi.' },
        }),
      },
    ],
  };
}

const urutStok = (a, b) => String(a.instalasi).localeCompare(String(b.instalasi)) || String(a.nama).localeCompare(String(b.nama));

/* ------------------------------------- 2 & 3. penerimaan dan distribusi */

function laporanTransaksi(sumber, periode, params, data, mode) {
  const terima = mode === 'penerimaan';
  const { cocok, tanpaTanggal } = dalamPeriode(saringInstalasi(sumber, params), periode);
  const rows = cocok.slice().sort((a, b) => (a.tanggal - b.tanggal) || String(a.nama).localeCompare(String(b.nama)));

  const totalQty = jumlah(rows, (r) => r.qty);
  const perInstalasi = [...groupBy(rows, (r) => r.instalasi || '(tanpa instalasi)').entries()]
    .map(([instalasi, anggota]) => ({
      instalasi,
      baris: anggota.length,
      qty: jumlah(anggota, (a) => a.qty),
      reagen: new Set(anggota.map((a) => a.kode || a.nama)).size,
    }))
    .sort((a, b) => b.qty - a.qty);

  // Pengelompokan kedua berbeda per laporan: penerimaan dijawab "dari mana"
  // (kategori anggaran), distribusi dijawab "untuk siapa" (pengguna).
  const keduaKey = terima ? ((r) => r.kategori || '(tanpa kategori)') : ((r) => r.picPenerima || '(tanpa nama pengguna)');
  const kedua = [...groupBy(rows, keduaKey).entries()]
    .map(([label, anggota]) => ({ label, baris: anggota.length, qty: jumlah(anggota, (a) => a.qty) }))
    .sort((a, b) => b.qty - a.qty);

  const catatan = tanpaTanggal
    ? notice({
      tone: 'warn',
      icon: 'info',
      title: `${tanpaTanggal} baris tidak punya tanggal`,
      body: 'Baris tanpa tanggal tidak bisa dimasukkan ke periode mana pun, jadi tidak ikut terhitung di laporan ini. Isi tanggalnya di sheet, atau pilih "Semua" untuk melihat seluruh baris.',
    })
    : null;

  return {
    jumlahBaris: rows.length,
    catatan,
    kpi: [
      kpi({ label: 'Baris', value: fmtNum(rows.length), note: terima ? 'penerimaan' : 'distribusi' }),
      kpi({ label: 'Total qty', value: fmtNum(totalQty), note: 'unit' }),
      kpi({ label: 'Jenis reagen', value: fmtNum(new Set(rows.map((r) => r.kode || r.nama)).size) }),
      kpi({ label: 'Instalasi', value: fmtNum(perInstalasi.length) }),
    ],
    ringkasUntukCetak: {
      kolom: ['Instalasi', 'Baris', 'Jenis reagen', 'Total qty'],
      baris: perInstalasi.map((r) => [r.instalasi, r.baris, r.reagen, r.qty]),
      total: ['Total', jumlah(perInstalasi, (r) => r.baris), '', totalQty],
    },
    rinciUntukCetak: terima
      ? {
        kolom: ['Tanggal', 'Instalasi', 'Kode', 'Nama Reagen', 'Lot', 'Kedaluwarsa', 'Merk', 'Supplier', 'Qty', 'Unit', 'Kategori'],
        baris: rows.map((r) => [
          r.tanggal ? fmtDate(r.tanggal) : '—', r.instalasi || '—', r.kode || '—', r.nama || '—', r.lot || '—',
          r.expDate ? fmtDate(r.expDate) : '—', r.merk || '—', r.supplier || '—', r.qty, r.unit || '—', r.kategori || '—',
        ]),
      }
      : {
        kolom: ['Tanggal', 'Instalasi', 'Kode', 'Nama Reagen', 'Lot', 'Qty', 'Unit', 'Pengguna', 'Pengirim'],
        baris: rows.map((r) => [
          r.tanggal ? fmtDate(r.tanggal) : '—', r.instalasi || '—', r.kode || '—', r.nama || '—', r.lot || '—',
          r.qty, r.unit || '—', r.picPenerima || '—', r.picPengirim || '—',
        ]),
      },
    bagian: [
      {
        judul: 'Ringkasan per instalasi',
        subjudul: periode.label,
        isi: dataTable({
          csvName: `laporan-${mode}-per-instalasi`,
          rows: perInstalasi,
          sort: { key: 'qty', dir: 1 },
          foot: el('span', { text: `Total ${fmtNum(totalQty)} unit` }),
          columns: [
            { key: 'instalasi', label: 'Instalasi', className: 'strong' },
            { key: 'baris', label: 'Baris', align: 'num' },
            { key: 'reagen', label: 'Jenis reagen', align: 'num' },
            { key: 'qty', label: 'Total qty', align: 'num', render: (r) => fmtNum(r.qty) },
          ],
          emptyState: { title: 'Kosong', body: 'Tidak ada baris pada periode ini.' },
        }),
      },
      {
        judul: terima ? 'Ringkasan per kategori' : 'Ringkasan per pengguna',
        subjudul: terima ? 'Sumber pengadaan menurut kolom Kategori' : 'Menurut kolom PIC Penerima',
        isi: dataTable({
          csvName: `laporan-${mode}-${terima ? 'per-kategori' : 'per-pengguna'}`,
          rows: kedua,
          sort: { key: 'qty', dir: 1 },
          columns: [
            { key: 'label', label: terima ? 'Kategori' : 'Pengguna', className: 'strong wrap' },
            { key: 'baris', label: 'Baris', align: 'num' },
            { key: 'qty', label: 'Total qty', align: 'num', render: (r) => fmtNum(r.qty) },
          ],
          emptyState: { title: 'Kosong', body: 'Tidak ada baris pada periode ini.' },
        }),
      },
      {
        judul: 'Rincian',
        subjudul: `${fmtNum(rows.length)} baris · ${periode.label}`,
        isi: dataTable({
          csvName: `laporan-${mode}-rincian`,
          maxHeight: '60vh',
          rows,
          sort: { key: 'tanggal', dir: 1 },
          columns: [
            { key: 'tanggal', label: 'Tanggal', render: (r) => (r.tanggal ? fmtDate(r.tanggal) : '—'), csv: (r) => (r.tanggal ? fmtDate(r.tanggal) : '') },
            { key: 'instalasi', label: 'Instalasi' },
            {
              key: 'nama',
              label: 'Reagen',
              className: 'wrap strong',
              render: (r) => el('div', {}, r.nama || '—', el('span.sub', { text: `${r.kode || 'tanpa kode'} · ${r.lot || 'tanpa lot'}` })),
              csv: (r) => r.nama,
            },
            { key: 'qty', label: 'Qty', align: 'num', render: (r) => fmtNum(r.qty) },
            { key: 'unit', label: 'Unit' },
            terima
              ? { key: 'kategori', label: 'Kategori' }
              : { key: 'picPenerima', label: 'Pengguna', className: 'wrap' },
            terima
              ? { key: 'supplier', label: 'Supplier', className: 'wrap' }
              : { key: 'picPengirim', label: 'Pengirim', className: 'wrap' },
            { key: '_row', label: 'Baris', align: 'num', title: `Nomor baris di tab ${terima ? 'Penerimaan' : 'Distribusi'}` },
          ],
          emptyState: { title: 'Kosong', body: 'Tidak ada baris pada periode ini.' },
        }),
      },
    ],
  };
}

/* ------------------------------------------------------ 4. kedaluwarsa */

function laporanKedaluwarsa(params, data) {
  const akan = params.termasuk === 'akan';
  const semua = saringInstalasi(data.lots, params);
  // "Akan kedaluwarsa" memakai ambang yang sama dengan seluruh dashboard
  // (CONFIG.thresholds lewat bucket), bukan angka baru yang dikarang di sini.
  const lots = semua.filter((l) => l.isExpired
    || (akan && (l.bucket === BUCKET.CRITICAL || l.bucket === BUCKET.WARNING)));

  const rows = lots.slice().sort((a, b) => (a.expDate || 0) - (b.expDate || 0));
  const sudah = lots.filter((l) => l.isExpired);
  const unitSudah = jumlah(sudah, (l) => l.sisaStok);

  const perInstalasi = [...groupBy(rows, (r) => r.instalasi || '(tanpa instalasi)').entries()]
    .map(([instalasi, anggota]) => ({
      instalasi,
      lot: anggota.length,
      sudah: anggota.filter((a) => a.isExpired).length,
      unit: jumlah(anggota.filter((a) => a.isExpired), (a) => a.sisaStok),
      masihAktif: anggota.filter((a) => a.expiredButActive).length,
    }))
    .sort((a, b) => b.unit - a.unit);

  const masihAktif = lots.filter((l) => l.expiredButActive).length;

  return {
    jumlahBaris: rows.length,
    catatan: masihAktif
      ? notice({
        tone: 'danger',
        icon: 'alert',
        title: `${masihAktif} lot sudah lewat tanggal tapi statusnya masih AKTIF`,
        body: 'Statusnya rumus tanggal di Master Stok, jadi selisih ini berarti tanggal kedaluwarsanya baru saja lewat atau tanggalnya salah ketik. Lot ini paling perlu diperiksa lebih dulu.',
      })
      : null,
    kpi: [
      kpi({ label: 'Sudah kedaluwarsa', value: fmtNum(sudah.length), note: 'lot', tone: 'danger' }),
      kpi({ label: 'Unit terdampak', value: fmtNum(unitSudah), note: 'masih tercatat sebagai sisa stok', tone: 'danger' }),
      akan ? kpi({ label: 'Akan kedaluwarsa', value: fmtNum(rows.length - sudah.length), note: 'lot', tone: 'warn' }) : null,
      kpi({ label: 'Instalasi terdampak', value: fmtNum(perInstalasi.length) }),
    ].filter(Boolean),
    ringkasUntukCetak: {
      kolom: ['Instalasi', 'Lot', 'Sudah kedaluwarsa', 'Unit terdampak', 'Masih AKTIF'],
      baris: perInstalasi.map((r) => [r.instalasi, r.lot, r.sudah, r.unit, r.masihAktif]),
      total: ['Total', jumlah(perInstalasi, (r) => r.lot), jumlah(perInstalasi, (r) => r.sudah), jumlah(perInstalasi, (r) => r.unit), masihAktif],
    },
    rinciUntukCetak: {
      kolom: ['Instalasi', 'Kode', 'Nama Reagen', 'Lot', 'Kedaluwarsa', 'Selisih hari', 'Sisa', 'Unit', 'Status'],
      baris: rows.map((l) => [
        l.instalasi || '—', l.kode || '—', l.nama || '—', l.lot || '—',
        l.expDate ? fmtDate(l.expDate) : '—', l.daysToExpiry == null ? '—' : fmtDays(l.daysToExpiry),
        l.sisaStok, l.unit || '—', l.status || '—',
      ]),
    },
    bagian: [
      {
        judul: 'Ringkasan per instalasi',
        subjudul: akan ? 'Termasuk lot yang akan kedaluwarsa' : 'Hanya lot yang sudah lewat tanggal',
        isi: dataTable({
          csvName: 'laporan-kedaluwarsa-per-instalasi',
          rows: perInstalasi,
          sort: { key: 'unit', dir: 1 },
          foot: el('span', { text: `${fmtNum(unitSudah)} unit kedaluwarsa` }),
          columns: [
            { key: 'instalasi', label: 'Instalasi', className: 'strong' },
            { key: 'lot', label: 'Lot', align: 'num' },
            { key: 'sudah', label: 'Sudah kedaluwarsa', align: 'num' },
            { key: 'unit', label: 'Unit terdampak', align: 'num', render: (r) => fmtNum(r.unit) },
            { key: 'masihAktif', label: 'Masih AKTIF', align: 'num', render: (r) => (r.masihAktif ? chip(String(r.masihAktif), 'danger') : '—') },
          ],
          emptyState: { title: 'Tidak ada', body: 'Tidak ada lot kedaluwarsa.' },
        }),
      },
      {
        judul: 'Rincian lot',
        subjudul: 'Urut dari yang paling lama lewat tanggal',
        isi: dataTable({
          csvName: 'laporan-kedaluwarsa-rincian',
          maxHeight: '60vh',
          rows,
          sort: { key: 'expDate', dir: -1 },
          columns: [
            { key: 'instalasi', label: 'Instalasi' },
            {
              key: 'nama',
              label: 'Reagen',
              className: 'wrap strong',
              render: (l) => el('div', {}, l.nama || '—', el('span.sub', { text: `${l.kode || 'tanpa kode'} · ${l.lot || 'tanpa lot'}` })),
              csv: (l) => l.nama,
            },
            {
              key: 'expDate',
              label: 'Kedaluwarsa',
              render: (l) => el('div', {}, l.expDate ? fmtDate(l.expDate) : '—', el('span.sub', { text: l.expDate ? fmtDays(l.daysToExpiry) : 'belum diisi' })),
              csv: (l) => (l.expDate ? fmtDate(l.expDate) : ''),
            },
            { key: 'bucket', label: 'Risiko', render: bucketChip, csv: (l) => l.bucket },
            { key: 'sisaStok', label: 'Sisa', align: 'num', render: (l) => fmtNum(l.sisaStok) },
            { key: 'unit', label: 'Unit' },
            { key: 'status', label: 'Status', render: (l) => (l.expiredButActive ? chip('AKTIF', 'danger', 'Sudah lewat tanggal tapi masih AKTIF') : (l.status || '—')), csv: (l) => l.status },
            { key: '_row', label: 'Baris', align: 'num', title: 'Nomor baris di tab Master Stok' },
          ],
          emptyState: { title: 'Tidak ada', body: 'Tidak ada lot kedaluwarsa pada filter ini.' },
        }),
      },
    ],
  };
}

/* --------------------------------------------------------------- kepala */

function kepalaLaporan(jenis, periode, laporan, data) {
  const params = router.params;
  const lingkup = params.instalasi || 'Semua instalasi';

  return el('section.card', {},
    cardHead(
      jenis.judul,
      jenis.periodik ? `Periode ${periode.label} · ${lingkup}` : `Per ${fmtDate(data.today)} · ${lingkup}`,
      laporan.jumlahBaris
        ? btn('Cetak laporan', { icon: 'cetak', variant: 'primary', onclick: () => cetak(jenis, periode, laporan, data) })
        : null,
      sheetLinkBtn(jenis.key === 'stok' || jenis.key === 'kedaluwarsa' ? 'master' : jenis.key)));
}

function kosong(jenis, periode) {
  return empty({
    icon: 'kosong',
    title: jenis.periodik ? `Tidak ada ${jenis.tab.toLowerCase()} pada ${periode.label}` : 'Tidak ada baris',
    body: jenis.periodik
      ? 'Periode ini memang kosong di sheet. Pilih periode lain, atau lihat seluruh periode.'
      : 'Tidak ada baris yang cocok dengan filter instalasi yang aktif.',
    action: jenis.periodik && periode.preset !== 'semua'
      ? btn('Lihat semua periode', { onclick: () => setParams({ periode: 'semua', dari: '', sampai: '' }) })
      : null,
  });
}

/* ---------------------------------------------------------------- cetak */

/**
 * Laporan versi kertas: kepala berjudul, ringkasan, rincian, lalu blok tanda
 * tangan. Sengaja disusun ulang dari data dan bukan menyembunyikan sebagian
 * tampilan layar — yang dicetak adalah dokumen yang ditandatangani, jadi ia
 * tidak boleh membawa tombol, chip warna, atau kolom "Baris" yang hanya
 * berguna di layar.
 */
function cetak(jenis, periode, laporan, data) {
  const params = router.params;
  const lingkup = params.instalasi || 'Semua instalasi';
  const subjudul = jenis.periodik
    ? `Periode ${periode.label}`
    : `Keadaan per ${fmtDate(data.today)}`;

  const host = el('div.print-only', { id: 'print-host' },
    el('div.print-head', {},
      el('h1', { text: jenis.judul }),
      el('div.meta', { text: `${APP.name} · ${subjudul} · ${lingkup}` }),
      el('div.meta', { text: `Dicetak ${fmtDate(new Date())} · ${fmtNum(laporan.jumlahBaris)} baris` })),
    laporan.ringkasUntukCetak ? el('h2.print-sub', { text: 'Ringkasan' }) : null,
    laporan.ringkasUntukCetak ? tabelCetak(laporan.ringkasUntukCetak) : null,
    laporan.rinciUntukCetak ? el('h2.print-sub', { text: 'Rincian' }) : null,
    laporan.rinciUntukCetak ? tabelCetak(laporan.rinciUntukCetak, true) : null,
    el('div.print-sign', {},
      el('div', {}, 'Dibuat oleh', el('div.rule', { text: 'Penanggung jawab reagen' })),
      el('div', {}, 'Diketahui oleh', el('div.rule', { text: 'Kepala Instalasi' }))));

  document.body.append(host);
  const bersihkan = () => {
    host.remove();
    window.removeEventListener('afterprint', bersihkan);
  };
  window.addEventListener('afterprint', bersihkan);
  printWithTitle(`${jenis.judul} — ${jenis.periodik ? periode.label : fmtDate(data.today)}`);
}

function tabelCetak(spec, bernomor = false) {
  const angka = (v) => (typeof v === 'number' ? fmtNum(v) : v);
  // Judul kolom ikut rata kanan kalau isinya angka. Tanpa ini judulnya rata
  // kiri sementara angkanya rata kanan, dan kolom sempit seperti "Baris"
  // terbaca seperti dua kolom berbeda.
  const numerik = spec.kolom.map((_, i) => spec.baris.some((b) => typeof b[i] === 'number'));
  return el('table.data', {},
    el('thead', {}, el('tr', {},
      bernomor ? el('th', { text: 'No' }) : null,
      ...spec.kolom.map((h, i) => el(numerik[i] ? 'th.num' : 'th', { text: h })))),
    el('tbody', {},
      ...spec.baris.map((baris, i) => el('tr', {},
        bernomor ? el('td', { text: String(i + 1) }) : null,
        ...baris.map((sel) => el(typeof sel === 'number' ? 'td.num' : 'td', { text: String(angka(sel) ?? '—') }))))),
    spec.total
      ? el('tfoot', {}, el('tr.total', {},
        bernomor ? el('td', { text: '' }) : null,
        ...spec.total.map((sel) => el(typeof sel === 'number' ? 'td.num' : 'td', { text: String(angka(sel) ?? '') }))))
      : null);
}

/* -------------------------------------------------------------- pembantu */

function jumlah(rows, pick) {
  return rows.reduce((a, r) => a + (Number(pick(r)) || 0), 0);
}
