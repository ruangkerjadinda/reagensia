/** Lapisan di atas halaman: laci detail, dialog, konfirmasi, dan toast. */

import { el, mount, btn } from './dom.js';

let openOverlay = null;

function trapFocus(container, onClose) {
  const previous = document.activeElement;

  const onKey = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key !== 'Tab') return;
    const focusable = container.querySelectorAll(
      'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
    );
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };

  document.addEventListener('keydown', onKey);
  return () => {
    document.removeEventListener('keydown', onKey);
    if (previous instanceof HTMLElement && document.contains(previous)) previous.focus();
  };
}

export function closeOverlay() {
  if (!openOverlay) return;
  openOverlay();
  openOverlay = null;
}

function present(node, { onClose } = {}) {
  closeOverlay();

  const close = () => {
    release();
    scrim.remove();
    node.remove();
    document.body.style.overflow = '';
    openOverlay = null;
    onClose?.();
  };

  const scrim = el('div.scrim', { onclick: close });
  document.body.append(scrim, node);
  document.body.style.overflow = 'hidden';

  const release = trapFocus(node, close);
  openOverlay = close;

  const target = node.querySelector('[data-autofocus]') || node.querySelector('button, input, select, textarea');
  target?.focus();

  return close;
}

/**
 * Laci detail di sisi kanan.
 * @param {{title:string, subtitle?:string, body:Node, actions?:Node[]}} config
 */
export function drawer({ title, subtitle, body, actions = [] }) {
  const node = el('aside.drawer', { role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    el('div.drawer-head', {},
      el('div', {}, el('h3', { text: title }), subtitle && el('p', { text: subtitle })),
      el('span.spacer', { style: { marginLeft: 'auto' } }),
      el('button.btn.btn--ghost.btn--sm', { type: 'button', text: '✕', 'aria-label': 'Tutup', onclick: () => closeOverlay() })),
    el('div.drawer-body', {}, body),
    actions.length ? el('div.drawer-foot', {}, ...actions) : null);

  return present(node);
}

/**
 * Dialog.
 *
 * Kembaliannya bukan sekadar fungsi tutup, melainkan pegangan yang bisa
 * mengganti isi dan tombolnya. Itu yang membuat alur dua langkah — isi form,
 * lalu periksa sebelum menyimpan — bisa tinggal di satu dialog yang sama.
 * Kalau langkah periksa memakai dialog terpisah, dialog form ikut tertutup dan
 * isian pengguna hilang begitu penyimpanan gagal.
 *
 * @returns {{close: Function, setBody: Function, setActions: Function, setTitle: Function}}
 */
export function modal({ title, subtitle, body, actions = [], onClose }) {
  const titleEl = el('h3', { text: title });
  const subtitleEl = el('p', { text: subtitle || '' });
  const bodyEl = el('div.modal-body', {}, body);
  const footEl = el('div.modal-foot', {}, ...actions);

  const node = el('div.modal', { role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    el('div.modal-head', {}, titleEl, subtitleEl),
    bodyEl,
    footEl);

  const close = present(node, { onClose });

  return {
    close,
    node,
    setTitle(nextTitle, nextSubtitle) {
      titleEl.textContent = nextTitle;
      subtitleEl.textContent = nextSubtitle || '';
      node.setAttribute('aria-label', nextTitle);
    },
    setBody(...children) {
      mount(bodyEl, ...children);
      bodyEl.scrollTop = 0;
    },
    setActions(...children) {
      mount(footEl, ...children);
      const auto = footEl.querySelector('[data-autofocus]');
      auto?.focus();
    },
  };
}

/**
 * Konfirmasi sebelum tindakan yang mengubah data.
 *
 * Isi dialog memuat rincian persis apa yang akan ditulis — bukan sekadar
 * "Anda yakin?" — karena yang ditulis adalah data inventaris laboratorium yang
 * dipakai orang lain.
 *
 * @returns {Promise<boolean>}
 */
export function confirmAction({ title, subtitle, body, confirmLabel = 'Lanjutkan', variant = 'primary' }) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    const cancel = btn('Batal', { onclick: () => { finish(false); closeOverlay(); } });
    const ok = btn(confirmLabel, {
      variant,
      onclick: () => { finish(true); closeOverlay(); },
    });
    ok.dataset.autofocus = 'true';

    modal({ title, subtitle, body, actions: [cancel, ok], onClose: () => finish(false) });
  });
}

/* ------------------------------------------------------------------- toast */

let toastHost = null;

export function toast(message, { tone = 'info', detail, timeout = 5000 } = {}) {
  if (!toastHost) {
    toastHost = el('div.toasts', { role: 'status', 'aria-live': 'polite' });
    document.body.append(toastHost);
  }

  const glyph = { ok: '✓', danger: '✕', warn: '▲', info: 'ℹ' }[tone] || 'ℹ';
  const node = el('div.toast', { dataset: { tone } },
    el('span', { text: glyph, 'aria-hidden': 'true' }),
    el('div', {}, el('strong', { text: message }), detail && el('p', { text: detail })));

  toastHost.append(node);
  if (timeout) setTimeout(() => node.remove(), timeout);
  return () => node.remove();
}

/** Baris "sebelum → sesudah" untuk dialog konfirmasi. */
export function diffRow(label, before, after) {
  return el('div.diff-row', {},
    el('span.diff-key', { text: label }),
    el('span.diff-val', { text: String(before) }),
    after !== undefined ? el('span.diff-arrow', { text: '→' }) : null,
    after !== undefined ? el('span.diff-val', { text: String(after) }) : null);
}

export function diffBlock(...rows) {
  return el('div.diff', {}, ...rows.filter(Boolean));
}

export { mount };
