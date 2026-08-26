/**
 * Kerangka aplikasi: navigasi, status sinkronisasi, dan penggambaran halaman.
 *
 * Halaman digambar ulang penuh setiap kali rute atau data berubah. Dengan
 * ratusan baris — bukan puluhan ribu — cara ini cukup cepat, dan menghilangkan
 * seluruh kelas bug "tampilan tidak ikut berubah".
 */

import { APP, CONFIG, canWrite } from './config.js';
import { store, subscribe, load, lastSyncLabel } from './data/store.js';
import { el, mount, chip, btn, fmtNum, notice } from './ui/dom.js';
import { register, start, onNavigate, router, go, allRoutes } from './ui/router.js';
import { applyTheme, syncMetaThemeColor } from './ui/theme.js';
import { openPalette } from './ui/palette.js';
import { closeOverlay } from './ui/overlay.js';

import * as dashboard from './pages/dashboard.js';
import * as inventori from './pages/inventori.js';
import * as kadaluarsa from './pages/kadaluarsa.js';
import * as stok from './pages/stok.js';
import * as alert from './pages/alert.js';
import * as audit from './pages/audit.js';
import * as transaksi from './pages/transaksi.js';
import * as dokumen from './pages/dokumen.js';
import * as kartustok from './pages/kartustok.js';
import * as pengaturan from './pages/pengaturan.js';

const PAGES = { dashboard, inventori, kadaluarsa, stok, alert, audit, transaksi, dokumen, kartustok, pengaturan };

const NAV = [
  { label: 'Pantau', items: ['dashboard', 'inventori', 'kadaluarsa', 'stok'] },
  { label: 'Tindak lanjut', items: ['alert', 'audit'] },
  { label: 'Catatan', items: ['transaksi', 'dokumen', 'kartustok'] },
  { label: 'Sistem', items: ['pengaturan'] },
];

for (const [name, mod] of Object.entries(PAGES)) {
  register(name, { meta: mod.meta, render: mod.render });
}

const main = document.getElementById('view');
const navHost = document.getElementById('nav');
const titleEl = document.getElementById('page-title');
const subtitleEl = document.getElementById('page-subtitle');
const syncBtn = document.getElementById('sync');
const syncLabel = document.getElementById('sync-label');
const actionsHost = document.getElementById('topbar-actions');

/** Hitungan kecil di sebelah menu, supaya yang mendesak terlihat tanpa membuka halamannya. */
function navCounts() {
  if (!store.summary) return {};
  const s = store.summary;
  return {
    kadaluarsa: { value: s.buckets.EXPIRED.count, tone: s.buckets.EXPIRED.count ? 'danger' : '' },
    alert: { value: s.buckets.EXPIRED.count + s.buckets.CRITICAL.count + s.outOfStock, tone: 'danger' },
    audit: { value: s.audit.total, tone: s.audit.expiredButActive.length ? 'danger' : '' },
    inventori: { value: s.totalLots, tone: '' },
    stok: { value: s.atOrBelowMin, tone: '' },
  };
}

function renderNav() {
  const counts = navCounts();

  mount(navHost, ...NAV.map((group) => el('div.nav-group', {},
    el('div.nav-group-label', { text: group.label }),
    ...group.items.map((name) => {
      const route = allRoutes().find((r) => r.name === name);
      const count = counts[name];
      return el('button.nav-btn', {
        type: 'button',
        'aria-current': router.name === name ? 'page' : undefined,
        onclick: () => {
          go(name);
          document.body.dataset.nav = '';
        },
      },
      el('span.nav-icon', { text: route.meta.icon, 'aria-hidden': 'true' }),
      route.meta.title,
      count && count.value ? el('span.nav-count', { dataset: { tone: count.tone }, text: fmtNum(count.value) }) : null);
    }))));
}

function renderSync() {
  const state = store.offline ? 'offline'
    : store.status === 'loading' ? 'loading'
      : store.source === 'live' ? 'live' : 'stale';
  syncBtn.dataset.state = state;
  syncLabel.textContent = store.status === 'loading' && !store.tables
    ? 'Menghubungkan…'
    : store.offline ? `Luring · ${lastSyncLabel()}` : lastSyncLabel();
  syncBtn.title = store.message || 'Klik untuk menyegarkan data';
}

function renderTopbar() {
  const route = allRoutes().find((r) => r.name === router.name);
  titleEl.textContent = route?.meta.title || APP.name;
  subtitleEl.textContent = route?.meta.subtitle || '';

  mount(actionsHost,
    canWrite() ? chip('Mode input aktif', 'ok') : null,
    btn('⌕ Cari', {
      variant: 'ghost',
      title: 'Pencarian cepat (Ctrl+K)',
      onclick: () => openPalette(() => store.data),
    }),
    btn('↻ Segarkan', {
      onclick: () => load({ force: true }),
      title: 'Ambil ulang data dari Google Sheets',
    }));
}

function renderPage() {
  renderNav();
  renderTopbar();
  renderSync();

  if (store.status === 'error') {
    mount(main, el('div.page', {}, el('div.boot', {},
      el('h2', { text: 'Tidak bisa membaca spreadsheet' }),
      el('p', { text: store.message, style: { color: 'var(--ink-secondary)', maxWidth: '48ch' } }),
      el('p', {
        style: { color: 'var(--ink-muted)', fontSize: '12px', maxWidth: '52ch' },
        text: 'Pastikan spreadsheet masih dibagikan sebagai "siapa saja yang memiliki tautan dapat melihat", lalu coba lagi.',
      }),
      btn('Coba lagi', { variant: 'primary', onclick: () => load({ force: true }) }))));
    return;
  }

  if (!store.data) {
    mount(main, el('div.page', {}, el('div.boot', {},
      el('div.spinner'),
      el('h2', { text: 'Menghubungkan ke Google Sheets…' }),
      el('p', { text: 'Memuat lima tab sekaligus.', style: { color: 'var(--ink-muted)' } }))));
    return;
  }

  const route = allRoutes().find((r) => r.name === router.name);
  const ctx = {
    data: store.data,
    summary: store.summary,
    params: router.params,
    rerender: renderPage,
  };

  let body;
  try {
    body = route.render(ctx);
  } catch (err) {
    console.error(err);
    body = el('div.page', {}, notice({
      tone: 'danger',
      glyph: '✕',
      title: 'Halaman ini gagal digambar',
      body: String(err?.message || err),
    }));
  }

  const banner = store.offline
    ? notice({
      tone: 'warn',
      glyph: '▲',
      title: 'Sedang luring — menampilkan data tersimpan',
      body: `${store.message} Angka di layar berasal dari pengambilan terakhir: ${lastSyncLabel()}.`,
      action: btn('Coba lagi', { onclick: () => load({ force: true }) }),
    })
    : null;

  if (banner) body.prepend(banner);
  mount(main, body);
  main.scrollTop = 0;
  window.scrollTo(0, 0);
}

/* ------------------------------------------------------------- pintasan */

document.addEventListener('keydown', (e) => {
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName || '');

  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    openPalette(() => store.data);
    return;
  }
  if (typing) return;

  if (e.key === 'r' && !e.ctrlKey && !e.metaKey) {
    e.preventDefault();
    load({ force: true });
  }
  if (e.key === '?') {
    e.preventDefault();
    go('pengaturan');
  }
  if (e.key === 'Escape') closeOverlay();
});

document.getElementById('nav-toggle')?.addEventListener('click', () => {
  document.body.dataset.nav = document.body.dataset.nav === 'open' ? '' : 'open';
});

syncBtn.addEventListener('click', () => load({ force: true }));

/* ---------------------------------------------------------------- mulai */

applyTheme(CONFIG.theme);
subscribe(renderPage);
onNavigate(() => {
  closeOverlay();
  renderPage();
});
start();
load();
syncMetaThemeColor();

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {
      // Pekerja layanan hanya menambah kemampuan luring; kegagalannya tidak fatal.
    });
  });
}
