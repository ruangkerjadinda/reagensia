/**
 * Meteran linier untuk satu persentase.
 *
 * Dipilih ketimbang donat: satu angka tunggal lebih cepat dibaca sebagai angka
 * besar dengan batang pendukung daripada sebagai potongan lingkaran.
 */

import { el, fmtNum } from '../ui/dom.js';

/**
 * @param {{label:string, part:number, whole:number, tone?:string, note?:string, onclick?:Function}} config
 */
export function meter({ label, part, whole, tone = 'info', note, onclick }) {
  const pctValue = whole ? Math.round((part / whole) * 1000) / 10 : 0;
  const color = {
    info: 'var(--series-1)',
    ok: 'var(--good)',
    warn: 'var(--warning)',
    danger: 'var(--critical)',
  }[tone] || 'var(--series-1)';

  return el(onclick ? 'button.kpi' : 'div.kpi', {
    type: onclick ? 'button' : undefined,
    onclick,
    title: `${label}: ${fmtNum(part)} dari ${fmtNum(whole)}`,
  },
  el('span.kpi-label', { text: label }),
  el('span.kpi-value', {}, `${pctValue}`, el('small', { text: '%' })),
  el('div.bar-track', { style: { marginTop: '6px', marginBottom: '4px' } },
    el('div.bar-fill', {
      style: {
        width: `${Math.min(pctValue, 100)}%`,
        background: `linear-gradient(90deg, color-mix(in srgb, ${color} 78%, transparent), ${color})`,
      },
    })),
  el('span.kpi-note', { text: note || `${fmtNum(part)} dari ${fmtNum(whole)}` }));
}
