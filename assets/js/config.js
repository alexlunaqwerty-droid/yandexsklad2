// Настройки сайта. Меняются без пересборки — просто отредактируйте и закоммитьте.
export const CONFIG = {
  // URL веб-приложения Apps Script (заканчивается на /exec). Пусто — сайт покажет демо-данные.
  API_URL: 'https://script.google.com/macros/s/AKfycbzKPkMWTrQCkO7qZWAufG37qP7EA-THKTrI0AKPkaF_0r32TxvTUvJsvPdXrqS5WQTN/exec',

  // Как часто обновлять данные, пока страница открыта (минуты).
  REFRESH_MINUTES: 5,

  // Период по умолчанию: последние N дней.
  DEFAULT_DAYS: 14,

  // Коэффициент для заработка исполнителя (используется в подписях и в демо-режиме).
  RATE: 1.82,

  // Ссылки на исходные таблицы (показываются в подвале).
  SOURCES: [
    { title: 'Списки Обучения Бизнес Ресурс', url: 'https://docs.google.com/spreadsheets/d/169aiyVDcZm9yHeYwq4JgYhhlS-ilAiTs7eAzTkavHuY/edit' },
    { title: 'Сверка по проекту', url: 'https://docs.google.com/spreadsheets/d/1Sba2BYOZ4KLeinXKV7a3HWR80dMJ579T9umzCR6qXyE/edit' },
  ],
};
