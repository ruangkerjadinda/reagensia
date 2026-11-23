/**
 * Notifikasi di dalam dashboard: apa yang **berubah** sejak kunjungan terakhir.
 *
 * Halaman Kedaluwarsa dan Alert sudah menampilkan angka hari ini. Yang tidak
 * ditampilkan di mana pun adalah pergerakannya — "98 lot kedaluwarsa" terlihat
 * sama persis hari ini dan minggu depan, padahal tiga di antaranya baru lewat
 * tanggal kemarin. Angka yang tidak pernah berubah berhenti dibaca, dan itulah
 * yang membuat sesuatu yang penting jadi tidak terlihat.
 *
 * Jadi yang dicatat bukan jumlahnya, melainkan **kunci lot mana saja** yang
 * sudah pernah dilihat. Lot yang belum pernah ada di catatan itu adalah lot
 * yang baru melewati ambang.
 *
 * Catatannya di localStorage, jadi per peramban. Itu memang yang diinginkan:
 * "sejak terakhir *saya* melihat", bukan sejak orang lain melihat. Yang butuh
 * kabar tanpa membuka dashboard sama sekali dilayani surel mingguan di
 * `apps-script/Notifikasi.gs`.
 */

import { BUCKET } from './normalize.js';

const KUNCI = 'reagensia:notifikasi:v1';

/**
 * Lot yang layak dikabarkan.
 *
 * Aturannya **sama persis dengan surel mingguan**: sudah lewat tanggal atau
 * masuk ambang kritis, dan sisanya masih ada. Lot yang sisanya nol tidak perlu
 * ditarik dari rak, jadi mengabarkannya hanya memanjangkan daftar dengan baris
 * yang tidak bisa ditindaklanjuti. Dua sumber kabar yang memakai aturan
 * berbeda akan menghasilkan dua angka berbeda untuk hal yang sama, dan yang
 * membacanya tidak punya cara tahu mana yang benar.
 */
function layakDikabarkan(lot) {
  if (lot.sisaStok <= 0) return false;
  return lot.isExpired || lot.bucket === BUCKET.CRITICAL;
}

function baca() {
  try {
    const mentah = localStorage.getItem(KUNCI);
    if (!mentah) return null;
    const isi = JSON.parse(mentah);
    if (!isi || !Array.isArray(isi.kunci)) return null;
    return isi;
  } catch {
    // localStorage bisa dimatikan, penuh, atau isinya rusak. Tidak ada yang
    // perlu diributkan: tanpa catatan, notifikasinya cuma tidak tampil.
    return null;
  }
}

/**
 * @returns {{pertamaKali: boolean, baru: object[], sejak: Date|null, kunciSekarang: string[]}}
 */
export function perubahanSejakTerakhir(data) {
  const perlu = data.lots.filter(layakDikabarkan);
  const kunciSekarang = perlu.map((l) => l.key);

  const simpan = baca();
  if (!simpan) return { pertamaKali: true, baru: [], sejak: null, kunciSekarang };

  const dulu = new Set(simpan.kunci);
  const baru = perlu.filter((l) => !dulu.has(l.key));
  const sejak = simpan.tanggal ? new Date(simpan.tanggal) : null;

  return {
    pertamaKali: false,
    baru: baru.sort((a, b) => (a.daysToExpiry ?? 0) - (b.daysToExpiry ?? 0)),
    sejak: sejak && !Number.isNaN(sejak.getTime()) ? sejak : null,
    kunciSekarang,
  };
}

/** Tandai keadaan sekarang sebagai "sudah dilihat". */
export function tandaiDilihat(kunciSekarang) {
  try {
    localStorage.setItem(KUNCI, JSON.stringify({
      tanggal: new Date().toISOString(),
      kunci: kunciSekarang,
    }));
    return true;
  } catch {
    return false;
  }
}

/** Lupakan catatannya; kunjungan berikutnya jadi "pertama kali" lagi. */
export function lupakanTanda() {
  try {
    localStorage.removeItem(KUNCI);
    return true;
  } catch {
    return false;
  }
}
