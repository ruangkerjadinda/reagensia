/**
 * Klien Google Visualization API untuk spreadsheet publik.
 *
 * Endpoint gviz mengirim header CORS, jadi halaman statis bisa membaca langsung
 * tanpa backend apa pun. Kita memakai `out:json` dan bukan `out:csv` karena JSON
 * mengembalikan nilai bertipe: tanggal datang sebagai "Date(2025,5,30)" dan angka
 * sebagai angka. Versi CSV hanya mengirim teks hasil format sheet, yang di
 * workbook ini bercampur bulan Indonesia dan Inggris (Okt/Agu/Mei/Des di sebelah
 * Jun/Sep/Jan) — seluruh kelas bug parsing itu hilang dengan JSON.
 */

import { SCHEMA, FIRST_DATA_ROW, resolveColumns } from './schema.js';

const TIMEOUT_MS = 25000;
const RETRIES = 1;

function gvizUrl(spreadsheetId, sheetName, bust) {
  const params = new URLSearchParams({ tqx: 'out:json', sheet: sheetName });
  if (bust) params.set('_', String(Date.now()));
  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?${params}`;
}

/**
 * gviz membungkus payload dalam komentar sampah lalu
 * `google.visualization.Query.setResponse( … );` — ambil saja objek JSON di
 * antara kurung kurawal terluar.
 */
function unwrap(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) {
    throw new Error('Balasan Google Sheets tidak dikenali.');
  }
  return JSON.parse(text.slice(start, end + 1));
}

/** "Date(2025,5,30)" — bulan 0-based, seperti konstruktor Date JavaScript. */
const DATE_RE = /^Date\((\d+),(\d+),(\d+)(?:,(\d+),(\d+),(\d+))?\)$/;

function coerce(cell, type) {
  if (cell == null || cell.v == null || cell.v === '') return null;
  if (type === 'date' || type === 'datetime') {
    const m = DATE_RE.exec(String(cell.v));
    if (!m) return null;
    const [, y, mo, d, h, mi, s] = m;
    return new Date(+y, +mo, +d, +(h || 0), +(mi || 0), +(s || 0));
  }
  if (type === 'number') return typeof cell.v === 'number' ? cell.v : Number(cell.v);
  if (type === 'boolean') return Boolean(cell.v);
  return String(cell.v);
}

/**
 * Ambil satu tab dan kembalikan baris yang sudah dipetakan ke nama field kanonis.
 *
 * @returns {Promise<{rows: object[], warnings: string[], cols: object[]}>}
 */
export async function fetchTab(spreadsheetId, tabKey, options = {}) {
  // Satu tab yang lambat sesekali kena batas waktu; sekali ulang jauh lebih
  // murah daripada menampilkan seluruh dashboard sebagai gagal.
  let lastError;
  for (let attempt = 0; attempt <= RETRIES; attempt += 1) {
    try {
      return await fetchTabOnce(spreadsheetId, tabKey, options);
    } catch (err) {
      lastError = err;
      if (options.signal?.aborted) throw err;
      if (attempt < RETRIES) await new Promise((r) => { setTimeout(r, 600); });
    }
  }
  throw lastError;
}

async function fetchTabOnce(spreadsheetId, tabKey, { bust = false, signal } = {}) {
  const spec = SCHEMA[tabKey];
  if (!spec) throw new Error(`Tab tidak dikenal: ${tabKey}`);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort);

  try {
    let res;
    try {
      res = await fetch(gvizUrl(spreadsheetId, spec.tab, bust), {
        signal: controller.signal,
        cache: bust ? 'no-store' : 'default',
      });
    } catch (err) {
      // "Failed to fetch" tidak memberi tahu apa pun yang bisa ditindaklanjuti.
      if (err?.name === 'AbortError') throw new Error(`Tab "${spec.tab}" tidak menjawab dalam ${TIMEOUT_MS / 1000} detik.`);
      throw new Error('Google Sheets tidak bisa dihubungi. Periksa sambungan internet.');
    }
    if (!res.ok) throw new Error(`HTTP ${res.status} saat membaca tab "${spec.tab}".`);

    const payload = unwrap(await res.text());
    if (payload.status === 'error') {
      const detail = payload.errors?.map((e) => e.detailed_message || e.message).join('; ');
      throw new Error(`Google Sheets menolak permintaan: ${detail || 'sebab tidak diketahui'}`);
    }

    const cols = payload.table?.cols || [];
    const { index, warnings } = resolveColumns(tabKey, cols);
    const fieldEntries = Object.entries(index);

    const rows = (payload.table?.rows || []).map((row, i) => {
      const cells = row?.c || [];
      const out = {
        /** Nomor baris di sheet asli, untuk tautan balik. */
        _row: i + (FIRST_DATA_ROW[tabKey] ?? 2),
        _tab: tabKey,
      };
      for (const [field, colIndex] of fieldEntries) {
        const type = spec.fields[field].type || cols[colIndex]?.type;
        out[field] = coerce(cells[colIndex], type);
        if (typeof out[field] === 'string') out[field] = out[field].trim();
      }
      return out;
    });

    return { rows, warnings, cols };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}


/** Ambil semua tab secara paralel. Kegagalan satu tab tidak menjatuhkan yang lain. */
export async function fetchAll(spreadsheetId, options = {}) {
  const keys = Object.keys(SCHEMA);
  const settled = await Promise.allSettled(keys.map((k) => fetchTab(spreadsheetId, k, options)));

  const tables = {};
  const warnings = [];
  const errors = [];

  settled.forEach((result, i) => {
    const key = keys[i];
    if (result.status === 'fulfilled') {
      tables[key] = result.value.rows;
      warnings.push(...result.value.warnings);
    } else {
      tables[key] = null;
      errors.push({ tab: SCHEMA[key].tab, message: result.reason?.message || String(result.reason) });
    }
  });

  return { tables, warnings, errors, fetchedAt: new Date() };
}
