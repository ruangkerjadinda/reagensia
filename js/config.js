/**
 * Konfigurasi aplikasi.
 *
 * Nilai default di bawah adalah nilai bawaan; apa pun yang diubah lewat halaman
 * Pengaturan disimpan di localStorage dan menimpa default saat aplikasi dimuat.
 */

const DEFAULTS = {
  spreadsheetId: '1KBrL4OB_ub_ie7OCIFTGcd-gIY0hy8ApiTGnIyQTu7k',

  /** Ambang risiko kedaluwarsa, dalam hari. */
  thresholds: {
    critical: 30,
    warning: 90,
    watch: 180,
  },

  /** Endpoint Apps Script untuk mode input. Kosong = dashboard read-only. */
  endpoint: {
    url: '',
    token: '',
  },

  /** Nama PIC yang mengisi form; dicatat di kolom PIC dan di tab Log. */
  actor: '',

  /** Mode input mati sampai endpoint dikonfigurasi dan pengguna menyalakannya. */
  writeEnabled: false,

  theme: 'system', // 'system' | 'light' | 'dark'
};

export const APP = {
  name: 'Reagensia',
  fullName: 'Monitoring Reagen Laboratorium',
  version: '1.0.0',
};

/** Nama tab persis seperti di Google Sheets. */
export const TABS = {
  master: 'Master Stok',
  penerimaan: 'Penerimaan',
  distribusi: 'Distribusi',
  pemusnahan: 'Pemusnahan',
  kartuStok: 'Kartu Stok',
};

/**
 * gid tiap tab, dipakai untuk membuat tautan balik ke baris tertentu di Sheets.
 * Tab tersembunyi (Kartu Stok) tidak punya gid publik, jadi tautannya jatuh ke
 * spreadsheet tanpa anchor.
 */
export const TAB_GIDS = {
  master: 1582778964,
  penerimaan: 1439568414,
  distribusi: 1861623006,
  pemusnahan: 2097351299,
  kartuStok: null,
};

const STORAGE_KEY = 'reagensia:settings:v1';

function readStored() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

function deepMerge(base, patch) {
  const out = { ...base };
  for (const [key, value] of Object.entries(patch || {})) {
    out[key] = value && typeof value === 'object' && !Array.isArray(value)
      ? deepMerge(base[key] || {}, value)
      : value;
  }
  return out;
}

export const CONFIG = deepMerge(DEFAULTS, readStored());

export function saveSettings(patch) {
  const merged = deepMerge(readStored(), patch);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
  Object.assign(CONFIG, deepMerge(DEFAULTS, merged));
  return CONFIG;
}

export function resetSettings() {
  localStorage.removeItem(STORAGE_KEY);
  Object.assign(CONFIG, structuredClone(DEFAULTS));
  return CONFIG;
}

/** Mode input hanya aktif kalau endpoint terisi *dan* pengguna menyalakannya. */
export function canWrite() {
  return Boolean(CONFIG.endpoint.url && CONFIG.writeEnabled);
}

export function sheetUrl(tabKey, row) {
  const gid = TAB_GIDS[tabKey];
  const base = `https://docs.google.com/spreadsheets/d/${CONFIG.spreadsheetId}/edit`;
  if (gid == null) return base;
  return row ? `${base}#gid=${gid}&range=A${row}` : `${base}#gid=${gid}`;
}
