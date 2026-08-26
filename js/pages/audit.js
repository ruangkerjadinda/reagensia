/**
 * Audit Data — halaman yang membaca sheet sebagai sumber yang bisa salah, bukan
 * sebagai kebenaran mutlak.
 *
 * Setiap temuan menunjuk ke nomor baris aslinya dan bisa dibuka langsung di
 * Google Sheets, karena perbaikannya memang harus dilakukan di sana.
 */

import { el, cardHead, chip, fmtNum, fmtDate, btn, empty, notice } from '../ui/dom.js';
import { dataTable } from '../ui/table.js';
import { router, setParams } from '../ui/router.js';
import { sheetLinkBtn, openLotDrawer, bucketChip } from '../ui/shared.js';
import { icon } from '../ui/icons.js';
import { sheetUrl } from '../config.js';
import { SCHEMA } from '../data/schema.js';

export const meta = {
  title: 'Audit Data',
  subtitle: 'Baris yang tidak konsisten di dalam sheet',
  icon: 'audit',
};

export function render({ data, summary }) {
  const { audit } = summary;
  const page = el('div.page');
  const open = router.params.temuan;

  /* ------------------------------------------------------ rekonsiliasi */

  page.append(el('section.card', {},
    cardHead('Rekonsiliasi antar tab', 'Total di tab transaksi dibandingkan dengan kolom ringkasannya di Master Stok'),
    el('div.table-wrap', { style: { maxHeight: 'none' } }, el('table.data', {},
      el('thead', {}, el('tr', {},
        el('th', { text: 'Pemeriksaan' }),
        el('th.num', { text: 'Tab transaksi' }),
        el('th.num', { text: 'Master Stok' }),
        el('th.num', { text: 'Selisih' }),
        el('th', { text: 'Hasil' }))),
      el('tbody', {}, ...summary.reconciliation.map((r) => el('tr', {},
        el('td', { text: r.label }),
        el('td.num', { text: fmtNum(r.transaksi) }),
        el('td.num', { text: fmtNum(r.master) }),
        el('td.num', { text: r.ok ? '—' : fmtNum(r.transaksi - r.master) }),
        el('td', {}, r.ok ? chip('Cocok', 'ok') : chip('Selisih', 'danger'))))))),
    summary.reconciliation.some((r) => !r.ok)
      ? el('p', {
        style: { fontSize: '12px', color: 'var(--ink-secondary)', marginTop: '10px' },
        text: 'Kolom Pembelian, Distribusi, dan Pemusnahan di Master Stok diisi manual — bukan rumus SUMIF ke tab transaksi. Selisih berarti salah satu sisi belum diperbarui atau ada qty yang terhitung dua kali.',
      })
      : null));

  /* ------------------------------------------------------------ temuan */

  const findings = [
    {
      kind: 'expired-aktif',
      severity: 'critical',
      title: 'Kedaluwarsa tapi masih berstatus AKTIF',
      why: 'Ini temuan paling berbahaya di sheet: reagen yang sudah lewat tanggal masih terbaca boleh dipakai. Perbaiki kolom Status atau catat pemusnahannya.',
      rows: audit.expiredButActive,
      extra: [
        { key: 'expDate', label: 'Kedaluwarsa', render: (l) => fmtDate(l.expDate) },
        { key: 'status', label: 'Status tertulis' },
      ],
    },
    {
      kind: 'sisa-mismatch',
      severity: 'high',
      title: 'Sisa Stok tidak sama dengan hasil hitungan',
      why: 'Di sebagian besar baris, Sisa Stok adalah rumus =Stok Awal + Pembelian − Distribusi − Pemusnahan. Di baris-baris ini rumusnya diganti angka ketikan, dan angkanya sekarang tidak lagi cocok.',
      rows: audit.sisaMismatch,
      extra: [
        { key: 'computedSisa', label: 'Menurut hitungan', align: 'num', render: (l) => fmtNum(l.computedSisa) },
        { key: 'sisaStok', label: 'Tertulis di sheet', align: 'num', render: (l) => fmtNum(l.sisaStok) },
        {
          key: 'sisaDelta',
          label: 'Selisih',
          align: 'num',
          render: (l) => chip(`${l.sisaDelta > 0 ? '+' : ''}${fmtNum(l.sisaDelta)}`, 'danger'),
          csv: (l) => l.sisaDelta,
        },
      ],
    },
    {
      kind: 'no-expiry',
      severity: 'high',
      title: 'Tanpa tanggal kedaluwarsa',
      why: 'Lot tanpa tanggal tidak bisa masuk perhitungan risiko mana pun — ia tidak akan pernah muncul sebagai peringatan sampai tanggalnya diisi.',
      rows: audit.missingExpiry,
      extra: [{ key: 'sisaStok', label: 'Sisa', align: 'num', render: (l) => fmtNum(l.sisaStok) }],
    },
    {
      kind: 'valid-nonaktif',
      severity: 'medium',
      title: 'Masih berlaku tapi berstatus TIDAK AKTIF',
      why: 'Kebalikan dari temuan pertama: stok yang sebenarnya masih boleh dipakai tapi ditandai tidak aktif, sehingga berpotensi dibiarkan menganggur sampai benar-benar kedaluwarsa.',
      rows: audit.validButInactive,
      extra: [
        { key: 'expDate', label: 'Kedaluwarsa', render: (l) => fmtDate(l.expDate) },
        { key: 'sisaStok', label: 'Sisa', align: 'num', render: (l) => fmtNum(l.sisaStok) },
      ],
    },
    {
      kind: 'no-lot',
      severity: 'medium',
      title: 'Tanpa nomor lot',
      why: 'Tanpa nomor lot, baris ini tidak bisa dipasangkan dengan catatan penerimaan atau distribusinya, dan penelusuran mundur saat ada masalah mutu jadi terputus.',
      rows: audit.missingLot,
    },
    {
      kind: 'no-supplier',
      severity: 'low',
      title: 'Tanpa supplier',
      why: 'Menyulitkan penelusuran pengadaan dan klaim ke penyedia.',
      rows: audit.missingSupplier,
    },
  ].filter((f) => f.rows.length);

  page.append(el('div.grid.grid--kpi', {},
    ...findings.map((f) => el('button.kpi', {
      type: 'button',
      dataset: { tone: f.severity === 'critical' ? 'danger' : f.severity === 'high' ? 'warn' : '' },
      onclick: () => setParams({ temuan: open === f.kind ? '' : f.kind }),
      title: f.title,
    },
    el('span.kpi-label', { text: f.title }),
    el('span.kpi-value', { text: fmtNum(f.rows.length) }),
    el('span.kpi-note', { text: open === f.kind ? 'sedang ditampilkan' : 'klik untuk lihat daftar' })))));

  if (!findings.length) {
    page.append(el('section.card', {}, empty({
      icon: 'centang',
      title: 'Tidak ada temuan',
      body: 'Semua baris Master Stok konsisten: status cocok dengan tanggal, Sisa Stok sama dengan hitungannya, dan kolom wajib terisi.',
    })));
  }

  /* ------------------------------------------------------ baris yatim */

  if (audit.orphans.length) {
    page.append(notice({
      tone: 'warn',
      icon: 'alert',
      title: `${audit.orphans.length} baris transaksi tidak punya pasangan di Master Stok`,
      body: `Kombinasi Kode + Kode/Lot pada baris ini tidak ditemukan di Master Stok, biasanya karena beda penulisan lot: ${audit.orphans.map((o) => `${o.tab} baris ${o.row} (${o.kode})`).join(', ')}.`,
    }));
  }

  /* ------------------------------------------------- ejaan tidak konsisten */

  if (audit.duplicates.length) {
    page.append(el('section.card', {},
      cardHead('Nilai yang ditulis dengan dua ejaan',
        `${fmtNum(audit.duplicates.length)} kelompok — sama isinya, beda penulisannya`),
      el('p', {
        style: { fontSize: '12px', color: 'var(--ink-secondary)', marginBottom: '10px' },
        text: 'Perbedaan sekecil spasi ganda tidak terlihat saat menggulir sheet, tapi memecah satu supplier atau merk jadi dua kelompok terpisah di setiap filter, grafik, dan rekap.',
      }),
      el('div.table-wrap', { style: { maxHeight: 'none' } }, el('table.data', {},
        el('thead', {}, el('tr', {},
          el('th', { text: 'Kolom' }),
          el('th', { text: 'Ejaan yang dipakai' }),
          el('th.num', { text: 'Baris' }),
          el('th', { text: 'Baris di Master Stok' }))),
        el('tbody', {}, ...audit.duplicates.flatMap((d) => d.variants.map((v, i) => el('tr', {},
          el('td', { text: i === 0 ? d.fieldLabel : '' }),
          // pre-wrap supaya spasi ganda — yang justru jadi pokok temuannya — terlihat
          el('td', {}, el('code', {
            text: JSON.stringify(v.value),
            style: { fontFamily: 'var(--font-mono)', fontSize: '12px', whiteSpace: 'pre-wrap' },
          })),
          el('td.num', { text: fmtNum(v.count) }),
          el('td', {}, ...v.rows.slice(0, 8).map((row, j) => el('a', {
            href: sheetUrl('master', row),
            target: '_blank',
            rel: 'noopener',
            text: j === 0 ? String(row) : `, ${row}`,
            style: { fontSize: '12px' },
          })), v.rows.length > 8 ? ` +${v.rows.length - 8}` : null)))))))));
  }

  /* ------------------------------------------------- daftar tiap temuan */

  for (const f of findings) {
    if (open && open !== f.kind) continue;

    page.append(el('section.card.card--flush', {},
      el('div.card-head', { style: { padding: '16px 16px 0' } },
        chip({ critical: 'Kritis', high: 'Tinggi', medium: 'Sedang', low: 'Rendah' }[f.severity],
          { critical: 'danger', high: 'warn', medium: 'watch', low: 'muted' }[f.severity]),
        el('h3', { text: f.title }),
        el('span.spacer'),
        chip(`${fmtNum(f.rows.length)} baris`, 'muted'),
        open ? btn('Tampilkan semua temuan', { variant: 'ghost', onclick: () => setParams({ temuan: '' }) }) : null),
      el('p', {
        text: f.why,
        style: { fontSize: '12px', color: 'var(--ink-secondary)', padding: '0 16px 12px' },
      }),
      dataTable({
        csvName: `audit-${f.kind}`,
        maxHeight: open ? '60vh' : '34vh',
        sort: { key: '_row', dir: 1 },
        rows: f.rows,
        onRowClick: openLotDrawer,
        columns: [
          { key: '_row', label: 'Baris', align: 'num', title: 'Nomor baris di tab Master Stok' },
          {
            key: 'nama',
            label: 'Reagen',
            className: 'wrap strong',
            render: (l) => el('div', {}, l.nama || '—', el('span.sub', { text: `${l.kode} · ${l.lot || 'tanpa lot'}` })),
            csv: (l) => l.nama,
          },
          { key: 'instalasi', label: 'Instalasi' },
          ...(f.extra || []),
          { key: 'bucket', label: 'Risiko', render: bucketChip, csv: (l) => l.bucket },
          { key: 'pic', label: 'PIC' },
          {
            key: 'buka',
            label: '',
            sortable: false,
            render: (l) => el('a.row-link.no-print', {
              href: sheetUrl('master', l._row),
              target: '_blank',
              rel: 'noopener',
              title: `Buka baris ${l._row} di Google Sheets`,
              onclick: (e) => e.stopPropagation(),
            }, icon('keluar', { size: 14 })),
            csv: () => '',
          },
        ],
      })));
  }

  page.append(el('section.card', {},
    cardHead('Perbaikan dilakukan di Google Sheets'),
    el('p', {
      style: { fontSize: '13px', color: 'var(--ink-secondary)' },
      text: 'Dashboard ini hanya membaca. Setiap baris di atas bisa dibuka langsung ke barisnya di spreadsheet lewat ikon panah di ujung barisnya. Kalau mode input sudah aktif, rumus Sisa Stok akan otomatis dipulihkan setiap kali baris itu tersentuh transaksi baru.',
    }),
    el('div', { style: { marginTop: '10px', display: 'flex', gap: '8px', flexWrap: 'wrap' } },
      ...Object.keys(SCHEMA).map((key) => sheetLinkBtn(key, null, SCHEMA[key].label)))));

  return page;
}
