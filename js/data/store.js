/**
 * Sumber kebenaran tunggal untuk data di layar.
 *
 * Polanya stale-while-revalidate: gambar dulu dari cache (atau snapshot bawaan
 * kalau ini kunjungan pertama), baru ambil data baru di belakang layar. Kalau
 * pengambilan gagal, tampilan lama tetap berdiri dengan penanda offline —
 * dashboard tidak pernah berubah jadi layar kosong hanya karena jaringan mati.
 */

import { CONFIG } from '../config.js';
import { fetchAll } from './sheets.js';
import { normalize } from './normalize.js';
import { summarize } from './analytics.js';

const CACHE_KEY = 'reagensia:cache:v1';
const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** Date tidak selamat melewati JSON, jadi ditandai eksplisit saat disimpan. */
function replacer(_key, value) {
  return this[_key] instanceof Date ? { __date: this[_key].toISOString() } : value;
}

function reviver(_key, value) {
  if (value && typeof value === 'object' && typeof value.__date === 'string') {
    return new Date(value.__date);
  }
  return value;
}

const listeners = new Set();

export const store = {
  status: 'idle', // idle | loading | ready | error
  source: null, // live | cache | snapshot
  tables: null,
  data: null,
  summary: null,
  fetchedAt: null,
  errors: [],
  warnings: [],
  offline: false,
  message: '',
};

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit() {
  for (const fn of listeners) fn(store);
}

/** Hitung ulang record turunan — dipanggil juga saat ambang risiko diubah. */
export function recompute() {
  if (!store.tables) return;
  store.data = normalize(store.tables, { thresholds: CONFIG.thresholds });
  store.summary = summarize(store.data);
  emit();
}

function applyTables(tables, { source, fetchedAt, warnings = [], errors = [] }) {
  store.tables = tables;
  store.source = source;
  store.fetchedAt = fetchedAt;
  store.warnings = warnings;
  store.errors = errors;
  store.status = 'ready';
  recompute();
}

function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw, reviver);
    if (!parsed?.tables || !parsed.fetchedAt) return null;
    if (Date.now() - new Date(parsed.fetchedAt).getTime() > CACHE_MAX_AGE_MS) return null;
    if (parsed.spreadsheetId !== CONFIG.spreadsheetId) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(tables, fetchedAt) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(
      { spreadsheetId: CONFIG.spreadsheetId, tables, fetchedAt },
      replacer,
    ));
  } catch {
    // Kuota localStorage penuh atau mode privat — cache memang opsional.
  }
}

export function clearCache() {
  try { localStorage.removeItem(CACHE_KEY); } catch { /* diabaikan */ }
}

async function readSnapshot() {
  try {
    const res = await fetch('data/snapshot.json', { cache: 'no-cache' });
    if (!res.ok) return null;
    const parsed = JSON.parse(await res.text(), reviver);
    return parsed?.tables ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Muat data. Menggambar secepat mungkin dari sumber lokal, lalu menyegarkan
 * dari Google Sheets.
 */
export async function load({ force = false } = {}) {
  if (store.status === 'idle') {
    const cached = readCache();
    if (cached) {
      applyTables(cached.tables, { source: 'cache', fetchedAt: new Date(cached.fetchedAt) });
    } else {
      const snap = await readSnapshot();
      if (snap) {
        applyTables(snap.tables, { source: 'snapshot', fetchedAt: new Date(snap.fetchedAt) });
      }
    }
  }

  const hadData = Boolean(store.tables);
  if (!hadData) store.status = 'loading';
  store.message = hadData ? 'Menyegarkan…' : 'Menghubungkan ke Google Sheets…';
  emit();

  try {
    const result = await fetchAll(CONFIG.spreadsheetId, { bust: force });

    // Kalau semua tab gagal, ini kegagalan jaringan — bukan sheet kosong.
    if (result.errors.length === Object.keys(result.tables).length) {
      throw new Error(result.errors[0]?.message || 'Tidak bisa menghubungi Google Sheets.');
    }

    // Tab yang gagal sendirian jangan menghapus versi cache-nya.
    const merged = { ...result.tables };
    for (const [key, value] of Object.entries(merged)) {
      if (value === null && store.tables?.[key]) merged[key] = store.tables[key];
    }

    applyTables(merged, {
      source: 'live',
      fetchedAt: result.fetchedAt,
      warnings: result.warnings,
      errors: result.errors,
    });
    store.offline = false;
    store.message = '';
    writeCache(merged, result.fetchedAt);
  } catch (err) {
    store.offline = true;
    store.message = err?.message || String(err);
    if (!hadData) {
      store.status = 'error';
    }
  }

  emit();
  return store;
}

/** Sisipkan baris hasil input sebelum penyegaran berikutnya selesai. */
export function appendOptimistic(tabKey, row) {
  if (!store.tables?.[tabKey]) return;
  store.tables[tabKey] = [...store.tables[tabKey], { ...row, _optimistic: true }];
  recompute();
}

export function lastSyncLabel() {
  if (!store.fetchedAt) return 'Belum pernah sinkron';
  const label = store.fetchedAt.toLocaleString('id-ID', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });
  const prefix = { live: 'Sinkron', cache: 'Dari cache', snapshot: 'Data bawaan' }[store.source] || 'Sinkron';
  return `${prefix} ${label}`;
}
