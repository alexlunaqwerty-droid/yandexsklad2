import { el, svg, fmt, day, reducedMotion } from './format.js';

/* ---------- Подсказка ---------- */

const tip = el('div', { class: 'tip', role: 'tooltip', hidden: '' });
document.body.append(tip);

export function showTip(event, title, lines) {
  tip.replaceChildren(
    el('div', { class: 'tip__title', text: title }),
    ...lines.map((l) => el('div', { class: 'tip__line' },
      l.swatch ? el('i', { class: `swatch swatch--${l.swatch}` }) : null,
      el('span', { class: 'tip__label', text: l.label }),
      el('b', { class: 'tip__value', text: l.value }),
    )),
  );
  tip.hidden = false;
  moveTip(event);
}
export function moveTip(event) {
  const pad = 14;
  const { innerWidth: w, innerHeight: h } = window;
  const r = tip.getBoundingClientRect();
  let x = event.clientX + pad;
  let y = event.clientY + pad;
  if (x + r.width > w - 8) x = event.clientX - r.width - pad;
  if (y + r.height > h - 8) y = event.clientY - r.height - pad;
  tip.style.transform = `translate(${Math.max(8, x)}px, ${Math.max(8, y)}px)`;
}
export function hideTip() { tip.hidden = true; }

/* ---------- Перерисовка по ширине ---------- */

const observed = new WeakMap();
const ro = new ResizeObserver((entries) => {
  for (const e of entries) {
    const fn = observed.get(e.target);
    const { width, height } = e.contentRect;
    if (fn && (Math.abs((e.target._w || 0) - width) > 1 || Math.abs((e.target._h || 0) - height) > 1)) {
      e.target._w = width;
      e.target._h = height;
      fn();
    }
  }
});
function onResize(host, fn) {
  if (!observed.has(host)) ro.observe(host);
  observed.set(host, fn);
}

let uid = 0;
const niceStep = (max, count) => {
  const raw = max / count;
  const mag = 10 ** Math.floor(Math.log10(raw || 1));
  const n = raw / mag;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * mag;
};

/* ---------- Столбчатая диаграмма по дням ---------- */

export function barChart(host, cfg) {
  const draw = () => drawBars(host, cfg);
  onResize(host, draw);
  draw();
}

function drawBars(host, cfg) {
  const { dates, main, inner, mainLabel, innerLabel, money } = cfg;
  host.replaceChildren();
  if (!dates.length) {
    host.append(el('p', { class: 'chart__empty', text: 'Нет записей за выбранные дни' }));
    return;
  }
  const W = Math.max(300, host.clientWidth || 640);
  const H = Math.max(220, Math.min(560, host.clientHeight || 280));
  const mt = 18, mb = 30, mr = 4;
  const max = Math.max(1, ...main, ...(inner || []));
  const step = niceStep(max, 4);
  const top = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = 0; v <= top + 1e-9; v += step) ticks.push(v);
  const tickText = money ? fmt.compact : fmt.int;

  const root = svg('svg', { viewBox: `0 0 ${W} ${H}`, width: '100%', role: 'img', 'aria-label': mainLabel + ' по дням', class: 'chart__svg' });
  host.append(root);

  // Левый отступ по самой широкой подписи
  const probe = svg('text', { class: 'axis-label' });
  root.append(probe);
  let ml = 0;
  for (const t of ticks) { probe.textContent = tickText(t); ml = Math.max(ml, probe.getComputedTextLength()); }
  probe.remove();
  ml = Math.ceil(ml) + 12;

  const plotW = W - ml - mr;
  const y = (v) => mt + (H - mt - mb) * (1 - v / top);
  const n = dates.length;
  const stepX = plotW / n;
  const bw = Math.max(2, Math.min(36, stepX * 0.68));
  const x = (i) => ml + stepX * i + (stepX - bw) / 2;

  const id = `g${++uid}`;
  const defs = svg('defs');
  defs.innerHTML = `
    <linearGradient id="${id}-main" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" style="stop-color: var(--bar-main-top)"/>
      <stop offset="1" style="stop-color: var(--bar-main-bottom)"/>
    </linearGradient>
    <linearGradient id="${id}-inner" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" style="stop-color: var(--bar-inner-top)"/>
      <stop offset="1" style="stop-color: var(--bar-inner-bottom)"/>
    </linearGradient>`;
  root.append(defs);

  const grid = svg('g', { class: 'grid' });
  for (const t of ticks) {
    grid.append(svg('line', { x1: ml, x2: W - mr, y1: y(t), y2: y(t), class: t === 0 ? 'grid__base' : 'grid__line' }));
    const label = svg('text', { x: ml - 10, y: y(t), class: 'axis-label', 'text-anchor': 'end', 'dominant-baseline': 'middle' });
    label.textContent = tickText(t);
    grid.append(label);
  }
  root.append(grid);

  // Средняя линия
  const avg = main.reduce((a, b) => a + b, 0) / n;
  const showAvg = n > 2;
  if (showAvg) root.append(svg('line', { x1: ml, x2: W - mr, y1: y(avg), y2: y(avg), class: 'avg-line' }));

  const animate = !host.dataset.drawn && !reducedMotion();
  host.dataset.drawn = '1';
  const bars = svg('g', { class: animate ? 'bars bars--grow' : 'bars' });
  const r = Math.min(4, bw / 2);
  dates.forEach((d, i) => {
    const g = svg('g', { class: 'bar', style: animate ? `animation-delay:${Math.min(i * 18, 500)}ms` : null });
    const h = Math.max(0, y(0) - y(main[i]));
    g.append(svg('rect', { x: x(i), y: y(main[i]), width: bw, height: h, rx: r, fill: `url(#${id}-main)` }));
    if (inner) {
      const ih = Math.max(0, y(0) - y(inner[i]));
      const iw = Math.max(2, bw * 0.46);
      g.append(svg('rect', { x: x(i) + (bw - iw) / 2, y: y(inner[i]), width: iw, height: ih, rx: Math.min(3, iw / 2), fill: `url(#${id}-inner)` }));
    }
    bars.append(g);
  });
  root.append(bars);
  if (showAvg) {
    const at = svg('text', { x: W - mr, y: y(avg) - 7, class: 'avg-label', 'text-anchor': 'end' });
    at.textContent = 'среднее ' + (money ? fmt.rubCompact(avg) : fmt.one(avg));
    root.append(at);
  }

  // Подписи дат, прореженные
  const every = Math.max(1, Math.ceil(n / Math.max(1, Math.floor(plotW / 48))));
  const xl = svg('g');
  dates.forEach((d, i) => {
    if ((n - 1 - i) % every) return;
    const t = svg('text', { x: x(i) + bw / 2, y: H - 10, class: 'axis-label', 'text-anchor': 'middle' });
    t.textContent = day.short(d);
    xl.append(t);
  });
  root.append(xl);

  // Наведение
  const hit = svg('g');
  const value = money ? fmt.rub : fmt.int;
  dates.forEach((d, i) => {
    const rect = svg('rect', { x: ml + stepX * i, y: mt, width: stepX, height: H - mt - mb, class: 'hit' });
    const lines = () => {
      const out = [{ swatch: 'main', label: mainLabel, value: value(main[i]) }];
      if (inner) {
        out.push({ swatch: 'inner', label: innerLabel, value: value(inner[i]) });
        if (!money && main[i]) out.push({ label: 'Доля', value: fmt.pct(inner[i] / main[i]) });
      }
      return out;
    };
    rect.addEventListener('pointerenter', (e) => {
      bars.classList.add('bars--focus');
      bars.children[i].classList.add('is-active');
      showTip(e, day.label(d), lines());
    });
    rect.addEventListener('pointermove', moveTip);
    rect.addEventListener('pointerleave', () => {
      bars.classList.remove('bars--focus');
      bars.children[i].classList.remove('is-active');
      hideTip();
    });
    hit.append(rect);
  });
  root.append(hit);
}

/* ---------- Рейтинг площадок ---------- */

export function rankList(host, items, { value, innerValue, innerLabel, ratio } = {}) {
  host.replaceChildren();
  const sorted = [...items].sort((a, b) => b.value - a.value);
  const max = Math.max(1, ...sorted.map((i) => i.value));
  sorted.forEach((it, idx) => {
    const track = el('div', { class: 'rank__track' },
      el('span', { class: 'rank__fill', style: `--w:${(it.value / max) * 100}%` }),
      it.inner != null ? el('span', { class: 'rank__fill rank__fill--inner', style: `--w:${(it.inner / max) * 100}%` }) : null,
    );
    const sub = [];
    if (it.inner != null) sub.push(`${innerLabel} ${innerValue(it.inner)}`);
    if (ratio && it.value) sub.push(fmt.pct(it.inner / it.value));
    host.append(el('li', { class: it.value ? 'rank__row' : 'rank__row is-zero', style: `--i:${idx}` },
      el('span', { class: 'rank__name', text: it.name }),
      el('span', { class: 'rank__nums' },
        sub.length ? el('span', { class: 'rank__sub', text: sub.join(' · ') }) : null,
        el('b', { class: 'rank__value', text: value(it.value) }),
      ),
      track,
    ));
  });
}

/* ---------- Тепловая таблица: даты × площадки ---------- */

export function heatTable(host, { sites, rows, format, caption }) {
  host.replaceChildren();
  if (!rows.length) {
    host.append(el('p', { class: 'chart__empty', text: 'Нет записей за выбранные дни' }));
    return;
  }
  let max = 0;
  const totals = sites.map(() => 0);
  for (const r of rows) r.vals.forEach((v, i) => { totals[i] += v; if (v > max) max = v; });
  const grand = totals.reduce((a, b) => a + b, 0);

  const head = el('tr', {},
    el('th', { scope: 'col', class: 'heat__date', text: 'Дата' }),
    sites.map((s) => el('th', { scope: 'col', text: s })),
    el('th', { scope: 'col', class: 'heat__total', text: 'Итого в день' }),
  );
  const body = rows.map((r) => {
    const sum = r.vals.reduce((a, b) => a + b, 0);
    return el('tr', { class: day.weekend(r.d) ? 'is-weekend' : null },
      el('th', { scope: 'row', class: 'heat__date', text: day.label(r.d) }),
      r.vals.map((v) => el('td', {
        class: v ? null : 'is-zero',
        style: v ? `--heat:${(6 + 54 * (v / max)).toFixed(1)}%` : null,
        text: format(v),
      })),
      el('td', { class: 'heat__total', text: format(sum) }),
    );
  });
  const foot = el('tr', {},
    el('th', { scope: 'row', class: 'heat__date', text: 'Итого за период' }),
    totals.map((v) => el('td', { text: format(v) })),
    el('td', { class: 'heat__total', text: format(grand) }),
  );
  host.append(el('table', { class: 'heat' },
    el('caption', { class: 'sr-only', text: caption }),
    el('thead', {}, head),
    el('tbody', {}, body),
    el('tfoot', {}, foot),
  ));
}

/* ---------- Схема маршрутов ---------- */

// Схематичные позиции (доли ширины/высоты), сохраняют географию, но разносят города.
const CITIES = [
  { key: 'Москва', match: /мск|москв/i, x: 0.30, y: 0.42, place: 'bottom' },
  { key: 'Санкт-Петербург', match: /спб|петербург|фортис/i, x: 0.10, y: 0.10, place: 'right' },
  { key: 'Нижний Новгород', match: /нижн/i, x: 0.56, y: 0.24, place: 'bottom' },
  { key: 'Казань', match: /казан/i, x: 0.74, y: 0.50, place: 'right' },
  { key: 'Самара', match: /самар/i, x: 0.58, y: 0.76, place: 'right' },
  { key: 'Екатеринбург', match: /екатеринб/i, x: 0.90, y: 0.18, place: 'top' },
  { key: 'Краснодар', match: /краснод/i, x: 0.20, y: 0.86, place: 'right' },
];
export const cityOf = (site) => (CITIES.find((c) => c.match.test(site)) || {}).key || 'Другое';

export function routeMap(host, cities) {
  const draw = () => drawMap(host, cities);
  onResize(host, draw);
  draw();
}

function drawMap(host, data) {
  host.replaceChildren();
  const W = Math.max(300, host.clientWidth || 520);
  const H = Math.round(W * (W < 480 ? 0.86 : 0.7));
  const compact = W < 480;
  const pad = { l: 24, r: 24, t: 40, b: 40 };
  const P = (c) => [pad.l + c.x * (W - pad.l - pad.r), pad.t + c.y * (H - pad.t - pad.b)];

  const root = svg('svg', { viewBox: `0 0 ${W} ${H}`, width: '100%', class: 'map', role: 'img', 'aria-label': 'Схема площадок по городам' });
  host.append(root);

  // Точечная сетка
  const id = `dots${++uid}`;
  const defs = svg('defs');
  defs.innerHTML = `<pattern id="${id}" width="22" height="22" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" class="map__dotgrid"/></pattern>`;
  root.append(defs, svg('rect', { x: 0, y: 0, width: W, height: H, fill: `url(#${id})` }));

  const byKey = new Map(data.map((d) => [d.key, d]));
  const max = Math.max(1, ...data.map((d) => d.value));
  const rmax = compact ? 18 : 26;
  const [hx, hy] = P(CITIES[0]);

  const routes = svg('g', { class: 'map__routes' });
  CITIES.slice(1).forEach((c, i) => {
    if (!byKey.has(c.key)) return;
    const [cx, cy] = P(c);
    const mx = (hx + cx) / 2, my = (hy + cy) / 2;
    const len = Math.hypot(cx - hx, cy - hy) || 1;
    const nx = -(cy - hy) / len, ny = (cx - hx) / len;
    const bend = len * 0.18 * (i % 2 ? 1 : -1);
    const path = `M${hx},${hy} Q${mx + nx * bend},${my + ny * bend} ${cx},${cy}`;
    routes.append(svg('path', { d: path, class: 'map__route' }));
    routes.append(svg('path', { d: path, class: 'map__flow', style: `animation-delay:${i * -0.7}s` }));
  });
  root.append(routes);

  const nodes = svg('g', { class: 'map__nodes' });
  CITIES.forEach((c) => {
    const d = byKey.get(c.key);
    if (!d) return;
    const [cx, cy] = P(c);
    const rr = 4 + (rmax - 4) * Math.sqrt(d.value / max);
    const node = svg('g', { class: 'map__node', tabindex: 0, 'aria-label': `${c.key}: ${d.label}` });
    node.append(svg('circle', { cx, cy, r: rr + 8, class: 'map__halo' }));
    node.append(svg('circle', { cx, cy, r: rr, class: 'map__dot' }));
    node.append(svg('circle', { cx, cy, r: 2.5, class: 'map__core' }));

    let tx = cx, ty = cy, anchor = 'start';
    if (c.place === 'right') { tx = cx + rr + 10; ty = cy - (compact ? -4 : 3); }
    if (c.place === 'top') { ty = cy - rr - (compact ? 10 : 24); anchor = 'middle'; }
    if (c.place === 'bottom') { ty = cy + rr + 18; anchor = 'middle'; }
    if (anchor === 'middle' && cx > W * 0.82) { anchor = 'end'; tx = Math.min(cx + rr, W - 4); }
    const name = svg('text', { x: tx, y: ty, class: 'map__name', 'text-anchor': anchor });
    name.textContent = c.key;
    node.append(name);
    if (!compact) {
      const val = svg('text', { x: tx, y: ty + 15, class: 'map__val', 'text-anchor': anchor });
      val.textContent = d.label;
      node.append(val);
    }
    const enter = (e) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const ev = e.clientX ? e : { clientX: rect.right, clientY: rect.top };
      showTip(ev, c.key, d.lines);
    };
    node.addEventListener('pointerenter', enter);
    node.addEventListener('pointermove', moveTip);
    node.addEventListener('pointerleave', hideTip);
    node.addEventListener('focus', enter);
    node.addEventListener('blur', hideTip);
    nodes.append(node);
  });
  root.append(nodes);
}
