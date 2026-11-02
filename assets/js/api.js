import { CONFIG } from './config.js';

const TRAINING_SITES = [
  'СЦ МСК Тарный', 'СЦ Краснодар', 'СЦ/ФФЦ Самара', 'СЦ/ФФЦ Казань',
  'СЦ/ФФЦ Екатеринбург', 'СЦ СПБ Троицкий', 'СЦ СПБ Бугры', 'ФФЦ Фортис',
];
const RECON_SITES = [
  'СЦ МСК Тарный', 'СЦ МСК Строгино', 'СЦ МСК Дзержинский', 'СЦ МСК Кувекино',
  'СЦ СПБ Троицкий', 'СЦ СПБ Бугры', 'ФФЦ СПБ Фортис', 'СЦ Самара КГТ',
  'СЦ Екатеринбург', 'ФФЦ Екатеринбург', 'СЦ Краснодар', 'СЦ Нижний Новгород',
  'СЦ Казань', 'ФФЦ Казань',
];

/** Загружает данные. Возвращает { training, recon, generatedAt, demo }. */
export async function loadData({ fresh = false } = {}) {
  if (!CONFIG.API_URL) return demoData();
  const url = new URL(CONFIG.API_URL);
  if (fresh) url.searchParams.set('fresh', Date.now());
  const res = await fetch(url.toString(), { redirect: 'follow' });
  if (!res.ok) throw new Error(`Сервер ответил ${res.status}`);
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'Скрипт вернул ошибку');
  validate(json);
  return { ...json, demo: false };
}

function validate(json) {
  for (const key of ['training', 'recon']) {
    const block = json[key];
    if (!block || !Array.isArray(block.sites) || !Array.isArray(block.days)) {
      throw new Error(`В ответе нет блока «${key}»`);
    }
  }
}

/* ---------- Демо-режим: правдоподобные, но выдуманные числа ---------- */

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function isoDaysBack(n) {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function demoData() {
  const r = rng(20261030);
  const leadScale = [42, 12, 18, 5, 17, 12, 4, 6];
  const shiftScale = [130, 1, 2, 3, 30, 2, 22, 34, 26, 18, 21, 3, 3, 10];
  const avgCheck = [12500, 4800, 8900, 5500, 8100, 4900, 11200, 9400, 12000, 9900, 14000, 8200, 9500, 9800];

  const training = { sites: TRAINING_SITES, days: [] };
  for (let i = 90; i >= 0; i--) {
    const d = isoDaysBack(i);
    const wk = new Date(d).getDay();
    const k = wk === 0 || wk === 6 ? 0.55 : 1;
    const leads = leadScale.map((s) => Math.round(s * k * (0.6 + r() * 0.8)));
    const ratio = i < 3 ? 0.02 : 0.18 + r() * 0.2;
    const came = leads.map((l) => Math.round(l * ratio * (0.6 + r() * 0.8)));
    training.days.push({ d, leads, came });
  }

  const recon = { sites: RECON_SITES, rate: CONFIG.RATE, days: [] };
  for (let i = 30; i >= 1; i--) {
    const d = isoDaysBack(i);
    const shifts = shiftScale.map((s) => (r() < 0.12 && s < 5 ? 0 : Math.round(s * (0.8 + r() * 0.4))));
    const turnover = shifts.map((n, j) => Math.round(n * avgCheck[j] * (0.85 + r() * 0.3) * 100) / 100);
    const earnings = turnover.map((v) => Math.round((v / CONFIG.RATE) * 100) / 100);
    recon.days.push({ d, shifts, turnover, earnings });
  }

  return { ok: true, generatedAt: new Date().toISOString(), training, recon, demo: true };
}
