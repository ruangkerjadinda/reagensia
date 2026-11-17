/**
 * Pemeriksaan yang GAGAL dengan berisik — dipakai CI.
 *
 * `verify-data.mjs` mencetak angka untuk dibaca manusia dan selalu keluar
 * dengan status 0. Berkas ini sebaliknya: ia hanya peduli pada hal-hal yang
 * kalau rusak tidak terlihat rusak, lalu keluar dengan status bukan-nol supaya
 * ada tanda merah.
 *
 * Tiga hal yang diperiksa, dan alasannya:
 *
 * 1. Sintaks setiap modul. Situs ini tanpa bundler dan tanpa build — berkas
 *    yang salah ketik baru ketahuan saat peramban gagal memuatnya, yaitu
 *    setelah terbit.
 *
 * 2. Pemetaan kolom. Ini kegagalan paling mahal di proyek ini: satu kolom
 *    dihapus di spreadsheet, pencocokan jatuh ke posisi, dan dashboard membaca
 *    kolom tetangganya tanpa ada yang merah. Pernah terjadi, berminggu-minggu.
 *    Satu peringatan saja di sini sudah cukup untuk menggagalkan.
 *
 * 3. Rekonsiliasi antar tab. Kolom ringkasan Master Stok sekarang rumus ke tab
 *    transaksi, jadi ketiganya harus cocok persis. Kalau meleset, entah ada
 *    rumus yang tertimpa angka ketikan, entah pemetaannya bergeser.
 *
 * Yang SENGAJA tidak digagalkan: temuan kualitas data (tanpa supplier, tanpa
 * lot, ejaan kembar). Itu pekerjaan pengisi sheet, bukan kesalahan kode, dan
 * menggagalkan CI karenanya cuma melatih orang mengabaikan warna merah.
 */

import { execFileSync } from 'node:child_process';
import { readdirSync, statSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { fetchAll } from '../js/data/sheets.js';
import { normalize } from '../js/data/normalize.js';
import { summarize } from '../js/data/analytics.js';
import { CONFIG } from '../js/config.js';

const problems = [];
const notes = [];

/* ----------------------------------------------------------- 1. sintaks */

function jsFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...jsFiles(path));
    else if (entry.endsWith('.js')) out.push(path);
  }
  return out;
}

const modules = [...jsFiles('js'), ...jsFiles('tools').filter((f) => f.endsWith('.mjs'))];
for (const file of modules) {
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
  } catch (err) {
    const detail = String(err.stderr || err.message).split('\n').slice(0, 4).join('\n');
    problems.push(`Sintaks gagal: ${file}\n${detail}`);
  }
}
notes.push(`${modules.length} modul diperiksa sintaksnya.`);

/* ------------------------------------------------- 2 & 3. lapisan data */

const { tables, warnings, errors } = await fetchAll(CONFIG.spreadsheetId, { bust: true });

for (const e of errors) {
  problems.push(`Tab "${e.tab}" tidak terbaca: ${e.message}`);
}

for (const w of new Set(warnings)) {
  problems.push(`Pemetaan kolom: ${w}`);
}

if (!errors.length) {
  const data = normalize(tables);
  const s = summarize(data);

  for (const r of s.reconciliation) {
    if (!r.ok) {
      problems.push(`Rekonsiliasi meleset — ${r.label}: ${r.transaksi} vs ${r.master} (selisih ${r.transaksi - r.master}).`);
    }
  }

  notes.push(`${s.totalLots} lot · ${s.totalReagen} reagen · ${s.totalStok} unit.`);
  notes.push(`Rekonsiliasi: ${s.reconciliation.map((r) => `${r.label} ${r.ok ? 'cocok' : 'MELESET'}`).join(' · ')}`);
  notes.push(`Kualitas data (tidak menggagalkan): ${s.audit.total} baris perlu dirapikan, ${s.audit.sisaMismatch.length} Sisa Stok tidak cocok, ${s.audit.orphans.length} baris transaksi tanpa induk.`);
}

/* ------------------------------------------------------------- laporan */

const lines = [];
lines.push(problems.length ? `## ❌ ${problems.length} masalah` : '## ✅ Semua pemeriksaan lolos');
lines.push('');
for (const p of problems) lines.push(`- ${p.replace(/\n/g, ' — ')}`);
if (problems.length) lines.push('');
for (const n of notes) lines.push(`- ${n}`);

const report = lines.join('\n');
console.log(report);

// Ringkasan yang sama ikut tampil di halaman hasil Actions, bukan cuma di log.
if (process.env.GITHUB_STEP_SUMMARY) {
  try {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${report}\n`);
  } catch {
    // Ringkasan cuma hiasan; kegagalan menulisnya tidak boleh menjatuhkan CI.
  }
}

process.exit(problems.length ? 1 : 0);
