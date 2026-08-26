/** Pembantu DOM dan pemformatan. Semua teks masuk lewat textContent, tidak ada innerHTML. */

/**
 * el('div.card', { onclick }, child, child…)
 *
 * Tag boleh membawa kelas gaya CSS: 'button.btn.btn--primary'.
 */
export function el(spec, props, ...children) {
  const [tag, ...classes] = String(spec).split('.');
  const node = document.createElement(tag || 'div');
  if (classes.length) node.className = classes.join(' ');

  for (const [key, value] of Object.entries(props || {})) {
    if (value == null || value === false) continue;
    if (key === 'class') node.className = `${node.className} ${value}`.trim();
    else if (key === 'text') node.textContent = String(value);
    else if (key === 'html') node.innerHTML = value; // hanya untuk SVG yang kita susun sendiri
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key === 'style' && typeof value === 'object') Object.assign(node.style, value);
    else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2), value);
    else if (key in node && key !== 'list') node[key] = value;
    else node.setAttribute(key, value === true ? '' : String(value));
  }

  append(node, children);
  return node;
}

function append(node, children) {
  for (const child of children.flat(Infinity)) {
    if (child == null || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

export function frag(...children) {
  const f = document.createDocumentFragment();
  append(f, children);
  return f;
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

export function mount(node, ...children) {
  clear(node);
  append(node, children);
  return node;
}

/* --------------------------------------------------------------- pemformatan */

const NUM = new Intl.NumberFormat('id-ID');

export const fmtNum = (v) => (v == null || Number.isNaN(v) ? '—' : NUM.format(v));

export function fmtDate(d, style = 'medium') {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return '—';
  const opts = style === 'short'
    ? { day: '2-digit', month: 'short' }
    : { day: '2-digit', month: 'short', year: 'numeric' };
  return d.toLocaleDateString('id-ID', opts);
}

export function fmtDateTime(d) {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** Untuk <input type="date">. */
export function toInputDate(d) {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function fromInputDate(value) {
  if (!value) return null;
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** "12 hari lagi" / "3 hari lalu" — arah waktu lebih cepat dibaca daripada angka telanjang. */
export function fmtDays(days) {
  if (days == null) return '—';
  if (days === 0) return 'hari ini';
  if (days > 0) return `${fmtNum(days)} hari lagi`;
  return `${fmtNum(Math.abs(days))} hari lalu`;
}

export const fmtPct = (v) => (v == null ? '—' : `${v}%`);

/* --------------------------------------------------------------- komponen kecil */

const TONE_GLYPH = {
  danger: '●',
  serious: '●',
  warn: '▲',
  watch: '◆',
  ok: '✓',
  muted: '○',
};

/**
 * Chip status selalu membawa ikon dan teks — warna tidak pernah jadi satu-satunya
 * penanda. Dipanggil dengan label kosong, ia jadi titik penanda murni; dalam hal
 * itu teksnya selalu sudah ada tepat di sebelahnya, jadi chipnya disembunyikan
 * dari pembaca layar agar tidak terbaca dua kali.
 */
export function chip(label, tone = 'muted', title) {
  const bare = !label;
  return el('span.chip', {
    dataset: { tone },
    title: title || label || undefined,
    'aria-hidden': bare ? 'true' : undefined,
  },
  el('span.chip-glyph', { text: TONE_GLYPH[tone] || '○', 'aria-hidden': 'true' }),
  label);
}

export function notice({ tone = 'info', glyph = 'ℹ', title, body, action }) {
  return el('div.notice', { dataset: { tone } },
    el('span.notice-glyph', { text: glyph, 'aria-hidden': 'true' }),
    el('div.notice-body', {},
      title && el('strong', { text: title }),
      body && el('p', { text: body })),
    action && el('span.spacer'),
    action);
}

export function empty({ glyph = '◍', title, body, action }) {
  return el('div.empty', {},
    el('div.empty-glyph', { text: glyph, 'aria-hidden': 'true' }),
    title && el('h4', { text: title }),
    body && el('p', { text: body }),
    action);
}

export function kpi({ label, value, suffix, note, tone, onclick, title }) {
  return el(onclick ? 'button.kpi' : 'div.kpi', {
    dataset: tone ? { tone } : {},
    onclick,
    title,
    type: onclick ? 'button' : undefined,
  },
  el('span.kpi-label', { text: label }),
  el('span.kpi-value', {}, String(value), suffix && el('small', { text: suffix })),
  note && el('span.kpi-note', {}, note));
}

export function sectionHead(title, subtitle, ...actions) {
  return el('div.section-head', {},
    el('h3', { text: title }),
    subtitle && el('p', { text: subtitle }),
    actions.length ? el('span.spacer') : null,
    ...actions);
}

export function cardHead(title, subtitle, ...actions) {
  return el('div.card-head', {},
    el('h3', { text: title }),
    subtitle && el('p', { text: subtitle }),
    actions.length ? el('span.spacer') : null,
    ...actions);
}

export function btn(label, { variant = '', onclick, title, disabled, type = 'button' } = {}) {
  return el(`button.btn${variant ? `.btn--${variant}` : ''}`, { onclick, title, disabled, type, text: label });
}

/** Bilah horizontal berlabel — bentuk yang dipakai untuk semua distribusi satu seri. */
export function barRow({ label, chipEl, value, valueLabel, max, tone, onclick, color }) {
  const width = max > 0 ? Math.max((value / max) * 100, value > 0 ? 1.5 : 0) : 0;
  return el('div.bar-row', {
    dataset: { clickable: onclick ? 'true' : 'false', tone: tone || '' },
    onclick,
    role: onclick ? 'button' : undefined,
    tabIndex: onclick ? 0 : undefined,
    onkeydown: onclick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onclick(e); } } : undefined,
  },
  el('span.bar-label', {}, chipEl || null, el('span', { text: label, title: label })),
  el('div.bar-track', {}, el('div.bar-fill', { style: { width: `${width}%`, background: color || 'var(--series-1)' } })),
  el('span.bar-value', { text: valueLabel ?? fmtNum(value) }));
}

export function debounce(fn, ms = 200) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}
