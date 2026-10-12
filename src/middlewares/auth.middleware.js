const jwt = require('jsonwebtoken');
const { AppError } = require('../utils/AppError');
const { User } = require('../models/User');
const { PERMISSIONS } = require('../constants');

async function authenticate(req, _res, next) {
  try {
    const header = req.headers.authorization || '';
    const [type, token] = header.split(' ');
    if (type !== 'Bearer' || !token) {
      throw new AppError('common.unauthorized', 401);
    }
    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
    } catch {
      throw new AppError('auth.tokenInvalid', 401);
    }
    const user = await User.findById(payload.sub);
    if (!user || !user.isActive) {
      throw new AppError('auth.userInactive', 401);
    }
    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

function requireRoles(...roles) {
  return (req, _res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return next(new AppError('rbac.denied', 403));
    }
    return next();
  };
}

function requirePermission(permissionKey) {
  const allowed = PERMISSIONS[permissionKey];
  if (!allowed) {
    throw new Error(`Unknown permission: ${permissionKey}`);
  }
  return requireRoles(...allowed);
}

module.exports = { authenticate, requireRoles, requirePermission };
