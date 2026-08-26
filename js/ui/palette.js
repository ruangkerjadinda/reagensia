/**
 * Palet perintah (Ctrl/Cmd-K).
 *
 * Isinya bukan cuma menu: seluruh lot ikut dicari, jadi mencari satu reagen di
 * antara ratusan lot tidak perlu lewat halaman inventori dulu.
 */

import { el, mount, fmtDate } from './dom.js';
import { allRoutes, go } from './router.js';
import { openLotDrawer } from './shared.js';

let open = false;
let teardown = null;

export function openPalette(getData) {
  if (open) return;
  open = true;

  const input = el('input', {
    type: 'text',
    placeholder: 'Cari halaman, reagen, kode, atau lot…',
    'aria-label': 'Pencarian cepat',
  });
  const list = el('div.palette-list', { role: 'listbox' });
  const panel = el('div.palette', { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Pencarian cepat' }, input, list);
  const scrim = el('div.palette-scrim', { onclick: close });

  let items = [];
  let cursor = 0;

  function buildItems(query) {
    const q = query.toLowerCase().trim();
    const data = getData();

    const pages = allRoutes()
      .filter((r) => !q || r.meta.title.toLowerCase().includes(q))
      .map((r) => ({
        label: r.meta.title,
        hint: 'Halaman',
        run: () => go(r.name),
      }));

    let lots = [];
    if (q.length >= 2 && data?.lots) {
      lots = data.lots
        .filter((l) => [l.nama, l.kode, l.lot, l.merk, l.supplier].filter(Boolean).join(' ').toLowerCase().includes(q))
        .slice(0, 12)
        .map((l) => ({
          label: `${l.nama || l.kode}`,
          hint: `${l.kode} · lot ${l.lot || '-'} · sisa ${l.sisaStok}${l.expDate ? ` · exp ${fmtDate(l.expDate)}` : ''}`,
          run: () => openLotDrawer(l),
        }));
    }

    return [...pages, ...lots];
  }

  function renderList() {
    mount(list, ...items.map((item, i) => el('button.palette-item', {
      type: 'button',
      role: 'option',
      'aria-selected': String(i === cursor),
      onclick: () => { close(); item.run(); },
      onmouseenter: () => { cursor = i; renderList(); },
    },
    el('span', { text: item.label }),
    el('span.hint', { text: item.hint }))));

    list.children[cursor]?.scrollIntoView({ block: 'nearest' });
  }

  function refresh() {
    items = buildItems(input.value);
    cursor = 0;
    renderList();
  }

  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); cursor = Math.min(cursor + 1, items.length - 1); renderList(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); cursor = Math.max(cursor - 1, 0); renderList(); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      const item = items[cursor];
      if (item) { close(); item.run(); }
    }
  }

  function close() {
    if (!open) return;
    open = false;
    document.removeEventListener('keydown', onKey, true);
    scrim.remove();
    panel.remove();
    teardown = null;
  }

  input.addEventListener('input', refresh);
  document.addEventListener('keydown', onKey, true);
  document.body.append(scrim, panel);
  refresh();
  input.focus();
  teardown = close;
}

export function closePalette() {
  teardown?.();
}

export function isPaletteOpen() {
  return open;
}
