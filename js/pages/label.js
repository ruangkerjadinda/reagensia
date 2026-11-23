/**
 * Cetak label stiker untuk ditempel di botol reagen.
 *
 * Bentuk labelnya sendiri ada di `js/ui/label.js` — dipakai bersama tombol
 * "Cetak label" di Kartu Stok, supaya stiker satuan dan stiker selembar tidak
 * pernah berbeda bentuk.
 *
 * **Kenapa pakai centang, bukan "cetak semua yang tampil".** Stiker dicetak
 * untuk botol yang baru datang, bukan untuk seluruh isi lemari. Mencetak 381
 * label karena filternya kelewat longgar menghabiskan satu rim kertas stiker
 * dan tidak bisa dibatalkan setelah keluar. Jadi yang dipilih harus disebut
 * satu per satu — dengan satu tombol "pilih semua yang tampil" untuk yang
 * memang mau begitu, setelah filternya disempitkan.
 *
 * Pilihannya disimpan di memori modul, bukan di URL: 60 nomor lot tidak muat
 * di tautan, dan pilihan setengah jadi bukan sesuatu yang perlu bisa dikirim
 * lewat pesan.
 */

import { el, mount, cardHead, chip, btn, notice, empty, fmtNum, fmtDate } from '../ui/dom.js';
import { dataTable } from '../ui/table.js';
import { router, setParams } from '../ui/router.js';
import { bucketChip } from '../ui/shared.js';
import { UKURAN_LABEL, ukuranLabel, perLembar, lembarLabel, cetakLabel } from '../ui/label.js';
import { bacaB3 } from '../data/b3.js';

export const meta = {
  title: 'Label',
  subtitle: 'Stiker mini untuk botol reagen',
  icon: 'label',
};

/** Pilihan bertahan selama sesi, termasuk saat berpindah halaman lalu kembali. */
const dipilih = new Set();

/** Banyak label yang digambar di pratinjau; sisanya cukup disebut jumlahnya. */
const BATAS_PRATINJAU = 60;

const HARI_BARU = 30;

export function render({ data }) {
  const params = router.params;
  const ukuran = ukuranLabel(params.ukuran);

  // Lot bisa hilang dari sheet di antara dua penyegaran. Membawa kuncinya
  // terus membuat hitungan "12 dipilih" tidak pernah cocok dengan yang
  // tercetak, jadi yang sudah tidak ada dibuang diam-diam.
  const kunciAda = new Set(data.lots.map((l) => l.key));
  for (const k of [...dipilih]) if (!kunciAda.has(k)) dipilih.delete(k);

  const tampil = saring(data.lots, params, data.today);
  const kotak = new Map();

  const hitungEl = el('span.label-hitung');
  const pratinjauEl = el('div.label-pratinjau');
  const catatanEl = el('div');
  const cetakBtn = btn('Cetak label', { icon: 'cetak', variant: 'primary', onclick: () => cetak(data, ukuran) });

  function segarkan() {
    const terpilih = urut(data.lots.filter((l) => dipilih.has(l.key)));
    const lembar = Math.ceil(terpilih.length / perLembar(ukuran)) || 0;

    hitungEl.textContent = terpilih.length
      ? `${fmtNum(terpilih.length)} label dipilih · ${ukuran.nama} · ${fmtNum(lembar)} lembar A4`
      : 'Belum ada yang dipilih';
    cetakBtn.disabled = !terpilih.length;

    mount(pratinjauEl, terpilih.length
      ? lembarLabel(terpilih.slice(0, BATAS_PRATINJAU), ukuran.key)
      : el('p.label-kosong', { text: 'Centang lot di tabel bawah untuk melihat labelnya di sini.' }));

    const sisa = terpilih.length - BATAS_PRATINJAU;
    const tanpaB3 = terpilih.filter((l) => !bacaB3(l.b3).sudahDiisi).length;
    mount(catatanEl,
      sisa > 0
        ? el('p.hint', { text: `Pratinjau menampilkan ${BATAS_PRATINJAU} label pertama; ${fmtNum(sisa)} sisanya tetap ikut tercetak.` })
        : null,
      // Bukan galat: kolom Simbol B3 belum diisi untuk reagen itu. Tapi orang
      // yang memegang stikernya tidak bisa membedakan "tidak berbahaya" dari
      // "belum diperiksa", jadi perbedaan itu disebutkan di sini.
      tanpaB3
        ? notice({
          tone: 'info',
          icon: 'info',
          title: `${fmtNum(tanpaB3)} dari ${fmtNum(terpilih.length)} label tanpa simbol B3`,
          body: 'Reagen itu belum punya isian di kolom Simbol B3 pada tab Daftar Kode, jadi labelnya tercetak tanpa simbol bahaya. Kosong di sini berarti "belum diisi", bukan "tidak berbahaya".',
        })
        : null);
  }

  const page = el('div.page');

  page.append(penyaring(data, params, ukuran));

  page.append(el('section.card', {},
    cardHead('Pratinjau', `Ukuran sebenarnya · ${ukuran.lebar} × ${ukuran.tinggi} mm · ${perLembar(ukuran)} label per lembar A4`,
      hitungEl,
      btn('Bersihkan pilihan', {
        variant: 'ghost',
        onclick: () => {
          dipilih.clear();
          for (const cb of kotak.values()) cb.checked = false;
          segarkan();
        },
      }),
      cetakBtn),
    catatanEl,
    pratinjauEl));

  page.append(el('section.card.card--flush', {},
    cardHead('Pilih lot', `${fmtNum(tampil.length)} lot cocok dengan filter`,
      btn(`Pilih semua yang tampil (${fmtNum(tampil.length)})`, {
        variant: 'ghost',
        disabled: !tampil.length,
        onclick: () => {
          for (const l of tampil) {
            dipilih.add(l.key);
            const cb = kotak.get(l.key);
            if (cb) cb.checked = true;
          }
          segarkan();
        },
      })),
    tampil.length ? tabel(tampil, kotak, segarkan) : empty({
      title: 'Tidak ada lot yang cocok',
      body: 'Longgarkan filter atau bersihkan kata kuncinya.',
    })));

  segarkan();
  return page;
}

/* ------------------------------------------------------------------ filter */

function saring(lots, params, today) {
  const q = String(params.q || '').trim().toLowerCase();
  const batas = today.getTime() - HARI_BARU * 86400000;

  return lots.filter((l) => {
    if (params.instalasi && l.instalasi !== params.instalasi) return false;
    if (params.baru === '1' && !(l.receipts || []).some((r) => r.tanggal && r.tanggal.getTime() >= batas)) return false;
    if (!q) return true;
    return [l.nama, l.kode, l.lot, l.merk, l.supplier].some((v) => String(v || '').toLowerCase().includes(q));
  });
}

const urut = (lots) => lots.slice().sort((a, b) => String(a.instalasi).localeCompare(String(b.instalasi))
  || String(a.nama).localeCompare(String(b.nama)));

function penyaring(data, params, ukuran) {
  const instalasi = [...new Set(data.lots.map((l) => l.instalasi).filter(Boolean))].sort();

  const cari = el('input.input', {
    type: 'search',
    value: params.q || '',
    placeholder: 'Cari reagen, kode, lot, merk…',
    'aria-label': 'Cari reagen',
  });
  let timer;
  cari.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => setParams({ q: cari.value }), 220);
  });

  return el('div.toolbar.no-print', {},
    el('div.search', {}, cari),

    el('select.select', {
      'aria-label': 'Semua instalasi',
      style: { width: 'auto' },
      onchange: (e) => setParams({ instalasi: e.target.value }),
    },
    el('option', { value: '', text: 'Semua instalasi' }),
    ...instalasi.map((v) => el('option', { value: v, text: v, selected: params.instalasi === v }))),

    el('div.seg', {},
      el('button', {
        type: 'button',
        text: 'Semua lot',
        'aria-pressed': String(params.baru !== '1'),
        onclick: () => setParams({ baru: '' }),
      }),
      el('button', {
        type: 'button',
        text: `Baru diterima (${HARI_BARU} hari)`,
        'aria-pressed': String(params.baru === '1'),
        onclick: () => setParams({ baru: '1' }),
      })),

    el('div.seg', { 'aria-label': 'Ukuran label' },
      ...Object.values(UKURAN_LABEL).map((u) => el('button', {
        type: 'button',
        text: u.nama,
        'aria-pressed': String(u.key === ukuran.key),
        onclick: () => setParams({ ukuran: u.key }),
      }))));
}

/* ------------------------------------------------------------------- tabel */

function tabel(lots, kotak, segarkan) {
  return dataTable({
    csvName: 'label-pilihan',
    maxHeight: '52vh',
    sort: { key: 'nama', dir: 1 },
    rows: urut(lots),
    columns: [
      {
        key: '_pilih',
        label: '',
        sortable: false,
        render: (l) => {
          const cb = el('input', {
            type: 'checkbox',
            checked: dipilih.has(l.key),
            'aria-label': `Pilih label untuk ${l.nama || l.kode}`,
          });
          cb.addEventListener('change', () => {
            if (cb.checked) dipilih.add(l.key);
            else dipilih.delete(l.key);
            segarkan();
          });
          kotak.set(l.key, cb);
          return cb;
        },
        csv: (l) => (dipilih.has(l.key) ? 'dipilih' : ''),
      },
      {
        key: 'nama',
        label: 'Reagen',
        className: 'wrap strong',
        render: (l) => el('div', {}, l.nama || '—',
          el('span.sub', { text: `${l.kode || 'tanpa kode'} · ${l.lot || 'tanpa lot'}` })),
        csv: (l) => l.nama,
      },
      { key: 'instalasi', label: 'Instalasi' },
      {
        key: 'expDate',
        label: 'Kedaluwarsa',
        render: (l) => (l.expDate ? fmtDate(l.expDate) : '—'),
        csv: (l) => (l.expDate ? fmtDate(l.expDate) : ''),
      },
      { key: 'bucket', label: 'Risiko', render: bucketChip, csv: (l) => l.bucket },
      { key: 'sisaStok', label: 'Sisa', align: 'num', render: (l) => fmtNum(l.sisaStok) },
      {
        key: 'b3',
        label: 'Simbol B3',
        get: (l) => bacaB3(l.b3).kunci.length,
        render: (l) => {
          const baca = bacaB3(l.b3);
          if (!baca.sudahDiisi) return chip('belum diisi', 'muted', 'Kolom Simbol B3 di tab Daftar Kode masih kosong untuk reagen ini');
          if (!baca.kunci.length) return chip('tanpa simbol', 'ok', baca.teks);
          return chip(`${baca.kunci.length} simbol`, 'warn', baca.teks);
        },
        csv: (l) => bacaB3(l.b3).teks,
      },
    ],
  });
}

/* ------------------------------------------------------------------- cetak */

function cetak(data, ukuran) {
  const terpilih = urut(data.lots.filter((l) => dipilih.has(l.key)));
  if (!terpilih.length) return;
  cetakLabel(terpilih, ukuran.key, `Label Reagen — ${terpilih.length} stiker ${ukuran.nama}`);
}
