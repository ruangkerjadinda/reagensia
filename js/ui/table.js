/**
 * Tabel data: kepala lengket, pengurutan klik, dan kaki berisi jumlah baris
 * plus tombol unduh CSV.
 *
 * Komponennya mengurus pengurutan sendiri supaya halaman pemanggil cukup
 * memberi baris dan definisi kolom.
 */

import { el, mount, empty, fmtNum } from './dom.js';
import { downloadCsv } from './export.js';

/**
 * @param {object} config
 * @param {Array<{key:string,label:string,get?:Function,render?:Function,align?:'num',
 *                sortable?:boolean,className?:string,csv?:Function}>} config.columns
 * @param {Array<object>} config.rows
 * @param {{key:string,dir:1|-1}} [config.sort]
 * @param {Function} [config.onRowClick]
 * @param {object} [config.emptyState]
 * @param {string} [config.csvName]
 * @param {Function} [config.rowDataset]
 */
export function dataTable(config) {
  const {
    columns, rows, onRowClick, emptyState, csvName = 'data',
    rowDataset, foot, maxHeight,
  } = config;

  let sort = config.sort || null;

  const thead = el('thead');
  const tbody = el('tbody');
  const table = el('table.data', {}, thead, tbody);
  const wrap = el('div.table-wrap', { style: maxHeight ? { maxHeight } : {} }, table);
  const countEl = el('span');

  function valueOf(row, col) {
    return col.get ? col.get(row) : row[col.key];
  }

  function sorted() {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col) return rows;
    // Salinan supaya urutan asli (nomor baris sheet) tidak ikut teracak.
    return [...rows].sort((a, b) => {
      const av = valueOf(a, col);
      const bv = valueOf(b, col);
      const aEmpty = av == null || av === '';
      const bEmpty = bv == null || bv === '';
      // Sel kosong selalu di bawah, ke arah pengurutan mana pun.
      if (aEmpty && bEmpty) return 0;
      if (aEmpty) return 1;
      if (bEmpty) return -1;
      return compare(av, bv) * sort.dir;
    });
  }

  function renderHead() {
    const tr = el('tr');
    for (const col of columns) {
      const sortable = col.sortable !== false;
      const active = sort && sort.key === col.key;
      const th = el('th', {
        dataset: { sortable: String(sortable) },
        class: col.align === 'num' ? 'num' : '',
        scope: 'col',
        title: col.title || (sortable ? `Urutkan menurut ${col.label}` : col.label),
        onclick: sortable ? () => {
          sort = active ? { key: col.key, dir: sort.dir === 1 ? -1 : 1 } : { key: col.key, dir: 1 };
          renderHead();
          renderBody();
        } : undefined,
      }, col.label,
      sortable ? el('span.sort-arrow', { text: active ? (sort.dir === 1 ? '▲' : '▼') : '↕', 'aria-hidden': 'true' }) : null);
      if (active) th.setAttribute('aria-sort', sort.dir === 1 ? 'ascending' : 'descending');
      tr.append(th);
    }
    mount(thead, tr);
  }

  function renderBody() {
    const list = sorted();
    countEl.textContent = `${fmtNum(list.length)} baris`;

    if (!list.length) {
      mount(tbody, el('tr', {}, el('td', {
        colSpan: columns.length,
        style: { padding: '0' },
      }, empty(emptyState || { title: 'Tidak ada data', body: 'Tidak ada baris yang cocok dengan filter ini.' }))));
      return;
    }

    const frag = document.createDocumentFragment();
    for (const row of list) {
      const tr = el('tr', {
        dataset: { clickable: onRowClick ? 'true' : 'false', ...(rowDataset ? rowDataset(row) : {}) },
        onclick: onRowClick ? () => onRowClick(row) : undefined,
        tabIndex: onRowClick ? 0 : undefined,
        onkeydown: onRowClick ? (e) => {
          if (e.key === 'Enter') { e.preventDefault(); onRowClick(row); }
        } : undefined,
      });
      for (const col of columns) {
        const td = el('td', { class: [col.align === 'num' ? 'num' : '', col.className || ''].filter(Boolean).join(' ') });
        const content = col.render ? col.render(row) : valueOf(row, col);
        if (content instanceof Node) td.append(content);
        else if (Array.isArray(content)) td.append(...content.filter(Boolean));
        else td.textContent = content == null || content === '' ? '—' : String(content);
        tr.append(td);
      }
      frag.append(tr);
    }
    mount(tbody, frag);
  }

  renderHead();
  renderBody();

  const footEl = el('div.table-foot', {},
    countEl,
    foot || null,
    el('span.spacer'),
    el('button.btn.btn--sm.btn--ghost.no-print', {
      type: 'button',
      text: '⭳ CSV',
      title: 'Unduh baris yang sedang tampil sebagai CSV',
      onclick: () => downloadCsv(`${csvName}.csv`, columns, sorted(), valueOf),
    }));

  return el('div', {}, wrap, footEl);
}

function compare(a, b) {
  if (a instanceof Date && b instanceof Date) return a - b;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'boolean' || typeof b === 'boolean') return (b ? 1 : 0) - (a ? 1 : 0);
  return String(a).localeCompare(String(b), 'id', { numeric: true, sensitivity: 'base' });
}
