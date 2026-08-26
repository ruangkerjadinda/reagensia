/**
 * Form input transaksi.
 *
 * Dua hal yang disengaja di sini:
 *
 * 1. Sebelum apa pun dikirim, muncul dialog yang menuliskan persis baris yang
 *    akan ditambahkan *dan* akibatnya pada Master Stok ("Sisa Stok 9 → 8").
 *    Yang ditulis adalah inventaris laboratorium yang dipakai orang lain, jadi
 *    "Anda yakin?" saja tidak cukup.
 * 2. Setiap kiriman membawa requestId. Server menolak requestId yang sama dua
 *    kali, sehingga klik ganda atau kirim ulang setelah jaringan putus tidak
 *    pernah menghasilkan dua baris.
 */

import { el, fmtNum, fmtDate, btn } from '../ui/dom.js';
import { modal, toast, diffBlock, diffRow } from '../ui/overlay.js';
import { buildForm } from '../ui/form.js';
import { submit, newRequestId, WriteError } from '../data/writer.js';
import { CONFIG } from '../config.js';
import { appendOptimistic, load } from '../data/store.js';

const KIND_META = {
  penerimaan: { label: 'Penerimaan', masterField: 'Pembelian', verb: 'menambah' },
  distribusi: { label: 'Distribusi', masterField: 'Distribusi', verb: 'mengurangi' },
  pemusnahan: { label: 'Pemusnahan', masterField: 'Pemusnahan', verb: 'mengurangi' },
};

const uniq = (lots, pick) => [...new Set(lots.map(pick).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'id'));

function lotGroups(lots) {
  const byInstalasi = new Map();
  for (const lot of lots) {
    const key = lot.instalasi || '(tanpa instalasi)';
    if (!byInstalasi.has(key)) byInstalasi.set(key, []);
    byInstalasi.get(key).push(lot);
  }
  return [...byInstalasi.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], 'id'))
    .map(([label, members]) => ({
      label,
      options: members
        .slice()
        .sort((a, b) => (a.nama || '').localeCompare(b.nama || '', 'id'))
        .map((l) => ({
          value: l.key,
          label: `${l.nama} — lot ${l.lot || '-'} — sisa ${l.sisaStok} ${l.unit || ''}`.trim(),
        })),
    }));
}

export function openTransactionForm(kind, { data, lot: preselected }) {
  const meta = KIND_META[kind];
  const lotsByKey = new Map(data.lots.map((l) => [l.key, l]));
  const isOutbound = kind !== 'penerimaan';

  const groups = lotGroups(isOutbound ? data.lots.filter((l) => l.sisaStok > 0) : data.lots);
  const lotField = {
    key: 'lotKey',
    label: 'Pilih lot',
    type: 'group-select',
    groups,
    required: isOutbound,
    span: 2,
    value: preselected?.key || '',
    placeholder: kind === 'penerimaan' ? '— lot baru (isi manual di bawah) —' : '— pilih lot —',
    hint: isOutbound
      ? 'Hanya lot dengan sisa stok di atas nol yang muncul di daftar ini.'
      : 'Kosongkan kalau reagen ini belum pernah tercatat; barisnya akan dibuat baru di Master Stok.',
  };

  const identity = [
    { key: 'instalasi', label: 'Instalasi', type: 'select', options: uniq(data.lots, (l) => l.instalasi), required: true },
    { key: 'kode', label: 'Kode', required: true },
    { key: 'nama', label: 'Nama reagen', required: true, span: 2 },
    { key: 'lot', label: 'Kode/Lot', required: kind !== 'penerimaan' },
    { key: 'expDate', label: 'Tanggal kedaluwarsa', type: 'date' },
    { key: 'merk', label: 'Merk' },
    { key: 'kategori', label: 'Kategori', type: 'select', options: uniq(data.lots, (l) => l.kategori) },
    { key: 'supplier', label: 'Supplier', type: 'select', options: uniq(data.lots, (l) => l.supplier), span: 2 },
  ];

  const perKind = {
    penerimaan: [
      { key: 'tanggal', label: 'Tanggal terima', type: 'date', required: true, value: new Date() },
      { key: 'qty', label: 'Jumlah diterima', type: 'number', required: true, min: 1 },
      { key: 'unit', label: 'Unit', type: 'select', options: uniq(data.lots, (l) => l.unit), required: true },
      { key: 'pic', label: 'PIC penerima', required: true, value: CONFIG.actor },
      { key: 'linkCoa', label: 'Tautan COA', placeholder: 'https://drive.google.com/…', span: 2 },
      { key: 'linkMsds', label: 'Tautan MSDS', placeholder: 'https://drive.google.com/…', span: 2 },
      { key: 'ket', label: 'Keterangan', span: 2 },
    ],
    distribusi: [
      { key: 'tanggal', label: 'Tanggal distribusi', type: 'date', required: true, value: new Date() },
      { key: 'qty', label: 'Jumlah keluar', type: 'number', required: true, min: 1 },
      { key: 'unit', label: 'Unit', type: 'select', options: uniq(data.lots, (l) => l.unit), required: true },
      { key: 'periodePakai', label: 'Periode pakai', type: 'select', options: uniq(data.issues, (r) => r.periodePakai) },
      { key: 'picPengirim', label: 'PIC pengirim', required: true, value: CONFIG.actor },
      { key: 'picPenerima', label: 'PIC penerima', required: true },
      { key: 'ket', label: 'Keterangan', span: 2 },
    ],
    pemusnahan: [
      { key: 'tanggal', label: 'Tanggal musnah', type: 'date', required: true, value: new Date() },
      { key: 'qty', label: 'Jumlah dimusnahkan', type: 'number', required: true, min: 1 },
      { key: 'unit', label: 'Unit', type: 'select', options: uniq(data.lots, (l) => l.unit), required: true },
      {
        key: 'alasan',
        label: 'Alasan pemusnahan',
        type: 'select',
        options: ['Kedaluwarsa', 'Rusak', 'Kemasan bocor', 'Terkontaminasi', 'Penyimpanan tidak sesuai'],
        required: true,
      },
      { key: 'metode', label: 'Metode pemusnahan', type: 'select', options: ['Insinerator', 'Pihak ketiga berizin', 'Netralisasi', 'Limbah B3'], required: true },
      { key: 'pic', label: 'PIC', required: true, value: CONFIG.actor },
      { key: 'lokasi', label: 'Lokasi', type: 'select', options: uniq(data.lots, (l) => l.lokasi) },
      { key: 'ket', label: 'Keterangan', span: 2 },
    ],
  }[kind];

  let currentLot = preselected || null;

  const form = buildForm([lotField, ...identity, ...perKind], {
    onChange(key, value, api) {
      if (key !== 'lotKey') return;
      currentLot = lotsByKey.get(value) || null;
      if (!currentLot) {
        api.setMax('qty', '');
        return;
      }
      for (const f of ['instalasi', 'kode', 'nama', 'lot', 'merk', 'kategori', 'supplier', 'unit']) {
        api.set(f, currentLot[f] ?? '');
      }
      api.set('expDate', currentLot.expDate || '');
      if (kind === 'pemusnahan') api.set('lokasi', currentLot.lokasi || '');
      if (isOutbound) api.setMax('qty', currentLot.sisaStok);
      renderStockHint();
    },
  });

  const stockHint = el('div', { style: { marginTop: '4px' } });

  function renderStockHint() {
    stockHint.replaceChildren();
    if (!currentLot) return;
    stockHint.append(diffBlock(
      diffRow('Lot', `${currentLot.kode} · ${currentLot.lot || 'tanpa lot'}`),
      diffRow('Sisa stok saat ini', `${fmtNum(currentLot.sisaStok)} ${currentLot.unit || ''}`.trim()),
      diffRow('Kedaluwarsa', currentLot.expDate ? fmtDate(currentLot.expDate) : 'belum diisi'),
    ));
  }

  if (preselected) {
    form.set('lotKey', preselected.key);
    for (const f of ['instalasi', 'kode', 'nama', 'lot', 'merk', 'kategori', 'supplier', 'unit']) {
      form.set(f, preselected[f] ?? '');
    }
    form.set('expDate', preselected.expDate || '');
    if (isOutbound) form.setMax('qty', preselected.sisaStok);
    renderStockHint();
  }

  /* ----------------------------------------------------- alur dua langkah */

  const formBody = el('div', {}, form.node, stockHint);
  const formTitle = `Tambah ${meta.label.toLowerCase()}`;
  const formSubtitle = 'Baris akan ditambahkan di akhir tab, dan kolom ringkasannya di Master Stok ikut disesuaikan.';

  const dialog = modal({
    title: formTitle,
    subtitle: formSubtitle,
    body: formBody,
    actions: [],
  });

  function showForm() {
    dialog.setTitle(formTitle, formSubtitle);
    dialog.setBody(formBody);
    dialog.setActions(
      btn('Batal', { onclick: () => dialog.close() }),
      btn('Periksa', {
        variant: 'primary',
        onclick: () => {
          const rules = [];
          if (isOutbound) {
            rules.push((v) => {
              if (!currentLot) return null;
              if (v.qty != null && v.qty > currentLot.sisaStok) {
                return { key: 'qty', text: `Sisa stok lot ini hanya ${fmtNum(currentLot.sisaStok)}.` };
              }
              return null;
            });
          }
          if (form.validate(rules)) showReview(form.values());
        },
      }),
    );
  }

  function showReview(values) {
    dialog.setTitle(
      'Periksa sebelum disimpan',
      'Setelah disimpan, baris ini ada di spreadsheet dan hanya bisa dibatalkan lewat Google Sheets.',
    );
    dialog.setBody(reviewBody(kind, values, currentLot));

    const back = btn('← Ubah lagi', { onclick: showForm });
    const save = btn('Simpan ke spreadsheet', {
      variant: kind === 'pemusnahan' ? 'danger' : 'primary',
      onclick: () => send(kind, values, currentLot, { dialog, save, back, showForm }),
    });
    save.dataset.autofocus = 'true';
    dialog.setActions(back, save);
  }

  showForm();
}

/** Rincian persis apa yang akan ditulis, sebelum ditulis. */
function reviewBody(kind, values, lot) {
  const meta = KIND_META[kind];
  const rows = [
    diffRow('Tab tujuan', meta.label),
    diffRow('Tanggal', values.tanggal ? fmtDate(values.tanggal) : '—'),
    diffRow('Instalasi', values.instalasi || '—'),
    diffRow('Reagen', `${values.nama} (${values.kode})`),
    diffRow('Lot', values.lot || '— belum diisi —'),
    diffRow('Jumlah', `${fmtNum(values.qty)} ${values.unit || ''}`.trim()),
  ];

  let effect;
  if (lot) {
    const delta = kind === 'penerimaan' ? values.qty : -values.qty;
    const column = kindColumn(kind);
    effect = diffBlock(
      diffRow(`Kolom ${meta.masterField}`, fmtNum(lot[column]), fmtNum(lot[column] + values.qty)),
      diffRow('Sisa Stok', fmtNum(lot.sisaStok), fmtNum(lot.sisaStok + delta)),
      diffRow('Baris Master Stok', String(lot._row)),
    );
  } else {
    effect = diffBlock(
      diffRow('Master Stok', 'baris baru akan dibuat'),
      diffRow('Stok Awal baris baru', fmtNum(values.qty)),
    );
  }

  return el('div', { style: { display: 'grid', gap: '14px' } },
    el('div', {},
      el('h4', { text: 'Baris yang ditambahkan', style: { fontSize: '12px', color: 'var(--ink-muted)', marginBottom: '6px' } }),
      diffBlock(...rows)),
    el('div', {},
      el('h4', { text: 'Akibat di Master Stok', style: { fontSize: '12px', color: 'var(--ink-muted)', marginBottom: '6px' } }),
      effect),
    lot && lot.sisaMismatch
      ? el('p', {
        style: { fontSize: '12px', color: 'var(--warning-ink)' },
        text: 'Catatan: Sisa Stok baris ini saat ini ditulis manual dan tidak cocok dengan hitungannya. Setelah transaksi ini disimpan, rumus =Stok Awal + Pembelian − Distribusi − Pemusnahan akan dipulihkan, sehingga angkanya bisa melompat ke nilai yang benar.',
      })
      : null);
}

function kindColumn(kind) {
  return { penerimaan: 'pembelian', distribusi: 'distribusi', pemusnahan: 'pemusnahan' }[kind];
}

async function send(kind, values, lot, { dialog, save, back, showForm }) {
  const requestId = newRequestId();
  const payload = { ...values };
  delete payload.lotKey;

  save.disabled = true;
  back.disabled = true;
  save.textContent = 'Menyimpan…';

  try {
    const result = await submit(`${kind}.create`, payload, { requestId });
    dialog.close();

    if (result.duplicate) {
      toast('Kiriman ini sudah tercatat sebelumnya', {
        tone: 'warn',
        detail: 'Server mengenali requestId yang sama, jadi tidak ada baris ganda yang dibuat.',
      });
    } else {
      const where = result.result?.row ? ` di baris ${result.result.row}` : '';
      toast(`${KIND_META[kind].label} tersimpan${where}`, {
        tone: 'ok',
        detail: result.result?.master
          ? `Master Stok baris ${result.result.master.row}: Sisa Stok ${result.result.master.sisaBefore} → ${result.result.master.sisaAfter}.`
          : 'Baris baru dibuat di Master Stok.',
      });
    }

    // Tampilkan segera, lalu ambil ulang untuk memastikan yang tampil sama
    // persis dengan isi spreadsheet.
    appendOptimistic(kind, { ...payload, _row: result.result?.row, _tab: kind });
    load({ force: true });
  } catch (err) {
    // Isian pengguna dikembalikan utuh — kegagalan simpan tidak boleh berarti
    // mengetik ulang semuanya.
    save.disabled = false;
    back.disabled = false;
    save.textContent = 'Simpan ke spreadsheet';
    showForm();

    const hint = err instanceof WriteError
      ? {
        NO_ENDPOINT: 'Endpoint Apps Script belum diisi di halaman Pengaturan.',
        TIMEOUT: 'Endpoint tidak menjawab dalam 30 detik. Baris mungkin tetap tersimpan — periksa spreadsheet sebelum mengirim ulang.',
        AUTH: 'Token ditolak server. Cocokkan dengan Script Property API_TOKEN.',
        LOCK: 'Ada penulisan lain yang sedang berjalan. Coba lagi sebentar lagi.',
      }[err.code]
      : null;

    toast('Gagal menyimpan', {
      tone: 'danger',
      detail: hint || (err instanceof WriteError ? err.message : String(err)),
      timeout: 12000,
    });
  }
}

