/**
 * Kurva kedaluwarsa: satu batang per bulan untuk dua belas bulan ke depan,
 * ditambah satu batang tunggakan di kiri untuk semua lot yang sudah lewat.
 *
 * Dua seri, dua warna (biru untuk yang akan datang, merah untuk tunggakan) —
 * pasangan itu lolos validator di kedua mode. Keduanya juga diberi label
 * langsung dan legenda, jadi warna bukan satu-satunya pembawa arti.
 */

import { svgEl, barPath, niceTicks, attachTooltip } from './svg.js';
import { el, fmtNum } from '../ui/dom.js';

const PAD = { top: 18, right: 8, bottom: 34, left: 34 };
const HEIGHT = 210;

/**
 * @param {Array<{key,label,sublabel,count,qty,isBacklog,lots}>} series
 * @param {{onSelect?:Function, metric?:'count'|'qty'}} [options]
 */
export function expiryTimeline(series, { onSelect, metric = 'count' } = {}) {
  const width = Math.max(560, series.length * 46);
  const inner = { w: width - PAD.left - PAD.right, h: HEIGHT - PAD.top - PAD.bottom };
  const value = (d) => (metric === 'qty' ? d.qty : d.count);
  const max = Math.max(...series.map(value), 1);
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1] || 1;
  const y = (v) => PAD.top + inner.h - (v / top) * inner.h;

  const slot = inner.w / series.length;
  const barW = Math.max(slot - 8, 6); // sela 8px antar batang: dua kali spacer 4px

  const svg = svgEl('svg.chart', {
    viewBox: `0 0 ${width} ${HEIGHT}`,
    width,
    height: HEIGHT,
    role: 'img',
    'aria-label': `Sebaran kedaluwarsa: ${series.map((d) => `${d.label} ${value(d)}`).join(', ')}`,
  });

  // Gradien halus dari atas batang ke dasarnya: memberi kesan bahan tanpa
  // mengubah warna yang dibaca — puncak batanglah yang paling pekat, dan itu
  // justru bagian yang dipakai membandingkan tinggi.
  const defs = svgEl('defs');
  for (const [id, color] of [['grad-utama', 'var(--series-1)'], ['grad-tunggakan', 'var(--critical)']]) {
    defs.append(svgEl('linearGradient', { id, x1: '0', y1: '0', x2: '0', y2: '1' },
      svgEl('stop', { offset: '0%', 'stop-color': color, 'stop-opacity': '1' }),
      svgEl('stop', { offset: '100%', 'stop-color': color, 'stop-opacity': '0.72' })));
  }
  svg.append(defs);

  // Kisi resesif di belakang tanda.
  for (const t of ticks) {
    svg.append(svgEl('line.grid-line', { x1: PAD.left, x2: width - PAD.right, y1: y(t), y2: y(t) }));
    svg.append(svgEl('text.label-value', {
      x: PAD.left - 6, y: y(t) + 3.5, 'text-anchor': 'end', text: fmtNum(t),
    }));
  }

  const host = el('div.chart-scroll');
  const tip = attachTooltip(host);

  series.forEach((d, i) => {
    const v = value(d);
    const x = PAD.left + i * slot + (slot - barW) / 2;
    const h = (v / top) * inner.h;
    const fill = d.isBacklog ? 'url(#grad-tunggakan)' : 'url(#grad-utama)';

    if (h > 0) {
      const bar = svgEl('path.mark', {
        d: barPath(x, y(v), barW, h, 4),
        fill,
        onclick: onSelect ? () => onSelect(d) : undefined,
        style: onSelect ? 'cursor:pointer' : '',
      });
      bar.addEventListener('pointermove', (e) => tip.show(e, [
        d.isBacklog ? 'Sudah kedaluwarsa' : `${d.label} 20${d.sublabel}`,
        `${fmtNum(d.count)} lot · ${fmtNum(d.qty)} unit stok`,
        onSelect ? 'Klik untuk melihat daftarnya' : '',
      ].filter(Boolean)));
      bar.addEventListener('pointerleave', tip.hide);
      svg.append(bar);
    }

    // Label langsung hanya pada batang yang berisi — bukan angka di setiap titik.
    if (v > 0) {
      svg.append(svgEl('text', {
        x: x + barW / 2,
        y: y(v) - 5,
        'text-anchor': 'middle',
        class: d.isBacklog ? 'label-value label-strong' : 'label-value',
        text: fmtNum(v),
      }));
    }

    svg.append(svgEl('text', {
      x: x + barW / 2, y: HEIGHT - PAD.bottom + 15, 'text-anchor': 'middle',
      text: d.isBacklog ? 'Lewat' : d.label,
    }));
    if (d.sublabel && (d.isBacklog || d.label === 'Jan' || i === 1)) {
      svg.append(svgEl('text', {
        x: x + barW / 2, y: HEIGHT - PAD.bottom + 27, 'text-anchor': 'middle',
        'font-size': '10', text: d.isBacklog ? '' : `20${d.sublabel}`,
      }));
    }
  });

  // Garis nol digambar terakhir supaya menutup dasar batang dengan rapi.
  svg.append(svgEl('line.axis-line', {
    x1: PAD.left, x2: width - PAD.right, y1: y(0), y2: y(0),
  }));

  // Pemisah antara tunggakan dan bulan-bulan yang akan datang.
  if (series[0]?.isBacklog) {
    const divX = PAD.left + slot;
    svg.append(svgEl('line', {
      x1: divX, x2: divX, y1: PAD.top - 8, y2: HEIGHT - PAD.bottom + 4,
      stroke: 'var(--border-strong)', 'stroke-dasharray': '3 3',
    }));
  }

  host.append(svg);

  return el('div', {},
    host,
    el('div.legend', { style: { marginTop: '10px' } },
      el('span.legend-item', {},
        el('span.legend-swatch', { style: { background: 'var(--critical)' } }),
        'Sudah kedaluwarsa'),
      el('span.legend-item', {},
        el('span.legend-swatch', { style: { background: 'var(--series-1)' } }),
        'Akan kedaluwarsa'),
      el('span.legend-item', { style: { color: 'var(--ink-muted)' } },
        metric === 'qty' ? 'Angka = unit stok' : 'Angka = jumlah lot')));
}
