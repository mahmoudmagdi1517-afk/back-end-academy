const en = require('./en');
const ar = require('./ar');
const { DEFAULT_LOCALE, LOCALES } = require('../constants');

const catalogs = { en, ar };

function resolveLocale(req) {
  const header = (req.headers['accept-language'] || '').split(',')[0].trim().toLowerCase();
  const short = header.slice(0, 2);
  if (LOCALES.includes(short)) return short;
  if (req.user && LOCALES.includes(req.user.locale)) return req.user.locale;
  return DEFAULT_LOCALE;
}

function t(locale, key, fallback) {
  const cat = catalogs[locale] || catalogs[DEFAULT_LOCALE];
  return cat[key] || catalogs.en[key] || fallback || key;
}

module.exports = { t, resolveLocale, catalogs };
