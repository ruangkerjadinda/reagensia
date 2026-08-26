/** Tema: ikut sistem, atau dipaksa terang/gelap oleh pengguna. */

export function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'light' || theme === 'dark') root.dataset.theme = theme;
  else delete root.dataset.theme;
}

/** Warna bilah alamat di peramban seluler mengikuti permukaan halaman. */
export function syncMetaThemeColor() {
  const meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) return;
  const surface = getComputedStyle(document.body).backgroundColor;
  if (surface) meta.setAttribute('content', surface);
}
