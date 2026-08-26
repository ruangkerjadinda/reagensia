import { el, cardHead, chip, barRow, fmtNum, fmtDate, notice } from '../ui/dom.js';
import { dataTable } from '../ui/table.js';
import { router, setParams } from '../ui/router.js';
import { consumption, pareto } from '../data/analytics.js';
import { filterBar, applyFilters, bucketChip, openLotDrawer } from '../ui/shared.js';

export const meta = {
  title: 'Stok & Pemakaian',
  subtitle: 'Sisa stok, laju pakai, dan usulan pengadaan',
  icon: 'stok',
};

export function render({ data, summary }) {
  const params = router.params;
  const lots = applyFilters(data.lots, params);
  const usage = consumption(lots, data.issues, data.today);
  const byKey = new Map(usage.map((u) => [u.lot.key, u]));

  const page = el('div.page');

  page.append(filterBar({
    lots: data.lots,
    fields: ['instalasi', 'kategori', 'supplier'],
    extra: [
      el('div.seg', {},
        el('button', {
          type: 'button', text: 'Semua', 'aria-pressed': String(params.stok !== 'rendah'),
          onclick: () => setParams({ stok: '' }),
        }),
        el('button', {
          type: 'button', text: 'Perlu pengadaan', 'aria-pressed': String(params.stok === 'rendah'),
          onclick: () => setParams({ stok: 'rendah' }),
        })),
    ],
  }));

  const active = params.stok === 'rendah' ? lots.filter((l) => l.atOrBelowMin) : lots;
  const dormant = usage.filter((u) => u.dormant && u.lot.sisaStok > 0).length;

  page.append(el('div.grid.grid--kpi', {},
    stat('Di bawah minimum', fmtNum(lots.filter((l) => l.atOrBelowMin).length), 'sisa ≤ stok min', lots.filter((l) => l.atOrBelowMin).length ? 'warn' : 'ok'),
    stat('Stok habis', fmtNum(lots.filter((l) => l.isOutOfStock).length), 'sisa nol', lots.filter((l) => l.isOutOfStock).length ? 'danger' : 'ok'),
    stat('Belum pernah keluar', fmtNum(dormant), 'tidak ada catatan distribusi'),
    stat('Total sisa stok', fmtNum(lots.reduce((a, l) => a + l.sisaStok, 0)), 'unit')));

  if (data.issues.length < 30) {
    page.append(notice({
      tone: 'info',
      icon: 'info',
      title: 'Laju pakai dihitung dari riwayat yang masih pendek',
      body: `Baru ada ${fmtNum(data.issues.length)} baris distribusi tercatat, jadi angka "bulan tersisa" di bawah lebih baik dibaca sebagai indikasi arah, bukan ramalan.`,
    }));
  }

  /* ------------------------------------------------------------- tabel */

  page.append(el('section.card.card--flush', {},
    cardHead(params.stok === 'rendah' ? 'Perlu pengadaan' : 'Sisa stok dan laju pakai',
      `${fmtNum(active.length)} lot`),
    dataTable({
      csvName: 'stok',
      maxHeight: '58vh',
      sort: { key: 'cover', dir: 1 },
      rows: active,
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
        {
          key: 'sisaStok',
          label: 'Sisa',
          align: 'num',
          render: (l) => el('div', {},
            el('span', { text: fmtNum(l.sisaStok), style: l.atOrBelowMin ? { color: 'var(--critical-ink)', fontWeight: '600' } : {} }),
            el('span.sub', { text: `min ${fmtNum(l.stokMin)} ${l.unit || ''}`.trim() })),
          csv: (l) => l.sisaStok,
        },
        {
          key: 'keluar',
          label: 'Total keluar',
          align: 'num',
          get: (l) => byKey.get(l.key)?.keluar ?? 0,
          render: (l) => {
            const u = byKey.get(l.key);
            return u && u.keluar
              ? el('div', {}, fmtNum(u.keluar), el('span.sub', { text: `${u.transaksi}× distribusi` }))
              : el('span', { text: '—', style: { color: 'var(--ink-muted)' } });
          },
        },
        {
          key: 'rate',
          label: 'Per bulan',
          align: 'num',
          get: (l) => byKey.get(l.key)?.perMonth ?? 0,
          render: (l) => {
            const u = byKey.get(l.key);
            return u && u.perMonth ? fmtNum(u.perMonth) : el('span', { text: '—', style: { color: 'var(--ink-muted)' } });
          },
        },
        {
          key: 'cover',
          label: 'Bulan tersisa',
          align: 'num',
          get: (l) => {
            const c = byKey.get(l.key)?.monthsOfCover;
            // Yang tak pernah keluar tidak punya "bulan tersisa" — dorong ke bawah.
            return c == null ? Number.POSITIVE_INFINITY : c;
          },
          render: (l) => {
            const u = byKey.get(l.key);
            if (!u || u.monthsOfCover == null) return el('span', { text: 'tidak dipakai', style: { color: 'var(--ink-muted)' } });
            const tone = u.monthsOfCover < 1 ? 'danger' : u.monthsOfCover < 3 ? 'warn' : 'ok';
            return chip(`${fmtNum(u.monthsOfCover)} bln`, tone);
          },
          csv: (l) => byKey.get(l.key)?.monthsOfCover ?? '',
        },
        {
          key: 'lastIssue',
          label: 'Keluar terakhir',
          get: (l) => byKey.get(l.key)?.lastIssue ?? null,
          render: (l) => {
            const d = byKey.get(l.key)?.lastIssue;
            return d ? fmtDate(d) : el('span', { text: '—', style: { color: 'var(--ink-muted)' } });
          },
        },
        { key: 'bucket', label: 'Risiko', render: bucketChip, csv: (l) => l.bucket },
        { key: 'supplier', label: 'Supplier', className: 'wrap' },
      ],
      emptyState: { title: 'Tidak ada lot yang cocok', body: 'Bersihkan filter untuk melihat seluruh stok.' },
    })));

  /* ------------------------------------------------------------ pareto */

  page.append(el('div.grid.grid--2', {},
    paretoCard('Supplier', pareto(lots, (l) => l.supplier), 'supplier'),
    paretoCard('Merk', pareto(lots, (l) => l.merk), 'merk')));

  return page;
}

function stat(label, value, note, tone) {
  return el('div.kpi', { dataset: tone ? { tone } : {} },
    el('span.kpi-label', { text: label }),
    el('span.kpi-value', { text: value }),
    el('span.kpi-note', { text: note }));
}

function paretoCard(title, rows, paramKey) {
  const max = Math.max(...rows.map((r) => r.lots), 1);
  return el('section.card', {},
    cardHead(title, `${rows.length} kelompok teratas menurut jumlah lot`),
    el('div', {}, ...rows.map((r) => barRow({
      label: r.label,
      value: r.lots,
      valueLabel: `${fmtNum(r.lots)} lot · ${fmtNum(r.stok)} unit`,
      max,
      onclick: r.isTail ? undefined : () => setParams({ [paramKey]: r.label === '(kosong)' ? '' : r.label }),
    }))));
}
