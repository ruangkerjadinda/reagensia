/**
 * Peta kolom tiap tab.
 *
 * gviz menempelkan baris judul ke label kolom pertama, jadi kolom A "Master Stok"
 * datang sebagai "INVENTORY STOK REAGEN (Real-time) No", bukan "No". Karena itu
 * pencocokan label dilakukan dengan endsWith, bukan kesamaan persis, dan kalau
 * label tidak cocok sama sekali kita jatuh ke posisi kolom yang dideklarasikan.
 */

export const SCHEMA = {
  master: {
    key: 'master',
    tab: 'Master Stok',
    label: 'Master Stok',
    fields: {
      no: { col: 'A', aliases: ['no'], type: 'number' },
      instalasi: { col: 'B', aliases: ['instalasi'] },
      kode: { col: 'C', aliases: ['kode'] },
      nama: { col: 'D', aliases: ['nama reagen'] },
      lot: { col: 'E', aliases: ['kode/lot', 'lot'] },
      expDate: { col: 'F', aliases: ['exp. date', 'exp date', 'expired date', 'expired'], type: 'date' },
      merk: { col: 'G', aliases: ['merk'] },
      kategori: { col: 'H', aliases: ['kategori'] },
      supplier: { col: 'I', aliases: ['supplier'] },
      stokAwal: { col: 'J', aliases: ['stok awal'], type: 'number' },
      pembelian: { col: 'K', aliases: ['pembelian'], type: 'number' },
      distribusi: { col: 'L', aliases: ['distribusi'], type: 'number' },
      pemusnahan: { col: 'M', aliases: ['pemusnahan'], type: 'number' },
      sisaStok: { col: 'N', aliases: ['sisa stok'], type: 'number' },
      unit: { col: 'O', aliases: ['unit'] },
      stokMin: { col: 'P', aliases: ['stok min'], type: 'number' },
      status: { col: 'Q', aliases: ['status'] },
      lokasi: { col: 'R', aliases: ['lokasi'] },
      lastUpdate: { col: 'S', aliases: ['last update'], type: 'date' },
      pic: { col: 'T', aliases: ['pic'] },
    },
  },

  penerimaan: {
    key: 'penerimaan',
    tab: 'Penerimaan',
    label: 'Penerimaan',
    fields: {
      no: { col: 'A', aliases: ['no'], type: 'number' },
      instalasi: { col: 'B', aliases: ['instalasi'] },
      kode: { col: 'C', aliases: ['kode'] },
      tanggal: { col: 'D', aliases: ['tgl terima', 'tanggal terima'], type: 'date' },
      nama: { col: 'E', aliases: ['nama reagen'] },
      lot: { col: 'F', aliases: ['kode/lot', 'lot'] },
      expDate: { col: 'G', aliases: ['exp. date', 'exp date', 'expired date'], type: 'date' },
      merk: { col: 'H', aliases: ['merk'] },
      kategori: { col: 'I', aliases: ['kategori'] },
      supplier: { col: 'J', aliases: ['supplier'] },
      qty: { col: 'K', aliases: ['qty'], type: 'number' },
      unit: { col: 'L', aliases: ['unit'] },
      pic: { col: 'M', aliases: ['pic'] },
      linkCoa: { col: 'N', aliases: ['link coa'] },
      linkMsds: { col: 'O', aliases: ['link msds'] },
      statusCoa: { col: 'P', aliases: ['status coa'] },
      statusMsds: { col: 'Q', aliases: ['status msds'] },
      ket: { col: 'R', aliases: ['ket', 'keterangan'] },
    },
  },

  distribusi: {
    key: 'distribusi',
    tab: 'Distribusi',
    label: 'Distribusi',
    fields: {
      no: { col: 'A', aliases: ['no'], type: 'number' },
      instalasi: { col: 'B', aliases: ['instalasi'] },
      kode: { col: 'C', aliases: ['kode'] },
      tanggal: { col: 'D', aliases: ['tgl distribusi', 'tanggal distribusi'], type: 'date' },
      nama: { col: 'E', aliases: ['nama reagen'] },
      lot: { col: 'F', aliases: ['kode/lot', 'lot'] },
      expDate: { col: 'G', aliases: ['expired date', 'exp. date'], type: 'date' },
      merk: { col: 'H', aliases: ['merk'] },
      kategori: { col: 'I', aliases: ['kategori'] },
      supplier: { col: 'J', aliases: ['supplier'] },
      qty: { col: 'K', aliases: ['qty keluar', 'qty'], type: 'number' },
      unit: { col: 'L', aliases: ['unit'] },
      periodePakai: { col: 'M', aliases: ['periode pakai'] },
      picPengirim: { col: 'N', aliases: ['pic pengirim'] },
      picPenerima: { col: 'O', aliases: ['pic penerima'] },
      ket: { col: 'P', aliases: ['ket', 'keterangan'] },
    },
  },

  pemusnahan: {
    key: 'pemusnahan',
    tab: 'Pemusnahan',
    label: 'Pemusnahan',
    fields: {
      no: { col: 'A', aliases: ['no'], type: 'number' },
      instalasi: { col: 'B', aliases: ['instalasi'] },
      kode: { col: 'C', aliases: ['kode'] },
      tanggal: { col: 'D', aliases: ['tgl musnah', 'tanggal musnah'], type: 'date' },
      nama: { col: 'E', aliases: ['nama reagen'] },
      lot: { col: 'F', aliases: ['kode/lot', 'lot'] },
      expDate: { col: 'G', aliases: ['expired date', 'exp. date'], type: 'date' },
      merk: { col: 'H', aliases: ['merk'] },
      kategori: { col: 'I', aliases: ['kategori'] },
      supplier: { col: 'J', aliases: ['supplier'] },
      alasan: { col: 'K', aliases: ['alasan musnah'] },
      qty: { col: 'L', aliases: ['qty'], type: 'number' },
      unit: { col: 'M', aliases: ['unit'] },
      metode: { col: 'N', aliases: ['metode pemusnahan'] },
      pic: { col: 'O', aliases: ['pic'] },
      lokasi: { col: 'P', aliases: ['lokasi'] },
      ket: { col: 'Q', aliases: ['ket', 'keterangan'] },
    },
  },

  kartuStok: {
    key: 'kartuStok',
    tab: 'Kartu Stok',
    label: 'Kartu Stok',
    fields: {
      no: { col: 'A', aliases: ['no'], type: 'number' },
      tanggal: { col: 'B', aliases: ['tanggal'], type: 'date' },
      instalasi: { col: 'C', aliases: ['instalasi'] },
      nama: { col: 'D', aliases: ['nama reagen'] },
      lot: { col: 'E', aliases: ['kode/lot', 'lot'] },
      expDate: { col: 'F', aliases: ['expired', 'expired date'], type: 'date' },
      merk: { col: 'G', aliases: ['merk'] },
      kategori: { col: 'H', aliases: ['kategori'] },
      supplier: { col: 'I', aliases: ['supplier'] },
      masuk: { col: 'J', aliases: ['in', 'masuk'], type: 'number' },
      keluar: { col: 'K', aliases: ['out', 'keluar'], type: 'number' },
      saldo: { col: 'L', aliases: ['balance', 'saldo'], type: 'number' },
      ket: { col: 'M', aliases: ['keterangan', 'ket'] },
      pic: { col: 'N', aliases: ['pic'] },
    },
  },
};

/** Baris pertama data di sheet asli — dipakai untuk tautan balik ke Sheets. */
export const FIRST_DATA_ROW = {
  master: 4,
  penerimaan: 4,
  distribusi: 5,
  pemusnahan: 5,
  kartuStok: 4,
};

const normalize = (s) => String(s ?? '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Ubah huruf kolom gviz ("A", "AB") ke indeks 0-based. */
export function colToIndex(col) {
  let n = 0;
  for (const ch of col.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/**
 * Cocokkan kolom gviz ke nama field kanonis.
 *
 * Label diprioritaskan supaya penambahan kolom di tengah sheet tidak merusak
 * pemetaan; posisi dipakai sebagai jaring pengaman kalau label sudah berubah
 * terlalu jauh.
 *
 * @returns {{index: Record<string, number>, warnings: string[]}}
 */
export function resolveColumns(tabKey, cols) {
  const spec = SCHEMA[tabKey];
  const labels = cols.map((c) => normalize(c.label));
  const index = {};
  const warnings = [];
  const taken = new Set();

  for (const [field, def] of Object.entries(spec.fields)) {
    const aliases = def.aliases || [field.toLowerCase()];
    let found = -1;

    for (let i = 0; i < labels.length; i += 1) {
      if (taken.has(i) || !labels[i]) continue;
      const hit = aliases.some((a) => labels[i] === a || labels[i].endsWith(` ${a}`));
      if (hit) { found = i; break; }
    }

    if (found === -1) {
      const fallback = colToIndex(def.col);
      if (fallback < cols.length) {
        found = fallback;
        warnings.push(`${spec.tab}: kolom "${field}" dicocokkan lewat posisi (${def.col}), bukan label.`);
      } else {
        warnings.push(`${spec.tab}: kolom "${field}" tidak ditemukan.`);
        continue;
      }
    }

    taken.add(found);
    index[field] = found;
  }

  return { index, warnings };
}
