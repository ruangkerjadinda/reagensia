import { el, cardHead, chip, btn, notice, fmtNum } from '../ui/dom.js';
import { CONFIG, saveSettings, resetSettings, canWrite, APP } from '../config.js';
import { store, clearCache, load, recompute, lastSyncLabel } from '../data/store.js';
import { ping, repairSisa } from '../data/writer.js';
import { toast, confirmAction, diffBlock, diffRow } from '../ui/overlay.js';
import { applyTheme, applyPalette } from '../ui/theme.js';

export const meta = {
  title: 'Pengaturan',
  subtitle: 'Sumber data, mode input, ambang risiko, tampilan',
  icon: 'pengaturan',
};

/** Pratinjau warnanya sengaja ditulis literal, bukan lewat var(--accent) —
 * tombol pilihan harus menampilkan warna aslinya sendiri-sendiri, bukan warna
 * tema yang sedang aktif. */
const PALETTES = [
  { id: 'sakura', label: 'Sakura', accent: '#de6f97', accent2: '#c14f7b' },
  { id: 'mint', label: 'Mint Klinik', accent: '#2aa385', accent2: '#178066' },
  { id: 'lavender', label: 'Lavender Senja', accent: '#7a67d9', accent2: '#5f4ac0' },
  { id: 'peach', label: 'Peach Sorbet', accent: '#ef7746', accent2: '#bd4a1d' },
];

export function render({ data, summary, rerender }) {
  const page = el('div.page');

  /* ------------------------------------------------------ sumber data */

  page.append(el('section.card', {},
    cardHead('Sumber data', 'Dashboard membaca spreadsheet langsung, tanpa perantara'),
    el('dl.dl', {},
      el('dt', { text: 'Spreadsheet' }),
      el('dd', {}, el('a', {
        href: `https://docs.google.com/spreadsheets/d/${CONFIG.spreadsheetId}/edit`,
        target: '_blank', rel: 'noopener', text: CONFIG.spreadsheetId,
      })),
      el('dt', { text: 'Cara baca' }),
      el('dd', { text: 'Google Visualization API (gviz), format JSON bertipe' }),
      el('dt', { text: 'Status' }),
      el('dd', {}, store.offline ? chip('Luring', 'danger') : chip('Terhubung', 'ok'), ' ', lastSyncLabel()),
      el('dt', { text: 'Baris terbaca' }),
      el('dd', { text: `${fmtNum(summary.totalLots)} lot · ${fmtNum(data.receipts.length)} penerimaan · ${fmtNum(data.issues.length)} distribusi · ${fmtNum(data.disposals.length)} pemusnahan` })),
    store.warnings.length
      ? el('div', { style: { marginTop: '12px' } }, notice({
        tone: 'warn',
        icon: 'alert',
        title: 'Peringatan pemetaan kolom',
        body: [...new Set(store.warnings)].join(' '),
      }))
      : null,
    el('div.toolbar', { style: { marginTop: '12px' } },
      btn('Segarkan sekarang', { variant: 'primary', onclick: () => load({ force: true }) }),
      btn('Hapus cache lokal', {
        onclick: () => {
          clearCache();
          toast('Cache dihapus', { tone: 'ok', detail: 'Muat ulang halaman untuk mengambil data dari awal.' });
        },
      }))));

  /* ------------------------------------------------------ mode input */

  page.append(writeCard(rerender));

  /* --------------------------------------------------- ambang risiko */

  const thresholdInput = (key, label) => el('div.field', {},
    el('label.field-label', { for: `th-${key}`, text: label }),
    el('input.input', {
      id: `th-${key}`, type: 'number', min: 1, max: 3650, value: CONFIG.thresholds[key],
      onchange: (e) => {
        const value = Number(e.target.value);
        if (!Number.isFinite(value) || value < 1) return;
        saveSettings({ thresholds: { [key]: value } });
        recompute();
        toast(`Ambang ${label.toLowerCase()} kini ${value} hari`, { tone: 'ok' });
      },
    }),
    el('span.field-hint', { text: 'hari' }));

  page.append(el('section.card', {},
    cardHead('Ambang risiko kedaluwarsa', 'Menentukan pembagian Kritis / Peringatan / Pantau di seluruh halaman'),
    el('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '14px' } },
      thresholdInput('critical', 'Kritis'),
      thresholdInput('warning', 'Peringatan'),
      thresholdInput('watch', 'Pantau')),
    el('p', {
      style: { fontSize: '12px', color: 'var(--ink-secondary)', marginTop: '10px' },
      text: `Dengan ambang sekarang: ${fmtNum(summary.buckets.CRITICAL.count)} lot kritis, ${fmtNum(summary.buckets.WARNING.count)} peringatan, ${fmtNum(summary.buckets.WATCH.count)} dipantau.`,
    })));

  /* -------------------------------------------------------- tampilan */

  page.append(el('section.card', {},
    cardHead('Tampilan'),
    el('div.seg', {}, ...[['system', 'Ikut sistem'], ['light', 'Terang'], ['dark', 'Gelap']].map(([value, label]) => el('button', {
      type: 'button',
      text: label,
      'aria-pressed': String(CONFIG.theme === value),
      onclick: () => {
        saveSettings({ theme: value });
        applyTheme(value);
        rerender();
      },
    })))));

  /* ---------------------------------------------------- warna tema */

  page.append(el('section.card', {},
    cardHead('Warna tema', 'Berlaku di mode terang maupun gelap'),
    el('div.palette-picker', {}, ...PALETTES.map(({ id, label, accent, accent2 }) => el('button.palette-opt', {
      type: 'button',
      'aria-pressed': String(CONFIG.palette === id),
      onclick: () => {
        saveSettings({ palette: id });
        applyPalette(id);
        rerender();
      },
    },
      el('span.palette-swatch', { style: { background: `linear-gradient(145deg, ${accent}, ${accent2})` } }),
      el('span', { text: label }))))));

  /* ---------------------------------------------------------- tentang */

  page.append(el('section.card', {},
    cardHead('Tentang'),
    el('dl.dl', {},
      el('dt', { text: 'Aplikasi' }), el('dd', { text: `${APP.name} ${APP.version} — ${APP.fullName}` }),
      el('dt', { text: 'Pintasan' }), el('dd', {}, el('kbd', { text: 'Ctrl' }), ' + ', el('kbd', { text: 'K' }), ' untuk pencarian cepat'),
      el('dt', { text: 'Menyetel ulang' }), el('dd', {}, btn('Kembalikan semua pengaturan ke awal', {
        onclick: async () => {
          const ok = await confirmAction({
            title: 'Kembalikan pengaturan ke awal?',
            body: el('p', { text: 'Endpoint, token, ambang risiko, dan pilihan tema akan dihapus dari peramban ini. Data di spreadsheet tidak tersentuh.' }),
            confirmLabel: 'Kembalikan',
            variant: 'danger',
          });
          if (!ok) return;
          resetSettings();
          applyTheme(CONFIG.theme);
          applyPalette(CONFIG.palette);
          recompute();
          rerender();
          toast('Pengaturan dikembalikan ke awal', { tone: 'ok' });
        },
      })))));

  return page;
}

function writeCard(rerender) {
  const urlInput = el('input.input', {
    type: 'url',
    value: CONFIG.endpoint.url,
    placeholder: 'https://script.google.com/macros/s/…/exec',
  });
  const tokenInput = el('input.input', { type: 'password', value: CONFIG.endpoint.token, placeholder: 'token dari Script Properties' });
  const actorInput = el('input.input', { type: 'text', value: CONFIG.actor, placeholder: 'Nama Anda, dicatat di kolom PIC dan tab Log' });

  const status = el('span');
  const renderStatus = () => {
    status.replaceChildren(canWrite()
      ? chip('Mode input aktif', 'ok')
      : CONFIG.endpoint.url ? chip('Endpoint terisi, mode input mati', 'warn') : chip('Belum disiapkan', 'muted'));
  };
  renderStatus();

  const toggle = el('label.switch', {},
    el('input', {
      type: 'checkbox',
      checked: CONFIG.writeEnabled,
      disabled: !CONFIG.endpoint.url,
      onchange: (e) => {
        saveSettings({ writeEnabled: e.target.checked });
        renderStatus();
        rerender();
      },
    }),
    el('span.switch-track'),
    el('span', { text: 'Nyalakan mode input' }));

  return el('section.card', {},
    cardHead('Mode input', 'Menambah baris ke spreadsheet dari dashboard', status),

    notice({
      tone: 'info',
      icon: 'info',
      title: 'Token ini tidak sekuat kata sandi',
      body: 'Token disimpan di peramban dan ikut terkirim dari halaman, jadi siapa pun yang membuka devtools di komputer ini bisa membacanya. Fungsinya menahan penulisan iseng dari luar, bukan menggantikan pengamanan akses spreadsheet. Jangan pakai kembali kata sandi apa pun sebagai token.',
    }),

    el('div', { style: { display: 'grid', gap: '14px', marginTop: '14px' } },
      el('div.field', {},
        el('label.field-label', { text: 'URL Web App Apps Script' }),
        urlInput,
        el('span.field-hint', { text: 'Diakhiri /exec, bukan /dev. Panduan pemasangannya ada di apps-script/DEPLOY.md.' })),
      el('div.field', {},
        el('label.field-label', { text: 'Token' }),
        tokenInput,
        el('span.field-hint', { text: 'Harus sama persis dengan Script Property API_TOKEN.' })),
      el('div.field', {},
        el('label.field-label', { text: 'Nama PIC' }),
        actorInput)),

    el('div.toolbar', { style: { marginTop: '14px' } },
      btn('Simpan', {
        variant: 'primary',
        onclick: () => {
          saveSettings({
            endpoint: { url: urlInput.value.trim(), token: tokenInput.value.trim() },
            actor: actorInput.value.trim(),
          });
          renderStatus();
          rerender();
          toast('Pengaturan endpoint disimpan', { tone: 'ok' });
        },
      }),
      btn('Uji koneksi', {
        onclick: async () => {
          saveSettings({ endpoint: { url: urlInput.value.trim(), token: tokenInput.value.trim() } });
          try {
            const res = await ping();
            toast('Endpoint menjawab', { tone: 'ok', detail: `Versi ${res.version || '?'} · tab terbaca: ${(res.sheets || []).join(', ') || '—'}` });
          } catch (err) {
            toast('Endpoint tidak menjawab', { tone: 'danger', detail: err.message, timeout: 10000 });
          }
        },
      }),
      toggle),

    el('div', { style: { marginTop: '16px', paddingTop: '14px', borderTop: '1px solid var(--border)' } },
      el('h4', { text: 'Pemeliharaan', style: { fontSize: '12px', color: 'var(--ink-muted)', marginBottom: '8px' } }),
      el('p', {
        style: { fontSize: '12px', color: 'var(--ink-secondary)', marginBottom: '10px' },
        text: 'Sebagian baris Master Stok punya Sisa Stok yang diketik manual, bukan rumus. Perintah di bawah mengembalikan rumus =Stok Awal + Pembelian − Distribusi − Pemusnahan pada baris-baris itu. Jalankan uji coba dulu untuk melihat baris mana yang akan tersentuh.',
      }),
      el('div.toolbar', {},
        btn('Uji coba (tanpa menulis)', {
          disabled: !canWrite(),
          onclick: () => runRepair(true),
        }),
        btn('Pulihkan rumus', {
          variant: 'danger',
          disabled: !canWrite(),
          onclick: () => runRepair(false),
        }))));
}

async function runRepair(dryRun) {
  try {
    const preview = await repairSisa({ dryRun: true });
    const rows = preview.result?.rows || [];

    if (!rows.length) {
      toast('Tidak ada yang perlu diperbaiki', { tone: 'ok', detail: 'Semua baris Master Stok sudah memakai rumus.' });
      return;
    }

    if (dryRun) {
      toast(`${rows.length} baris akan diperbaiki`, {
        tone: 'warn',
        detail: `Baris: ${rows.map((r) => r.row).join(', ')}`,
        timeout: 12000,
      });
      return;
    }

    const ok = await confirmAction({
      title: `Pulihkan rumus pada ${rows.length} baris?`,
      subtitle: 'Nilai Sisa Stok yang sekarang diketik manual akan diganti hasil rumus.',
      confirmLabel: 'Pulihkan rumus',
      variant: 'danger',
      body: diffBlock(...rows.slice(0, 12).map((r) => diffRow(`Baris ${r.row} · ${r.kode || ''}`, r.current, r.computed))),
    });
    if (!ok) return;

    const res = await repairSisa({ dryRun: false });
    toast(`${res.result?.repaired ?? 0} baris diperbaiki`, { tone: 'ok' });
    load({ force: true });
  } catch (err) {
    toast('Gagal menjalankan pemeliharaan', { tone: 'danger', detail: err.message, timeout: 10000 });
  }
}
