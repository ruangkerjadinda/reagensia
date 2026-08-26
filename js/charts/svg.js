/** Pembantu SVG. Grafik digambar sendiri supaya tidak ada ketergantungan CDN. */

const NS = 'http://www.w3.org/2000/svg';

export function svgEl(spec, attrs = {}, ...children) {
  const [tag, ...classes] = String(spec).split('.');
  const node = document.createElementNS(NS, tag);
  if (classes.length) node.setAttribute('class', classes.join(' '));
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue;
    if (key === 'text') node.textContent = String(value);
    else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, String(value));
  }
  for (const child of children.flat(Infinity)) {
    if (child == null || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

/**
 * Persegi dengan sudut membulat hanya di ujung data — dasar batang tetap
 * menempel rata ke garis nol supaya nilainya tidak terlihat melayang.
 */
export function barPath(x, y, w, h, r = 4) {
  const radius = Math.min(r, w / 2, h);
  if (h <= 0) return '';
  return [
    `M${x},${y + h}`,
    `V${y + radius}`,
    `q0,${-radius} ${radius},${-radius}`,
    `h${w - radius * 2}`,
    `q${radius},0 ${radius},${radius}`,
    `V${y + h}`,
    'Z',
  ].join(' ');
}

/**
 * Nilai sumbu yang enak dibaca: 1, 2, 5, 10, 20, 50…
 *
 * Tanda terakhir selalu >= max. Kalau tidak, batang tertinggi digambar melewati
 * bidang gambarnya — dengan max 69 dan langkah 20, berhenti di 60 membuat
 * batangnya menonjol ke luar atas grafik.
 */
export function niceTicks(max, count = 4) {
  if (max <= 0) return [0];
  const rough = max / count;
  const mag = 10 ** Math.floor(Math.log10(rough));
  const norm = rough / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
  const top = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = 0; v <= top + step * 1e-6; v += step) ticks.push(Math.round(v * 1000) / 1000);
  return ticks;
}

/**
 * Lapisan hover: satu tooltip yang mengikuti kursor, dibagi semua tanda dalam
 * satu grafik.
 */
export function attachTooltip(container) {
  const tip = document.createElement('div');
  Object.assign(tip.style, {
    position: 'absolute',
    pointerEvents: 'none',
    padding: '6px 9px',
    borderRadius: '8px',
    background: 'var(--surface-raised)',
    border: '1px solid var(--border-strong)',
    boxShadow: 'var(--shadow)',
    fontSize: '12px',
    lineHeight: '1.45',
    color: 'var(--ink)',
    whiteSpace: 'nowrap',
    opacity: '0',
    transition: 'opacity 90ms',
    zIndex: '5',
  });
  container.style.position = 'relative';
  container.append(tip);

  return {
    show(event, lines) {
      tip.replaceChildren();
      for (const [i, line] of lines.entries()) {
        const row = document.createElement('div');
        row.textContent = line;
        if (i === 0) row.style.fontWeight = '600';
        else row.style.color = 'var(--ink-secondary)';
        tip.append(row);
      }
      const box = container.getBoundingClientRect();
      const x = event.clientX - box.left;
      const y = event.clientY - box.top;
      tip.style.opacity = '1';
      // Jaga tooltip tetap di dalam kartu, jangan sampai terpotong tepi kanan.
      const width = tip.offsetWidth;
      tip.style.left = `${Math.min(Math.max(x - width / 2, 4), Math.max(box.width - width - 4, 4))}px`;
      tip.style.top = `${Math.max(y - tip.offsetHeight - 12, 4)}px`;
    },
    hide() {
      tip.style.opacity = '0';
    },
  };
}
