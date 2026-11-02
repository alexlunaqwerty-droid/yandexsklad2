const nf = new Intl.NumberFormat('ru-RU');
const nf1 = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 });
const cf = new Intl.NumberFormat('ru-RU', { notation: 'compact', maximumFractionDigits: 1 });
const pf = new Intl.NumberFormat('ru-RU', { style: 'percent', maximumFractionDigits: 1 });

export const fmt = {
  int: (v) => nf.format(Math.round(v || 0)),
  one: (v) => nf1.format(v || 0),
  compact: (v) => cf.format(v || 0),
  pct: (v) => (Number.isFinite(v) ? pf.format(v) : '—'),
  rub: (v) => nf.format(Math.round(v || 0)) + ' ₽',
  rubCompact: (v) => cf.format(v || 0) + ' ₽',
};

const WD = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
const MON = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

export const day = {
  parse: (iso) => new Date(iso + 'T12:00:00'),
  short: (iso) => iso.slice(8, 10) + '.' + iso.slice(5, 7),
  label: (iso) => {
    const d = new Date(iso + 'T12:00:00');
    return `${iso.slice(8, 10)}.${iso.slice(5, 7)}, ${WD[d.getDay()]}`;
  },
  long: (iso) => {
    const d = new Date(iso + 'T12:00:00');
    return `${d.getDate()} ${MON[d.getMonth()]} ${d.getFullYear()}`;
  },
  weekend: (iso) => {
    const w = new Date(iso + 'T12:00:00').getDay();
    return w === 0 || w === 6;
  },
  iso: (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
  back: (iso, n) => {
    const d = new Date(iso + 'T12:00:00');
    d.setDate(d.getDate() - n);
    return day.iso(d);
  },
  count: (from, to) => Math.round((new Date(to + 'T12:00:00') - new Date(from + 'T12:00:00')) / 864e5) + 1,
};

export const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'style') node.style.cssText = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  for (const c of children.flat()) if (c != null) node.append(c);
  return node;
}

const SVGNS = 'http://www.w3.org/2000/svg';
export function svg(tag, attrs = {}) {
  const node = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) node.setAttribute(k, v);
  return node;
}
