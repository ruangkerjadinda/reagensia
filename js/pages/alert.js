import { el, chip, fmtNum, fmtDate, btn, empty } from '../ui/dom.js';
import { dataTable } from '../ui/table.js';
import { router, setParams } from '../ui/router.js';
import { buildAlerts, SEVERITY_META } from '../data/analytics.js';
import { filterBar, applyFilters, bucketChip, openLotDrawer } from '../ui/shared.js';
import { printWithTitle, copyText } from '../ui/export.js';
import { toast } from '../ui/overlay.js';
import { groupBy } from '../data/normalize.js';

export const meta = {
  title: 'Alert',
  subtitle: 'Daftar tindakan, diurutkan menurut akibatnya',
  icon: 'alert',
};

export function render({ data }) {
  const params = router.params;
  const scoped = { ...data, lots: applyFilters(data.lots, params) };
  const alerts = buildAlerts(scoped);
  const page = el('div.page');

  page.append(filterBar({
    lots: data.lots,
    fields: ['instalasi', 'pic'],
    placeholder: 'Cari reagen atau lot di dalam alert…',
    extra: [
      btn('Cetak', { icon: 'cetak', onclick: () => printAlerts(alerts, data) }),
      btn('Salin ringkasan', { icon: 'salin',
        onclick: () => copyText(alertText(alerts, data))
          .then(() => toast('Ringkasan disalin', { tone: 'ok', detail: 'Siap ditempel ke pesan.' }))
          .catch(() => toast('Gagal menyalin', { tone: 'danger' })),
      }),
    ],
  }));

  if (!alerts.length) {
    page.append(el('section.card', {}, empty({
      icon: 'centang',
      title: 'Tidak ada yang perlu ditindaklanjuti',
      body: 'Dengan filter ini, semua lot berada dalam masa berlaku dan di atas stok minimum.',
    })));
    return page;
  }

  /* -------------------------------------------------- ringkasan tingkat */

  const bySeverity = groupBy(alerts, (a) => a.severity);
  page.append(el('div.grid.grid--kpi', {},
    ...Object.entries(SEVERITY_META).map(([key, sev]) => {
      const list = bySeverity.get(key) || [];
      const total = list.reduce((a, x) => a + x.count, 0);
      return el('div.kpi', { dataset: { tone: sev.tone === 'danger' ? 'danger' : sev.tone === 'warn' ? 'warn' : '' } },
        el('span.kpi-label', { text: sev.label }),
        el('span.kpi-value', { text: fmtNum(total) }),
        el('span.kpi-note', { text: `${list.length} jenis temuan` }));
    })));

  /* ------------------------------------------------------ kartu alert */

  const selected = params.alert;

  for (const alert of alerts) {
    const sev = SEVERITY_META[alert.severity];
    const open = selected === alert.kind;

    page.append(el('section.card', {},
      el('div.card-head', {},
        chip(sev.label, sev.tone),
        el('h3', { text: alert.title }),
        el('span.spacer'),
        chip(`${fmtNum(alert.count)} lot`, 'muted'),
        btn(open ? 'Tutup' : 'Lihat daftar', {
          variant: 'ghost',
          onclick: () => setParams({ alert: open ? '' : alert.kind }),
        })),
      el('p', { text: alert.why, style: { fontSize: '12px', color: 'var(--ink-secondary)', marginBottom: open ? '12px' : '0' } }),
      open ? alertTable(alert) : null));
  }

  return page;
}

function alertTable(alert) {
  return dataTable({
    csvName: `alert-${alert.kind}`,
    maxHeight: '46vh',
    sort: { key: 'expDate', dir: 1 },
    rows: alert.members,
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
        key: 'expDate',
        label: 'Kedaluwarsa',
        render: (l) => (l.expDate ? fmtDate(l.expDate) : '—'),
        csv: (l) => (l.expDate ? fmtDate(l.expDate) : ''),
      },
      { key: 'bucket', label: 'Risiko', render: bucketChip, csv: (l) => l.bucket },
      { key: 'sisaStok', label: 'Sisa', align: 'num', render: (l) => `${fmtNum(l.sisaStok)} ${l.unit || ''}`.trim() },
      { key: 'pic', label: 'PIC' },
      { key: '_row', label: 'Baris', align: 'num' },
    ],
  });
}

/** Cetak per instalasi — bentuk yang biasa dibagikan ke tiap unit. */
function printAlerts(alerts, data) {
  const host = el('div.print-only', {},
    el('div.print-head', {},
      el('h1', { text: 'Daftar Tindak Lanjut Reagen' }),
      el('div.meta', { text: `Dicetak ${fmtDate(new Date())} · acuan tanggal ${fmtDate(data.today)}` })),
    ...alerts.map((alert) => el('section', { style: { marginBottom: '14pt' } },
      el('h3', { text: `${SEVERITY_META[alert.severity].label} — ${alert.title} (${alert.count})` }),
      el('p', { text: alert.why, style: { fontSize: '9pt', marginBottom: '4pt' } }),
      el('table.data', {},
        el('thead', {}, el('tr', {}, ...['Instalasi', 'Kode', 'Reagen', 'Lot', 'Kedaluwarsa', 'Sisa', 'PIC']
          .map((h) => el('th', { text: h })))),
        el('tbody', {}, ...alert.members.slice(0, 200).map((l) => el('tr', {},
          el('td', { text: l.instalasi || '—' }),
          el('td', { text: l.kode || '—' }),
          el('td', { text: l.nama || '—' }),
          el('td', { text: l.lot || '—' }),
          el('td', { text: l.expDate ? fmtDate(l.expDate) : '—' }),
          el('td.num', { text: `${fmtNum(l.sisaStok)} ${l.unit || ''}`.trim() }),
          el('td', { text: l.pic || '—' }))))))),
    el('div.print-sign', {},
      el('div', {}, 'Dibuat oleh', el('div.rule', { text: 'Penanggung jawab reagen' })),
      el('div', {}, 'Diketahui oleh', el('div.rule', { text: 'Kepala Instalasi' }))));

  document.body.append(host);
  const cleanup = () => { host.remove(); window.removeEventListener('afterprint', cleanup); };
  window.addEventListener('afterprint', cleanup);
  printWithTitle(`Tindak Lanjut Reagen ${fmtDate(data.today)}`);
}

function alertText(alerts, data) {
  const lines = [`*Tindak lanjut reagen — ${fmtDate(data.today)}*`, ''];
  for (const alert of alerts) {
    lines.push(`${SEVERITY_META[alert.severity].label.toUpperCase()} · ${alert.title}: ${alert.count} lot`);
  }
  lines.push('', 'Rincian per lot tersedia di dashboard.');
  return lines.join('\n');
}
