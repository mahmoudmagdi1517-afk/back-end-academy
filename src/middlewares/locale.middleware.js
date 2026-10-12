const { resolveLocale } = require('../i18n');

function localeMiddleware(req, _res, next) {
  req.locale = resolveLocale(req);
  next();
}

module.exports = { localeMiddleware };
