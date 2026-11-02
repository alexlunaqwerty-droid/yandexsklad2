import { CONFIG } from './config.js';
import { loadData } from './api.js';
import { fmt, day, el, reducedMotion } from './format.js';
import { barChart, rankList, heatTable, routeMap, cityOf } from './charts.js';

const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];

const state = {
  data: null,
  from: null,
  to: null,
  segment: { training: 'leads', money: 'turnover' },
  loading: false,
};

/* ---------- Данные за период ---------- */

/** Все календарные дни периода, обрезанные по наличию данных; пустые дни — нули. */
function series(block, keys, from, to) {
  const days = block.days;
  if (!days.length) return { dates: [], rows: [] };
  const first = days[0].d;
  const last = days[days.length - 1].d;
  const a = from > first ? from : first;
  const b = to < last ? to : last;
  const byDay = new Map(days.map((x) => [x.d, x]));
  const zeros = block.sites.map(() => 0);
  const dates = [];
  const rows = [];
  if (a > b) return { dates, rows };
  for (let d = a; d <= b; d = day.back(d, -1)) {
    const src = byDay.get(d);
    const row = { d };
    for (const k of keys) row[k] = src ? src[k] : zeros;
    dates.push(d);
    rows.push(row);
  }
  return { dates, rows };
}

const sumBy = (rows, key) => rows.reduce((t, r) => t + r[key].reduce((a, b) => a + b, 0), 0);
const perSite = (rows, key, n) => {
  const out = new Array(n).fill(0);
  for (const r of rows) r[key].forEach((v, i) => { out[i] += v; });
  return out;
};
const daysWithData = (rows, key) => rows.filter((r) => r[key].some((v) => v)).length;

function compute(from, to) {
  const { training, recon } = state.data;
  const t = series(training, ['leads', 'came'], from, to);
  const r = series(recon, ['shifts', 'turnover', 'earnings'], from, to);
  const leads = sumBy(t.rows, 'leads');
  const came = sumBy(t.rows, 'came');
  const shifts = sumBy(r.rows, 'shifts');
  const turnover = sumBy(r.rows, 'turnover');
  const earnings = sumBy(r.rows, 'earnings');
  const shiftDays = daysWithData(r.rows, 'shifts');
  return {
    t, r, leads, came, shifts, turnover, earnings,
    tDays: daysWithData(t.rows, 'leads'), shiftDays,
    rate: leads ? came / leads : NaN,
    shiftsAvg: shiftDays ? shifts / shiftDays : 0,
    turnoverAvg: shiftDays ? turnover / shiftDays : 0,
  };
}

/* ---------- Отрисовка ---------- */

function render() {
  if (!state.data) return;
  const { from, to } = state;
  const c = compute(from, to);
  const span = day.count(from, to);
  const prev = compute(day.back(from, span), day.back(from, 1));

  // Подписи периода
  const rangeText = `${day.long(from)} — ${day.long(to)}`;
  $('#hero-range').textContent = rangeText;
  for (const n of $$('[data-range]')) n.textContent = `${rangeText} · ${span} дн.`;
  $('#from').value = from;
  $('#to').value = to;
  for (const b of $$('#presets .chip')) {
    const d = b.dataset.days;
    const all = d === 'all' && from === dataBounds().min && to === dataBounds().max;
    b.setAttribute('aria-pressed', String(all || (d !== 'all' && Number(d) === span && to === dataBounds().max)));
  }

  // KPI
  countTo('leads', c.leads, fmt.int);
  countTo('came', c.came, fmt.int);
  setText('rate', fmt.pct(c.rate));
  countTo('shifts', c.shifts, fmt.int);
  setText('shiftsAvg', fmt.int(c.shiftsAvg));
  countTo('turnover', c.turnover, fmt.compact);
  setText('turnoverAvg', fmt.rubCompact(c.turnoverAvg));
  countTo('earnings', c.earnings, fmt.compact);

  delta('leads', c.leads, prev.leads, c.tDays, prev.tDays, span);
  delta('shifts', c.shifts, prev.shifts, c.shiftDays, prev.shiftDays, span);
  delta('turnover', c.turnover, prev.turnover, c.shiftDays, prev.shiftDays, span);
  delta('earnings', c.earnings, prev.earnings, c.shiftDays, prev.shiftDays, span);

  // Карта: города по выходам
  const tSites = state.data.training.sites;
  const rSites = state.data.recon.sites;
  const shiftBySite = perSite(c.r.rows, 'shifts', rSites.length);
  const turnBySite = perSite(c.r.rows, 'turnover', rSites.length);
  const leadBySite = perSite(c.t.rows, 'leads', tSites.length);
  const cities = new Map();
  const city = (name) => {
    const key = cityOf(name);
    if (!cities.has(key)) cities.set(key, { key, value: 0, turnover: 0, leads: 0, sites: [] });
    return cities.get(key);
  };
  rSites.forEach((s, i) => {
    const ct = city(s);
    ct.value += shiftBySite[i];
    ct.turnover += turnBySite[i];
    ct.sites.push({ s, v: shiftBySite[i] });
  });
  tSites.forEach((s, i) => { city(s).leads += leadBySite[i]; });
  routeMap($('#map'), [...cities.values()].map((ct) => ({
    key: ct.key,
    value: ct.value,
    label: `${fmt.int(ct.value)} вых. · ${fmt.rubCompact(ct.turnover)}`,
    lines: [
      ...ct.sites.filter((x) => x.v).sort((a, b) => b.v - a.v).map((x) => ({ label: x.s, value: fmt.int(x.v) + ' вых.' })),
      { label: 'Оборот', value: fmt.rub(ct.turnover) },
      { label: 'Лиды на стаж', value: fmt.int(ct.leads) },
    ],
  })));

  // 01 Обучение
  barChart($('#training-chart'), {
    dates: c.t.dates,
    main: c.t.rows.map((r) => r.leads.reduce((a, b) => a + b, 0)),
    inner: c.t.rows.map((r) => r.came.reduce((a, b) => a + b, 0)),
    mainLabel: 'Лиды', innerLabel: 'Пришли',
  });
  const cameBySite = perSite(c.t.rows, 'came', tSites.length);
  rankList($('#training-rank'), tSites.map((name, i) => ({ name, value: leadBySite[i], inner: cameBySite[i] })), {
    value: fmt.int, innerValue: fmt.int, innerLabel: 'пришли', ratio: true,
  });
  heatTable($('#training-table'), {
    sites: tSites,
    rows: [...c.t.rows].reverse().map((r) => ({ d: r.d, vals: r[state.segment.training] })),
    format: fmt.int,
    caption: state.segment.training === 'leads' ? 'Лиды по дням и площадкам' : 'Пришли на стаж по дням и площадкам',
  });

  // 02 Выходы
  barChart($('#shifts-chart'), {
    dates: c.r.dates,
    main: c.r.rows.map((r) => r.shifts.reduce((a, b) => a + b, 0)),
    mainLabel: 'Выходы',
  });
  rankList($('#shifts-rank'), rSites.map((name, i) => ({ name, value: shiftBySite[i] })), { value: fmt.int });
  heatTable($('#shifts-table'), {
    sites: rSites,
    rows: [...c.r.rows].reverse().map((r) => ({ d: r.d, vals: r.shifts })),
    format: fmt.int,
    caption: 'Выходы по дням и площадкам',
  });

  // 03 Оборот
  barChart($('#money-chart'), {
    dates: c.r.dates,
    main: c.r.rows.map((r) => r.turnover.reduce((a, b) => a + b, 0)),
    inner: c.r.rows.map((r) => r.earnings.reduce((a, b) => a + b, 0)),
    mainLabel: 'Оборот', innerLabel: 'Заработок', money: true,
  });
  const earnBySite = perSite(c.r.rows, 'earnings', rSites.length);
  rankList($('#money-rank'), rSites.map((name, i) => ({ name, value: turnBySite[i], inner: earnBySite[i] })), {
    value: fmt.rubCompact, innerValue: fmt.rubCompact, innerLabel: 'заработок',
  });
  heatTable($('#money-table'), {
    sites: rSites,
    rows: [...c.r.rows].reverse().map((r) => ({ d: r.d, vals: r[state.segment.money].map(Math.round) })),
    format: fmt.int,
    caption: state.segment.money === 'turnover' ? 'Оборот по дням и площадкам' : 'Заработок исполнителя по дням и площадкам',
  });
}

/* ---------- KPI: плавный счёт и изменение ---------- */

const shown = new Map();
function setText(key, text) {
  for (const n of $$(`[data-kpi="${key}"]`)) n.textContent = text;
}
function countTo(key, target, format) {
  const from = shown.get(key) ?? 0;
  shown.set(key, target);
  if (reducedMotion() || from === target) { setText(key, format(target)); return; }
  const t0 = performance.now();
  const dur = 900;
  const tick = (now) => {
    const p = Math.min(1, (now - t0) / dur);
    const e = 1 - Math.pow(1 - p, 4);
    setText(key, format(from + (target - from) * e));
    if (p < 1 && shown.get(key) === target) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
function delta(key, cur, prev, curDays, prevDays, span) {
  const n = $(`[data-delta="${key}"]`);
  if (!n) return;
  // Сравниваем, только если в прошлом периоде данных не меньше, чем в текущем
  if (!prev || !curDays || prevDays < curDays * 0.8) { n.textContent = ''; n.dataset.dir = ''; return; }
  const ch = (cur - prev) / prev;
  n.dataset.dir = ch > 0.001 ? 'up' : ch < -0.001 ? 'down' : 'flat';
  n.textContent = `${ch > 0 ? '+' : ''}${fmt.pct(ch)} к прошлым ${span} дн.`;
}

/* ---------- Период ---------- */

function dataBounds() {
  const all = [...state.data.training.days, ...state.data.recon.days].map((d) => d.d);
  const today = day.iso(new Date());
  let min = all.reduce((a, b) => (b < a ? b : a), today);
  let max = all.reduce((a, b) => (b > a ? b : a), min);
  if (max > today) max = today;
  return { min, max };
}

function setRange(from, to) {
  const b = dataBounds();
  if (from > to) [from, to] = [to, from];
  state.from = from < b.min ? b.min : from;
  state.to = to;
  saveHash();
  render();
}

function presetDays(n) {
  const b = dataBounds();
  if (n === 'all') return setRange(b.min, b.max);
  const to = b.max;
  setRange(day.back(to, Number(n) - 1), to);
}

function saveHash() {
  try { sessionStorage.setItem('br-range', JSON.stringify([state.from, state.to])); } catch (e) { /* ignore */ }
}

/* ---------- Загрузка и статус ---------- */

function setStatus(kind, text) {
  const s = $('#status');
  s.dataset.state = kind;
  $('#status-text').textContent = text;
}

function showNotice(text, kind = 'info') {
  const n = $('#notice');
  if (!text) { n.hidden = true; return; }
  n.dataset.kind = kind;
  n.textContent = text;
  n.hidden = false;
}

async function load({ fresh = false, quiet = false } = {}) {
  if (state.loading) return;
  state.loading = true;
  document.body.classList.toggle('is-loading', !state.data);
  if (!quiet) setStatus('loading', 'Обновляю…');
  $('#refresh').classList.add('is-spinning');
  try {
    const data = await loadData({ fresh });
    const first = !state.data;
    state.data = data;
    if (first) {
      const b = dataBounds();
      let saved = null;
      try { saved = JSON.parse(sessionStorage.getItem('br-range') || 'null'); } catch (e) { /* ignore */ }
      if (saved && saved[0] && saved[1]) { state.from = saved[0]; state.to = saved[1]; }
      else { state.to = b.max; state.from = day.back(b.max, CONFIG.DEFAULT_DAYS - 1); }
      for (const inp of [$('#from'), $('#to')]) { inp.min = b.min; inp.max = day.iso(new Date()); }
    }
    const time = new Date(data.generatedAt || Date.now()).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    if (data.demo) {
      setStatus('demo', 'Демо-данные');
      showNotice('Сейчас показаны выдуманные демо-данные. Чтобы подключить ваши таблицы, вставьте адрес веб-приложения Apps Script в assets/js/config.js (см. README).', 'demo');
    } else {
      setStatus('live', `Обновлено ${time}`);
      const missing = [...(data.training.missing || []), ...(data.recon.missing || [])];
      showNotice(missing.length ? `Не найдены листы: ${missing.join(', ')}. Проверьте названия в Apps Script.` : '', 'warn');
    }
    $('#generated').textContent = `Данные сформированы ${time}`;
    render();
  } catch (err) {
    setStatus('error', 'Ошибка загрузки');
    showNotice(`Не удалось загрузить данные: ${err.message}. ${state.data ? 'Показаны последние загруженные.' : 'Проверьте API_URL и доступ веб-приложения «Все».'}`, 'error');
  } finally {
    state.loading = false;
    document.body.classList.remove('is-loading');
    $('#refresh').classList.remove('is-spinning');
  }
}

/* ---------- Управление ---------- */

function bindControls() {
  $('#from').addEventListener('change', (e) => { if (e.target.value && state.data) setRange(e.target.value, state.to); });
  $('#to').addEventListener('change', (e) => { if (e.target.value && state.data) setRange(state.from, e.target.value); });
  for (const b of $$('#presets .chip')) b.addEventListener('click', () => state.data && presetDays(b.dataset.days));

  for (const group of $$('[data-segment]')) {
    for (const b of $$('button', group)) {
      b.addEventListener('click', () => {
        state.segment[group.dataset.segment] = b.dataset.value;
        for (const o of $$('button', group)) o.setAttribute('aria-pressed', String(o === b));
        render();
      });
    }
  }

  $('#refresh').addEventListener('click', () => load({ fresh: true }));

  $('#theme').addEventListener('click', () => {
    const root = document.documentElement;
    const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    root.dataset.theme = dark ? 'light' : 'dark';
    try { localStorage.setItem('br-theme', root.dataset.theme); } catch (e) { /* ignore */ }
    render();
  });

  // Подсветка активного раздела в навигации
  const links = new Map($$('.nav a').map((a) => [a.getAttribute('href').slice(1), a]));
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting) for (const [id, a] of links) a.classList.toggle('is-active', id === e.target.id);
    }
  }, { rootMargin: '-45% 0px -50% 0px' });
  for (const id of links.keys()) { const s = document.getElementById(id); if (s) io.observe(s); }

  // Появление разделов
  if (!reducedMotion()) {
    const rev = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) { e.target.classList.add('is-in'); rev.unobserve(e.target); }
    }, { rootMargin: '0px 0px -10% 0px' });
    for (const s of $$('.chapter')) { s.classList.add('reveal'); rev.observe(s); }
  }
}

function fillStatic() {
  const rate = String(CONFIG.RATE).replace('.', ',');
  for (const n of $$('[data-rate], #rate')) n.textContent = rate;
  $('#sources').replaceChildren(...CONFIG.SOURCES.flatMap((s, i) => [
    i ? ', ' : '',
    el('a', { href: s.url, target: '_blank', rel: 'noopener', text: `«${s.title}»` }),
  ]));
}

fillStatic();
bindControls();
load();
if (CONFIG.API_URL && CONFIG.REFRESH_MINUTES > 0) {
  setInterval(() => { if (!document.hidden) load({ quiet: true }); }, CONFIG.REFRESH_MINUTES * 60 * 1000);
}
