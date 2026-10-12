const { t, resolveLocale } = require('../i18n');
const { AppError } = require('../utils/AppError');

function notFoundHandler(req, res, next) {
  next(new AppError('common.notFound', 404));
}

function errorHandler(err, req, res, _next) {
  const locale = resolveLocale(req);

  if (err.name === 'ValidationError' && err.isJoi) {
    return res.status(400).json({
      success: false,
      messageKey: 'common.validation',
      message: t(locale, 'common.validation'),
      details: err.details?.map((d) => ({ path: d.path.join('.'), message: d.message })),
    });
  }

  if (err.code === 11000) {
    return res.status(409).json({
      success: false,
      messageKey: 'common.conflict',
      message: t(locale, 'common.conflict'),
      details: err.keyValue,
    });
  }

  const status = err.statusCode || 500;
  const messageKey = err.messageKey || (status >= 500 ? 'common.internal' : err.message) || 'common.internal';

  if (status >= 500) {
    // eslint-disable-next-line no-console
    console.error(err);
  }

  return res.status(status).json({
    success: false,
    messageKey,
    message: t(locale, messageKey, err.message),
    details: err.details,
  });
}

module.exports = { notFoundHandler, errorHandler };
