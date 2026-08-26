/**
 * Tiruan lokal dari apps-script/Code.gs.
 *
 *   node tools/mock-endpoint.mjs
 *   → http://localhost:8787  (token: rahasia-uji)
 *
 * Gunanya menguji seluruh alur form — validasi, penolakan kiriman ganda,
 * pengurangan stok, kegagalan jaringan, dan pembatalan — tanpa menyentuh
 * spreadsheet mana pun. Kontraknya sengaja dibuat sama persis dengan Code.gs,
 * termasuk bentuk balasan galatnya.
 *
 * Data diambil dari data/snapshot.json dan hanya hidup di memori; setiap kali
 * server ini dijalankan ulang, semuanya kembali ke keadaan semula.
 *
 * Simulasi tambahan lewat variabel lingkungan:
 *   MOCK_LATENCY=1500   tunda tiap balasan (ms)
 *   MOCK_FAIL=1         selalu balas galat server
 *   MOCK_LOCK=1         selalu balas galat kunci
 */

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

const PORT = Number(process.env.MOCK_PORT || 8787);
const TOKEN = process.env.MOCK_TOKEN || 'rahasia-uji';
const LATENCY = Number(process.env.MOCK_LATENCY || 0);
const VERSION = '1.0.0-mock';

const snapshot = JSON.parse(await readFile(new URL('../data/snapshot.json', import.meta.url), 'utf8'));

const revive = (v) => (v && typeof v === 'object' && v.__date ? new Date(v.__date) : v);
const state = {
  master: snapshot.tables.master.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, revive(v)]))),
  penerimaan: [...snapshot.tables.penerimaan],
  distribusi: [...snapshot.tables.distribusi],
  pemusnahan: [...snapshot.tables.pemusnahan],
  log: [],
};

const seen = new Map();

const normKey = (kode, lot) => `${String(kode || '').toUpperCase().replace(/\s+/g, ' ').trim()}|${String(lot || '').toUpperCase().replace(/\s+/g, ' ').trim()}`;
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

class Fail extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

function requireFields(payload, fields) {
  const missing = fields.filter((f) => payload[f] === undefined || payload[f] === null || payload[f] === '');
  if (missing.length) throw new Fail('VALIDATION', `Kolom wajib belum diisi: ${missing.join(', ')}.`);
}

function findMaster(kode, lot) {
  const target = normKey(kode, lot);
  return state.master.find((r) => normKey(r.kode, r.lot) === target) || null;
}

function recompute(row) {
  row.sisaStok = num(row.stokAwal) + num(row.pembelian) - num(row.distribusi) - num(row.pemusnahan);
  row.lastUpdate = new Date();
  return row.sisaStok;
}

function nextRowNumber(tab) {
  const rows = state[tab];
  return rows.length ? Math.max(...rows.map((r) => num(r._row))) + 1 : 4;
}

const ACTIONS = {
  'penerimaan.create'(body) {
    const p = body.payload || {};
    requireFields(p, ['instalasi', 'kode', 'nama', 'qty', 'unit', 'pic', 'tanggal']);
    const qty = num(p.qty);
    if (qty <= 0) throw new Fail('VALIDATION', 'Jumlah harus lebih besar dari nol.');

    const row = nextRowNumber('penerimaan');
    state.penerimaan.push({ ...p, _row: row, _tab: 'penerimaan', qty });

    const master = findMaster(p.kode, p.lot);
    if (master) {
      const before = num(master.pembelian);
      const sisaBefore = num(master.sisaStok);
      master.pembelian = before + qty;
      const sisaAfter = recompute(master);
      return { tab: 'Penerimaan', row, master: { row: master._row, field: 'pembelian', before, after: master.pembelian, sisaBefore, sisaAfter } };
    }

    const created = {
      _row: nextRowNumber('master'),
      _tab: 'master',
      instalasi: p.instalasi, kode: p.kode, nama: p.nama, lot: p.lot || '',
      expDate: p.expDate ? new Date(p.expDate.__date || p.expDate) : null,
      merk: p.merk || '', kategori: p.kategori || '', supplier: p.supplier || '',
      stokAwal: qty, pembelian: 0, distribusi: 0, pemusnahan: 0,
      unit: p.unit, stokMin: 1, status: 'AKTIF', lokasi: p.lokasi || '', pic: p.pic,
    };
    recompute(created);
    state.master.push(created);
    return { tab: 'Penerimaan', row, master: { row: created._row, created: true, field: 'stokAwal', before: 0, after: qty, sisaBefore: 0, sisaAfter: created.sisaStok } };
  },

  'distribusi.create': (body) => outbound(body, 'distribusi', 'Distribusi'),
  'pemusnahan.create': (body) => outbound(body, 'pemusnahan', 'Pemusnahan'),

  'maintenance.repairSisa'(body) {
    const dryRun = body.payload?.dryRun !== false;
    // Snapshot tidak menyimpan info rumus, jadi yang ditiru di sini adalah
    // baris yang angkanya tidak cocok dengan hitungannya.
    const rows = state.master
      .filter((r) => r.kode && num(r.sisaStok) !== num(r.stokAwal) + num(r.pembelian) - num(r.distribusi) - num(r.pemusnahan))
      .map((r) => ({
        row: r._row,
        kode: r.kode,
        current: num(r.sisaStok),
        computed: num(r.stokAwal) + num(r.pembelian) - num(r.distribusi) - num(r.pemusnahan),
        changes: true,
      }));

    if (dryRun) return { rows, repaired: 0, dryRun: true };
    for (const r of rows) recompute(state.master.find((m) => m._row === r.row));
    return { rows, repaired: rows.length, dryRun: false };
  },
};

function outbound(body, field, tabLabel) {
  const p = body.payload || {};
  const isDisposal = field === 'pemusnahan';
  requireFields(p, isDisposal
    ? ['instalasi', 'kode', 'lot', 'nama', 'qty', 'unit', 'tanggal', 'alasan', 'metode', 'pic']
    : ['instalasi', 'kode', 'lot', 'nama', 'qty', 'unit', 'tanggal', 'picPengirim', 'picPenerima']);

  const qty = num(p.qty);
  if (qty <= 0) throw new Fail('VALIDATION', 'Jumlah harus lebih besar dari nol.');

  const master = findMaster(p.kode, p.lot);
  if (!master) throw new Fail('NOT_FOUND', `Lot ${p.kode} / ${p.lot} tidak ada di Master Stok, jadi stoknya tidak bisa dikurangi.`);
  if (qty > num(master.sisaStok)) {
    throw new Fail('VALIDATION', `Sisa stok lot ini tinggal ${master.sisaStok}, tidak cukup untuk ${qty}.`);
  }

  const row = nextRowNumber(field);
  state[field].push({ ...p, _row: row, _tab: field, qty });

  const before = num(master[field]);
  const sisaBefore = num(master.sisaStok);
  master[field] = before + qty;
  const sisaAfter = recompute(master);
  const result = { tab: tabLabel, row, master: { row: master._row, field, before, after: master[field], sisaBefore, sisaAfter } };

  if (sisaAfter <= 0) {
    master.status = 'TIDAK AKTIF';
    result.master.statusSetTo = 'TIDAK AKTIF';
  }
  return result;
}

function send(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

const server = createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return send(res, 204, {});

  if (req.method === 'GET') {
    return send(res, 200, { ok: true, version: VERSION, sheets: Object.keys(state), message: 'Tiruan Reagensia writer.' });
  }

  let raw = '';
  for await (const chunk of req) raw += chunk;

  if (LATENCY) await new Promise((r) => { setTimeout(r, LATENCY); });

  let body;
  try {
    body = JSON.parse(raw || '{}');
  } catch {
    return send(res, 200, { ok: false, code: 'BAD_REQUEST', error: 'Isi permintaan bukan JSON yang sah.' });
  }

  try {
    if (process.env.MOCK_FAIL) throw new Fail('SERVER', 'Galat buatan (MOCK_FAIL aktif).');
    if (process.env.MOCK_LOCK) throw new Fail('LOCK', 'Ada penulisan lain yang sedang berjalan. Coba lagi sebentar lagi.');

    if (body.action === 'ping') {
      if (String(body.token) !== TOKEN) throw new Fail('AUTH', 'Token ditolak.');
      return send(res, 200, { ok: true, version: VERSION, sheets: ['Master Stok', 'Penerimaan', 'Distribusi', 'Pemusnahan'] });
    }

    if (String(body.token) !== TOKEN) throw new Fail('AUTH', 'Token ditolak.');
    if (!body.requestId) throw new Fail('BAD_REQUEST', 'requestId wajib disertakan.');

    if (seen.has(body.requestId)) {
      return send(res, 200, { ok: true, duplicate: true, result: seen.get(body.requestId) });
    }

    const handler = ACTIONS[body.action];
    if (!handler) throw new Fail('BAD_REQUEST', `Aksi tidak dikenal: ${body.action}`);

    const result = handler(body);
    seen.set(body.requestId, result);
    state.log.push({ at: new Date(), action: body.action, actor: body.actor, requestId: body.requestId });
    console.log(`  ✓ ${body.action} → baris ${result.row}${result.master ? ` · Master baris ${result.master.row}: sisa ${result.master.sisaBefore} → ${result.master.sisaAfter}` : ''}`);

    return send(res, 200, { ok: true, action: body.action, result });
  } catch (err) {
    console.log(`  ✕ ${body?.action || '?'} → ${err.code || 'SERVER'}: ${err.message}`);
    return send(res, 200, { ok: false, code: err.code || 'SERVER', error: err.message });
  }
});

server.listen(PORT, () => {
  console.log(`Tiruan endpoint Reagensia berjalan di http://localhost:${PORT}`);
  console.log(`Token: ${TOKEN}`);
  console.log(`Master Stok dimuat: ${state.master.length} baris\n`);
});
