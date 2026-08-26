import { el, cardHead, sectionHead, chip, barRow, fmtNum, fmtDate, fmtDays, btn, notice } from '../ui/dom.js';
import { dataTable } from '../ui/table.js';
import { router, setParams, go } from '../ui/router.js';
import { expiryTimeline } from '../charts/timeline.js';
import { expiryTimeline as buildTimeline } from '../data/analytics.js';
import { BUCKET, BUCKET_META } from '../data/normalize.js';
import { filterBar, applyFilters, bucketChip, statusChip, openLotDrawer } from '../ui/shared.js';
import { printWithTitle, copyText } from '../ui/export.js';
import { toast } from '../ui/overlay.js';

export const meta = {
  title: 'Kedaluwarsa',
  subtitle: 'Kapan setiap lot habis masa pakainya',
  icon: 'kadaluarsa',
};

export function render({ data, summary }) {
  const params = router.params;
  const page = el('div.page');

  let lots = applyFilters(data.lots, params);
  if (params.bulan) {
    lots = lots.filter((l) => l.expDate && monthKey(l.expDate) === params.bulan && !l.isExpired);
  }

  page.append(filterBar({
    lots: data.lots,
    fields: ['instalasi', 'kategori', 'risiko'],
    extra: params.bulan
      ? [btn(`Bulan ${params.bulan}`, { icon: 'tutup', variant: 'ghost', title: 'Hapus penyaringan bulan', onclick: () => setParams({ bulan: '' }) })]
      : [],
  }));

  /* ------------------------------------------------------------- kurva */

  const series = buildTimeline(data.lots, data.today, 12);
  page.append(el('section.card', {},
    cardHead('Kurva kedaluwarsa', 'Klik satu batang untuk menyaring daftar di bawah'),
    expiryTimeline(series, {
      onSelect: (d) => (d.isBacklog
        ? setParams({ risiko: BUCKET.EXPIRED, bulan: '' })
        : setParams({ bulan: d.key, risiko: '' })),
    })));

  /* ----------------------------------------------------- ember risiko */

  const max = Math.max(...Object.values(summary.buckets).map((b) => b.count), 1);
  page.append(el('section.card', {},
    cardHead('Tingkat risiko', `Ambang: ${data.thresholds.critical} / ${data.thresholds.warning} / ${data.thresholds.watch} hari`,
      btn('Ubah ambang', { variant: 'ghost', onclick: () => go('pengaturan') })),
    el('div', {}, ...Object.keys(BUCKET_META).map((key) => barRow({
      label: BUCKET_META[key].label,
      chipEl: chip('', BUCKET_META[key].tone, BUCKET_META[key].label),
      value: summary.buckets[key].count,
      valueLabel: `${fmtNum(summary.buckets[key].count)} lot · ${fmtNum(summary.buckets[key].qty)} unit`,
      max,
      onclick: () => setParams({ risiko: key, bulan: '' }),
    })))));

  /* -------------------------------------------- usulan pemusnahan */

  const expired = data.lots.filter((l) => l.isExpired);
  if (expired.length) {
    const totalQty = expired.reduce((a, l) => a + l.sisaStok, 0);
    page.append(el('section.page-section', {},
      sectionHead('Usulan pemusnahan', `${fmtNum(expired.length)} lot, ${fmtNum(totalQty)} unit sudah lewat tanggal`,
        btn('Cetak daftar', { icon: 'cetak', onclick: () => printDisposal(expired, data) }),
        btn('Salin untuk WhatsApp', { icon: 'salin',
          onclick: () => copyText(disposalText(expired, data))
            .then(() => toast('Daftar disalin', { tone: 'ok', detail: `${expired.length} lot siap ditempel ke pesan.` }))
            .catch(() => toast('Gagal menyalin', { tone: 'danger', detail: 'Papan klip tidak tersedia di browser ini.' })),
        })),
      data.disposals.length === 0
        ? notice({
          tone: 'warn',
          icon: 'alert',
          title: 'Tab Pemusnahan masih kosong',
          body: 'Belum ada satu pun pemusnahan yang tercatat, padahal tunggakannya sebanyak daftar di bawah. Selama belum dicatat, stok yang sudah kedaluwarsa masih terhitung sebagai sisa stok.',
        })
        : null));
  }

  /* -------------------------------------------------------- daftar lot */

  const heading = params.bulan
    ? `Kedaluwarsa pada ${params.bulan}`
    : params.risiko
      ? BUCKET_META[params.risiko]?.label || 'Daftar lot'
      : 'Semua lot menurut tanggal kedaluwarsa';

  page.append(el('section.card.card--flush', {},
    cardHead(heading, `${fmtNum(lots.length)} lot`),
    dataTable({
      csvName: 'kedaluwarsa',
      maxHeight: '62vh',
      sort: { key: 'expDate', dir: 1 },
      rows: lots,
      onRowClick: openLotDrawer,
      columns: [
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
          key: 'nama',
          label: 'Reagen',
          className: 'wrap strong',
          render: (l) => el('div', {}, l.nama || '—', el('span.sub', { text: `${l.kode} · ${l.lot || 'tanpa lot'}` })),
          csv: (l) => l.nama,
        },
        { key: 'instalasi', label: 'Instalasi' },
        { key: 'sisaStok', label: 'Sisa', align: 'num', render: (l) => `${fmtNum(l.sisaStok)} ${l.unit || ''}`.trim() },
        { key: 'status', label: 'Status', render: statusChip, csv: (l) => l.status },
        { key: 'lokasi', label: 'Suhu' },
        { key: 'pic', label: 'PIC' },
        { key: '_row', label: 'Baris', align: 'num' },
      ],
      emptyState: { title: 'Tidak ada lot di rentang ini', body: 'Coba pilih bulan lain atau bersihkan filter.' },
    })));

  return page;
}

function monthKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Cetak berita acara usulan pemusnahan.
 *
 * Halaman diganti sementara dengan tabel bersih plus blok tanda tangan, lalu
 * dikembalikan setelah dialog cetak ditutup — dokumen ini biasanya perlu
 * ditandatangani, bukan sekadar dibaca di layar.
 */
function printDisposal(expired, data) {
  const host = el('div.print-only', { id: 'print-host' },
    el('div.print-head', {},
      el('h1', { text: 'Usulan Pemusnahan Reagen Kedaluwarsa' }),
      el('div.meta', { text: `Dicetak ${fmtDate(new Date())} · ${expired.length} lot · ${fmtNum(expired.reduce((a, l) => a + l.sisaStok, 0))} unit` })),
    el('table.data', {},
      el('thead', {}, el('tr', {}, ...['No', 'Instalasi', 'Kode', 'Nama Reagen', 'Lot', 'Kedaluwarsa', 'Sisa', 'Unit', 'Suhu']
        .map((h) => el('th', { text: h })))),
      el('tbody', {}, ...expired
        .slice()
        .sort((a, b) => a.expDate - b.expDate)
        .map((l, i) => el('tr', {},
          el('td', { text: String(i + 1) }),
          el('td', { text: l.instalasi || '—' }),
          el('td', { text: l.kode || '—' }),
          el('td', { text: l.nama || '—' }),
          el('td', { text: l.lot || '—' }),
          el('td', { text: fmtDate(l.expDate) }),
          el('td.num', { text: fmtNum(l.sisaStok) }),
          el('td', { text: l.unit || '—' }),
          el('td', { text: l.lokasi || '—' }))))),
    el('div.print-sign', {},
      el('div', {}, 'Diusulkan oleh', el('div.rule', { text: 'Penanggung jawab reagen' })),
      el('div', {}, 'Diketahui oleh', el('div.rule', { text: 'Kepala Instalasi' }))));

  document.body.append(host);
  const cleanup = () => {
    host.remove();
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('afterprint', cleanup);
  printWithTitle(`Usulan Pemusnahan ${fmtDate(data.today)}`);
}

function disposalText(expired, data) {
  const byInst = new Map();
  for (const l of expired) {
    const k = l.instalasi || 'Tanpa instalasi';
    if (!byInst.has(k)) byInst.set(k, []);
    byInst.get(k).push(l);
  }

  const lines = [`*Reagen kedaluwarsa per ${fmtDate(data.today)}*`, `${expired.length} lot menunggu pemusnahan`, ''];
  for (const [inst, items] of byInst) {
    lines.push(`*${inst}* (${items.length} lot)`);
    for (const l of items.slice().sort((a, b) => a.expDate - b.expDate)) {
      lines.push(`• ${l.nama} — lot ${l.lot || '-'} — exp ${fmtDate(l.expDate)} — sisa ${l.sisaStok} ${l.unit || ''}`.trim());
    }
    lines.push('');
  }
  return lines.join('\n');
}
