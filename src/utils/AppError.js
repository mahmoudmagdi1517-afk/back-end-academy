class AppError extends Error {
  constructor(messageKey, statusCode = 400, details = undefined) {
    super(messageKey);
    this.name = 'AppError';
    this.messageKey = messageKey;
    this.statusCode = statusCode;
    this.details = details;
    this.isOperational = true;
  }
}

module.exports = { AppError };
