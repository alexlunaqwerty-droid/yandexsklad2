/**
 * Проект Яндекс Склад — API для сайта-дашборда.
 *
 * Читает две Google-таблицы и отдаёт только агрегаты по дням и площадкам
 * (никаких ФИО, телефонов, дат рождения и логинов).
 *
 * Развёртывание: Расширения → Apps Script → вставить этот файл →
 * Развернуть → Новое развёртывание → Веб-приложение →
 *   «Выполнять от имени»: Я, «У кого есть доступ»: Все.
 * Полученный URL (…/exec) вписать в assets/js/config.js → API_URL.
 */

const CONFIG = {
  TRAINING_ID: '169aiyVDcZm9yHeYwq4JgYhhlS-ilAiTs7eAzTkavHuY', // «Списки Обучения Бизнес Ресурс»
  RECON_ID: '1Sba2BYOZ4KLeinXKV7a3HWR80dMJ579T9umzCR6qXyE',    // «Сверка по проекту»
  RATE: 1.82,              // заработок исполнителя = сумма / RATE
  CACHE_SECONDS: 300,      // как долго держать готовый ответ в кеше
  MIN_DATE: '2024-01-01',  // даты раньше считаем опечатками

  // Блок 1. name — как показывать на сайте, sheet — точное имя листа.
  TRAINING_SITES: [
    { name: 'СЦ МСК Тарный',        sheet: 'СЦ МСК Тарный' },
    { name: 'СЦ Краснодар',         sheet: 'СЦ Краснодар' },
    { name: 'СЦ/ФФЦ Самара',        sheet: 'СЦ/ФФЦ Самара' },
    { name: 'СЦ/ФФЦ Казань',        sheet: 'СЦ/ФФЦ Казань' },
    { name: 'СЦ/ФФЦ Екатеринбург',  sheet: 'СЦ/ФФЦ ЕКатеринбург' },
    { name: 'СЦ СПБ Троицкий',      sheet: 'СЦ СПБ Троицкий' },
    { name: 'СЦ СПБ Бугры',         sheet: 'СЦ СПБ Бугры' },
    { name: 'ФФЦ Фортис',           sheet: 'ФФЦ Фортис' },
  ],

  // Блоки 2 и 3.
  RECON_SITES: [
    { name: 'СЦ МСК Тарный',        sheet: 'СЦ Мск Тарный' },
    { name: 'СЦ МСК Строгино',      sheet: 'СЦ МСК Строгино' },
    { name: 'СЦ МСК Дзержинский',   sheet: 'СЦ МСК Дзержинский' },
    { name: 'СЦ МСК Кувекино',      sheet: 'СЦ МСК КУвекино' },
    { name: 'СЦ СПБ Троицкий',      sheet: 'СЦ СПБ Троицкий' },
    { name: 'СЦ СПБ Бугры',         sheet: 'СЦ СПБ Бугры' },
    { name: 'ФФЦ СПБ Фортис',       sheet: 'ФФЦ СПБ Фортис' },
    { name: 'СЦ Самара КГТ',        sheet: 'СЦ Самара Кгт' },
    { name: 'СЦ Екатеринбург',      sheet: 'СЦ Екатеринбург' },
    { name: 'ФФЦ Екатеринбург',     sheet: 'ФФЦ Екатеринбург' },
    { name: 'СЦ Краснодар',         sheet: 'СЦ Краснодлар' },
    { name: 'СЦ Нижний Новгород',   sheet: 'СЦ Нижний Новгородэ' },
    { name: 'СЦ Казань',            sheet: 'СЦ Казань' },
    { name: 'ФФЦ Казань',           sheet: 'ФФЦ Казань' },
  ],
};

function doGet(e) {
  const fresh = e && e.parameter && e.parameter.fresh;
  const cache = CacheService.getScriptCache();
  let body = fresh ? null : cache.get('dashboard');
  if (!body) {
    try {
      body = JSON.stringify(buildDashboard_());
    } catch (err) {
      body = JSON.stringify({ ok: false, error: String(err && err.message || err) });
      return json_(body);
    }
    try { cache.put('dashboard', body, CONFIG.CACHE_SECONDS); } catch (ignore) { /* > 100 КБ — просто не кешируем */ }
  }
  return json_(body);
}

function json_(body) {
  return ContentService.createTextOutput(body).setMimeType(ContentService.MimeType.JSON);
}

function buildDashboard_() {
  const tz = Session.getScriptTimeZone() || 'Europe/Moscow';
  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    training: buildTraining_(tz),
    recon: buildRecon_(tz),
  };
}

/* ---------- Блок 1: лиды и пришедшие ---------- */

function buildTraining_(tz) {
  const ss = SpreadsheetApp.openById(CONFIG.TRAINING_ID);
  const sites = CONFIG.TRAINING_SITES;
  const days = {};
  const missing = [];

  sites.forEach(function (site, i) {
    const sh = findSheet_(ss, site.sheet);
    if (!sh) { missing.push(site.sheet); return; }
    const cols = readColumns_(sh, ['дата стаж', 'комментарий']);
    if (!cols['дата стаж']) { missing.push(site.sheet + ' (нет колонки «дата стаж»)'); return; }
    const dates = cols['дата стаж'];
    const comments = cols['комментарий'] || [];
    for (let r = 0; r < dates.length; r++) {
      const d = toIso_(dates[r], tz);
      if (!d || d < CONFIG.MIN_DATE) continue;
      const day = days[d] || (days[d] = { d: d, leads: zeros_(sites.length), came: zeros_(sites.length) });
      day.leads[i] += 1;
      if (isPassed_(comments[r])) day.came[i] += 1;
    }
  });

  return { sites: sites.map(function (s) { return s.name; }), days: sortDays_(days), missing: missing };
}

function isPassed_(v) {
  const t = String(v == null ? '' : v).toLowerCase().replace(/ё/g, 'е');
  return /(^|[^а-я])прошел/.test(t) && !/не\s*прошел/.test(t);
}

/* ---------- Блоки 2 и 3: выходы, оборот, заработок ---------- */

function buildRecon_(tz) {
  const ss = SpreadsheetApp.openById(CONFIG.RECON_ID);
  const sites = CONFIG.RECON_SITES;
  const days = {};
  const missing = [];

  sites.forEach(function (site, i) {
    const sh = findSheet_(ss, site.sheet);
    if (!sh) { missing.push(site.sheet); return; }
    const cols = readColumns_(sh, ['операционный день', 'сумма']);
    if (!cols['операционный день'] || !cols['сумма']) { missing.push(site.sheet + ' (нет колонок)'); return; }
    const dates = cols['операционный день'];
    const sums = cols['сумма'];
    for (let r = 0; r < dates.length; r++) {
      const d = toIso_(dates[r], tz);
      if (!d || d < CONFIG.MIN_DATE) continue;
      const day = days[d] || (days[d] = { d: d, shifts: zeros_(sites.length), turnover: zeros_(sites.length), earnings: zeros_(sites.length) });
      const amount = toNumber_(sums[r]);
      day.shifts[i] += 1;
      day.turnover[i] += amount;
    }
  });

  const list = sortDays_(days);
  list.forEach(function (day) {
    day.turnover = day.turnover.map(round2_);
    day.earnings = day.turnover.map(function (v) { return round2_(v / CONFIG.RATE); });
  });
  return { sites: sites.map(function (s) { return s.name; }), rate: CONFIG.RATE, days: list, missing: missing };
}

/* ---------- Помощники ---------- */

function norm_(s) {
  return String(s == null ? '' : s).toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
}

function findSheet_(ss, name) {
  const exact = ss.getSheetByName(name);
  if (exact) return exact;
  const want = norm_(name);
  const all = ss.getSheets();
  for (let i = 0; i < all.length; i++) if (norm_(all[i].getName()) === want) return all[i];
  return null;
}

/** Возвращает {заголовок: [значения…]} только для нужных колонок, ищет их по заголовку в первой строке. */
function readColumns_(sh, headers) {
  const lastRow = sh.getLastRow();
  const lastCol = sh.getLastColumn();
  const out = {};
  if (lastRow < 2 || lastCol < 1) return out;
  const head = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(norm_);
  headers.forEach(function (h) {
    const idx = head.indexOf(h);
    if (idx < 0) return;
    out[h] = sh.getRange(2, idx + 1, lastRow - 1, 1).getValues().map(function (row) { return row[0]; });
  });
  return out;
}

function toIso_(v, tz) {
  if (v instanceof Date && !isNaN(v)) return Utilities.formatDate(v, tz, 'yyyy-MM-dd');
  const s = String(v == null ? '' : v).trim();
  let m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(s);
  if (m) return m[3] + '-' + pad2_(m[2]) + '-' + pad2_(m[1]);
  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return m[1] + '-' + m[2] + '-' + m[3];
  return null;
}

function toNumber_(v) {
  if (typeof v === 'number') return v;
  const t = String(v == null ? '' : v).replace(/[\s ₽]/g, '').replace(',', '.');
  const n = Number(t);
  return t && !isNaN(n) ? n : 0;
}

function zeros_(n) { const a = []; for (let i = 0; i < n; i++) a.push(0); return a; }
function pad2_(s) { return String(s).length < 2 ? '0' + s : String(s); }
function round2_(v) { return Math.round(v * 100) / 100; }
function sortDays_(obj) {
  return Object.keys(obj).sort().map(function (k) { return obj[k]; });
}

/** Для проверки из редактора: Выполнить → testBuild, затем смотреть «Журнал выполнения». */
function testBuild() {
  const data = buildDashboard_();
  Logger.log('Обучение: %s дней, Сверка: %s дней', data.training.days.length, data.recon.days.length);
  Logger.log('Не найдено: %s / %s', data.training.missing.join(', '), data.recon.missing.join(', '));
}
