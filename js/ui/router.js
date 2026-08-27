/**
 * Router berbasis hash: `#/inventori?instalasi=Mikrobiologi&risiko=EXPIRED`.
 *
 * Parameter filter ikut masuk URL supaya setiap tampilan bisa ditautkan —
 * "buka daftar 69 lot kedaluwarsa di Mikrobiologi" jadi satu tautan yang bisa
 * dikirim lewat pesan, bukan lima klik yang harus dijelaskan.
 */

const routes = new Map();
const listeners = new Set();

export const router = {
  name: null,
  params: {},
  fallback: 'dashboard',
};

export function register(name, def) {
  routes.set(name, def);
}

export function getRoute(name) {
  return routes.get(name);
}

export function allRoutes() {
  return [...routes.entries()].map(([name, def]) => ({ name, ...def }));
}

export function onNavigate(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [path, query] = raw.split('?');
  const name = routes.has(path) ? path : router.fallback;
  const params = {};
  for (const [k, v] of new URLSearchParams(query || '')) params[k] = v;
  return { name, params };
}

function buildHash(name, params) {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params || {})) {
    if (v != null && v !== '') search.set(k, String(v));
  }
  const q = search.toString();
  return `#/${name}${q ? `?${q}` : ''}`;
}

export function go(name, params = {}, { replace = false } = {}) {
  const hash = buildHash(name, params);
  if (location.hash === hash) {
    handle();
    return;
  }
  if (replace) {
    // history.replaceState() mengubah URL tanpa memicu 'hashchange' — itu
    // memang perilaku bakunya, bukan bug peramban. Jadi handle() harus
    // dipanggil sendiri; tanpa ini setiap perubahan filter (yang semuanya
    // lewat setParams, dan setParams defaultnya replace) hanya menulis URL
    // dan tidak pernah menggambar ulang halaman — tabelnya baru betul
    // setelah pengguna memuat ulang.
    history.replaceState(null, '', hash);
    handle();
  } else {
    location.hash = hash;
  }
}

/** Ubah sebagian parameter tanpa menambah entri riwayat — untuk filter. */
export function setParams(patch, { replace = true } = {}) {
  const next = { ...router.params };
  for (const [k, v] of Object.entries(patch)) {
    if (v == null || v === '') delete next[k];
    else next[k] = v;
  }
  go(router.name, next, { replace });
}

function handle() {
  const { name, params } = parseHash();
  router.name = name;
  router.params = params;
  for (const fn of listeners) fn(router);
}

export function start() {
  window.addEventListener('hashchange', handle);
  if (!location.hash) history.replaceState(null, '', buildHash(router.fallback, {}));
  handle();
}
