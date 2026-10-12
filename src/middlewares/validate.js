const Joi = require('joi');
const { AppError } = require('../utils/AppError');

function validate(schema, source = 'body') {
  return (req, _res, next) => {
    const { error, value } = schema.validate(req[source], {
      abortEarly: false,
      stripUnknown: true,
      convert: true,
    });
    if (error) {
      error.isJoi = true;
      return next(error);
    }
    req[source] = value;
    return next();
  };
}

const objectId = Joi.string().hex().length(24);

module.exports = { validate, objectId, Joi };
