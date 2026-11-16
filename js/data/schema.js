/**
 * Peta kolom tiap tab.
 *
 * Setiap tab transaksi punya blok judul: baris 1 banner, baris 2-3 kosong,
 * baris 4 judul kolom, data mulai baris 5. gviz biasanya menebak sendiri berapa
 * baris judul yang harus dilewati, tapi tebakannya gagal di tab Distribusi —
 * di sana ada dua angka nyasar di baris 2, dan gviz langsung menganggap data
 * dimulai di situ lalu mengembalikan seluruh label kolom sebagai string kosong.
 * Akibatnya setiap field jatuh ke pencocokan posisi dan tab itu terbaca geser.
 *
 * Karena itu jumlah baris judul tidak ditebak lagi: `headers` di bawah dikirim
 * apa adanya ke gviz (`&headers=4`). gviz lalu menggabungkan baris 1-4 jadi satu
 * label, jadi kolom pertama tetap datang sebagai "PENERIMAAN REAGEN No" dan
 * bukan "No" — pencocokan label memakai endsWith, bukan kesamaan persis, dan
 * kalau label tidak cocok sama sekali kita jatuh ke posisi kolom yang
 * dideklarasikan di `col`.
 *
 * Urutan field di bawah sengaja mengikuti urutan kolom di sheet: pencocokannya
 * rakus (field pertama yang cocok mengambil kolomnya), jadi urutan yang sama
 * membuat hasilnya gampang diperiksa dengan mata.
 */

export const SCHEMA = {
  master: {
    key: 'master',
    tab: 'Master Stok',
    label: 'Master Stok',
    headers: 4,
    fields: {
      no: { col: 'A', aliases: ['no'], type: 'number' },
      instalasi: { col: 'B', aliases: ['instalasi'] },
      kode: { col: 'C', aliases: ['kode'] },
      nama: { col: 'D', aliases: ['nama reagen'] },
      lot: { col: 'E', aliases: ['kode/lot', 'lot'] },
      expDate: { col: 'F', aliases: ['exp. date', 'exp date', 'expired date', 'expired'], type: 'date' },
      merk: { col: 'G', aliases: ['merk'] },
      supplier: { col: 'H', aliases: ['supplier'] },
      stokAwal: { col: 'I', aliases: ['stok awal'], type: 'number' },
      pembelian: { col: 'J', aliases: ['pembelian'], type: 'number' },
      // Dua sumber masuk yang ditambahkan pemilik sheet. Keduanya ikut
      // dihitung di rumus Sisa Stok, jadi harus ikut dihitung di sini juga.
      hibah: { col: 'K', aliases: ['hibah'], type: 'number' },
      titipan: { col: 'L', aliases: ['titipan daerah', 'titipan'], type: 'number' },
      distribusi: { col: 'M', aliases: ['distribusi'], type: 'number' },
      pemusnahan: { col: 'N', aliases: ['pemusnahan'], type: 'number' },
      sisaStok: { col: 'O', aliases: ['sisa stok'], type: 'number' },
      unit: { col: 'P', aliases: ['unit'] },
      stokMin: { col: 'Q', aliases: ['stok min'], type: 'number' },
      status: { col: 'R', aliases: ['status'] },
      lokasi: { col: 'S', aliases: ['lokasi'] },
      pic: { col: 'T', aliases: ['pic'] },
      peringatan: { col: 'U', aliases: ['peringatan'] },
    },
  },

  penerimaan: {
    key: 'penerimaan',
    tab: 'Penerimaan',
    label: 'Penerimaan',
    headers: 4,
    fields: {
      no: { col: 'A', aliases: ['no'], type: 'number' },
      tanggal: { col: 'B', aliases: ['tgl terima', 'tanggal terima'], type: 'date' },
      instalasi: { col: 'C', aliases: ['instalasi'] },
      kode: { col: 'D', aliases: ['kode'] },
      nama: { col: 'E', aliases: ['nama reagen'] },
      lot: { col: 'F', aliases: ['kode/lot', 'lot'] },
      expDate: { col: 'G', aliases: ['exp. date', 'exp date', 'expired date'], type: 'date' },
      merk: { col: 'H', aliases: ['merk'] },
      supplier: { col: 'I', aliases: ['supplier'] },
      qty: { col: 'J', aliases: ['qty'], type: 'number' },
      unit: { col: 'K', aliases: ['unit'] },
      pic: { col: 'L', aliases: ['pic'] },
      // Kategori sudah tidak ada lagi di Master Stok; tab inilah sumbernya
      // sekarang (Pembelian / Hibah / Titipan Daerah / Stok Awal).
      kategori: { col: 'M', aliases: ['kategori'] },
      linkCoa: { col: 'N', aliases: ['link coa'] },
      linkMsds: { col: 'O', aliases: ['link msds'] },
      statusCoa: { col: 'P', aliases: ['status coa'] },
      statusMsds: { col: 'Q', aliases: ['status msds'] },
      ket: { col: 'R', aliases: ['catatan', 'ket', 'keterangan'] },
      suhuSimpan: { col: 'S', aliases: ['suhu simpan'] },
      suhuTerima: { col: 'T', aliases: ['suhu saat terima'], type: 'number' },
      lokasiSimpan: { col: 'U', aliases: ['lokasi simpan'] },
      kondisiKemasan: { col: 'V', aliases: ['kondisi kemasan'] },
      statusPenerimaan: { col: 'W', aliases: ['status penerimaan'] },
      // Nomor BMN (Barang Milik Negara). Sengaja tanpa `type`: kolomnya
      // sekarang bertipe angka di sheet, tapi nomor BMN boleh saja berisi
      // huruf nanti — tanpa type, tipenya mengikuti apa yang dikirim gviz.
      kodeBmn: { col: 'X', aliases: ['kode bmn', 'bmn'] },
    },
  },

  distribusi: {
    key: 'distribusi',
    tab: 'Distribusi',
    label: 'Distribusi',
    headers: 4,
    fields: {
      no: { col: 'A', aliases: ['no'], type: 'number' },
      tanggal: { col: 'B', aliases: ['tgl distribusi', 'tanggal distribusi'], type: 'date' },
      instalasi: { col: 'C', aliases: ['instalasi'] },
      kode: { col: 'D', aliases: ['kode'] },
      nama: { col: 'E', aliases: ['nama reagen'] },
      lot: { col: 'F', aliases: ['kode/lot', 'lot'] },
      expDate: { col: 'G', aliases: ['expired date', 'exp. date'], type: 'date' },
      merk: { col: 'H', aliases: ['merk'] },
      kategori: { col: 'I', aliases: ['kategori'] },
      supplier: { col: 'J', aliases: ['supplier'] },
      qty: { col: 'K', aliases: ['qty keluar', 'qty'], type: 'number' },
      unit: { col: 'L', aliases: ['unit'] },
      picPengirim: { col: 'M', aliases: ['pic pengirim'] },
      picPenerima: { col: 'N', aliases: ['pic penerima'] },
      ket: { col: 'O', aliases: ['ket', 'keterangan', 'catatan'] },
    },
  },

  pemusnahan: {
    key: 'pemusnahan',
    tab: 'Pemusnahan',
    label: 'Pemusnahan',
    headers: 4,
    // Tab ini tidak punya kolom Kode sama sekali. Kodenya dicarikan di
    // normalize.js lewat pasangan Nama Reagen + Kode/Lot ke Master Stok.
    fields: {
      no: { col: 'A', aliases: ['no'], type: 'number' },
      instalasi: { col: 'B', aliases: ['instalasi'] },
      tanggal: { col: 'C', aliases: ['tgl musnah', 'tanggal musnah'], type: 'date' },
      nama: { col: 'D', aliases: ['nama reagen'] },
      lot: { col: 'E', aliases: ['kode/lot', 'lot'] },
      expDate: { col: 'F', aliases: ['expired date', 'exp. date'], type: 'date' },
      merk: { col: 'G', aliases: ['merk'] },
      supplier: { col: 'H', aliases: ['supplier'] },
      kategori: { col: 'I', aliases: ['kategori'] },
      alasan: { col: 'J', aliases: ['alasan musnah'] },
      qty: { col: 'K', aliases: ['qty'], type: 'number' },
      pic: { col: 'L', aliases: ['pic'] },
      ket: { col: 'M', aliases: ['ket', 'keterangan', 'catatan'] },
    },
  },

  kartuStok: {
    key: 'kartuStok',
    tab: 'Kartu Stok',
    label: 'Kartu Stok',
    // Tab ini satu-satunya yang tebakan gviz-nya sudah benar (banner baris 1,
    // judul baris 2, data baris 3+). Memaksa `headers` di sini justru merusak:
    // gviz lalu mengembalikan seluruh label kosong. Jadi dibiarkan ditebak.
    headers: undefined,
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

/**
 * Baris pertama data di sheet asli — dipakai untuk tautan balik ke Sheets.
 * Keempat tab utama punya judul di baris 4, jadi datanya mulai baris 5.
 */
export const FIRST_DATA_ROW = {
  master: 5,
  penerimaan: 5,
  distribusi: 5,
  pemusnahan: 5,
  kartuStok: 3,
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
      // Kolom cadangan yang sudah diambil field lain lebih berbahaya daripada
      // tidak ada kolom sama sekali: dua field akan membaca angka yang sama
      // tanpa ada satu pun yang terlihat salah.
      if (fallback < cols.length && !taken.has(fallback)) {
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
