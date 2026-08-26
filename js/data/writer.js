/**
 * Klien untuk Web App Apps Script (mode input).
 *
 * Content-Type sengaja "text/plain". Kalau dikirim sebagai application/json,
 * browser mendahuluinya dengan permintaan preflight OPTIONS — dan Apps Script
 * tidak bisa menjawab preflight, sehingga permintaan gagal kena CORS. Dengan
 * text/plain browser menganggapnya simple request dan mengirim langsung.
 *
 * Kontrak yang sama diimplementasikan apps-script/Code.gs dan tiruan lokal
 * tools/mock-endpoint.mjs, jadi seluruh alur form bisa diuji tanpa menyentuh
 * spreadsheet mana pun.
 */

import { CONFIG } from '../config.js';

const TIMEOUT_MS = 30000;

export class WriteError extends Error {
  constructor(message, code = 'UNKNOWN', detail = null) {
    super(message);
    this.name = 'WriteError';
    this.code = code;
    this.detail = detail;
  }
}

function newRequestId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return `req-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Date perlu dikirim sebagai ISO supaya Apps Script bisa menulis nilai tanggal asli. */
function serialize(value) {
  if (value instanceof Date) return { __date: value.toISOString() };
  if (Array.isArray(value)) return value.map(serialize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, serialize(v)]));
  }
  return value;
}

async function call(body, { signal } = {}) {
  const url = CONFIG.endpoint.url;
  if (!url) throw new WriteError('Endpoint Apps Script belum diatur.', 'NO_ENDPOINT');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(serialize(body)),
      signal: controller.signal,
      redirect: 'follow',
    });

    const text = await res.text();
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      // Apps Script mengembalikan halaman HTML kalau deployment salah izin.
      throw new WriteError(
        'Balasan endpoint bukan JSON. Biasanya berarti deployment Apps Script belum diatur ke akses "Anyone".',
        'BAD_RESPONSE',
        text.slice(0, 300),
      );
    }

    if (!res.ok || parsed.ok === false) {
      throw new WriteError(parsed.error || `HTTP ${res.status}`, parsed.code || 'SERVER', parsed.detail);
    }
    return parsed;
  } catch (err) {
    if (err instanceof WriteError) throw err;
    if (err?.name === 'AbortError') throw new WriteError('Permintaan melewati batas waktu.', 'TIMEOUT');
    // Pesan asli peramban untuk kegagalan jaringan ("Failed to fetch") tidak
    // memberi tahu apa pun yang bisa ditindaklanjuti pengguna.
    throw new WriteError(
      'Endpoint tidak bisa dihubungi. Periksa sambungan internet dan URL Web App di halaman Pengaturan.',
      'NETWORK',
      err?.message,
    );
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

/** Cek endpoint hidup dan tokennya diterima. */
export function ping() {
  return call({ action: 'ping', token: CONFIG.endpoint.token, requestId: newRequestId() });
}

/**
 * Kirim satu transaksi.
 *
 * requestId dipakai server untuk menolak kiriman ganda, jadi klik dobel tidak
 * pernah membuat dua baris.
 *
 * @param {'penerimaan.create'|'distribusi.create'|'pemusnahan.create'} action
 */
export function submit(action, payload, { requestId = newRequestId(), signal } = {}) {
  return call({
    action,
    payload,
    requestId,
    token: CONFIG.endpoint.token,
    actor: CONFIG.actor || 'dashboard',
  }, { signal });
}

/**
 * Kembalikan rumus `=J+K-L-M` pada baris Master Stok yang Sisa Stok-nya ditulis
 * manual. Hanya berjalan kalau diminta dari halaman Pengaturan.
 */
export function repairSisa({ dryRun = true } = {}) {
  return call({
    action: 'maintenance.repairSisa',
    payload: { dryRun },
    requestId: newRequestId(),
    token: CONFIG.endpoint.token,
    actor: CONFIG.actor || 'dashboard',
  });
}

export { newRequestId };
