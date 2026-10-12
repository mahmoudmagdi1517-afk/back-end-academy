const jwt = require('jsonwebtoken');
const { DateTime } = require('luxon');
const { User } = require('../models/User');
const { Employee } = require('../models/Employee');
const { RefreshToken } = require('../models/RefreshToken');
const { AppError } = require('../utils/AppError');
const { hashToken, randomToken } = require('../utils/crypto');
const { ROLES, EMPLOYEE_ROLES } = require('../constants');

function signAccessToken(user) {
  return jwt.sign(
    { sub: String(user._id), role: user.role, email: user.email },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: process.env.JWT_ACCESS_EXPIRES || '15m' }
  );
}

function refreshExpiryDate() {
  const raw = process.env.JWT_REFRESH_EXPIRES || '7d';
  const match = /^(\d+)([dhms])$/.exec(raw);
  if (!match) {
    return DateTime.utc().plus({ days: 7 }).toJSDate();
  }
  const n = Number(match[1]);
  const unit = { d: 'days', h: 'hours', m: 'minutes', s: 'seconds' }[match[2]];
  return DateTime.utc().plus({ [unit]: n }).toJSDate();
}

async function login({ email, password, userAgent }) {
  const user = await User.findOne({ email: email.toLowerCase() }).select('+passwordHash');
  if (!user || !user.isActive) {
    throw new AppError('auth.invalidCredentials', 401);
  }
  const ok = await user.comparePassword(password);
  if (!ok) {
    throw new AppError('auth.invalidCredentials', 401);
  }

  const accessToken = signAccessToken(user);
  const refreshPlain = randomToken();
  await RefreshToken.create({
    userId: user._id,
    tokenHash: hashToken(refreshPlain),
    expiresAt: refreshExpiryDate(),
    userAgent: userAgent || null,
  });

  return {
    accessToken,
    refreshToken: refreshPlain,
    user: sanitizeUser(user),
  };
}

async function refresh({ refreshToken, userAgent }) {
  const tokenHash = hashToken(refreshToken);
  const stored = await RefreshToken.findOne({ tokenHash, revokedAt: null });
  if (!stored || stored.expiresAt < new Date()) {
    throw new AppError('auth.refreshInvalid', 401);
  }
  const user = await User.findById(stored.userId);
  if (!user || !user.isActive) {
    throw new AppError('auth.userInactive', 401);
  }

  stored.revokedAt = new Date();
  await stored.save();

  const accessToken = signAccessToken(user);
  const refreshPlain = randomToken();
  await RefreshToken.create({
    userId: user._id,
    tokenHash: hashToken(refreshPlain),
    expiresAt: refreshExpiryDate(),
    userAgent: userAgent || null,
  });

  return { accessToken, refreshToken: refreshPlain, user: sanitizeUser(user) };
}

async function logout({ refreshToken }) {
  if (!refreshToken) return;
  const tokenHash = hashToken(refreshToken);
  await RefreshToken.updateOne({ tokenHash, revokedAt: null }, { $set: { revokedAt: new Date() } });
}

function sanitizeUser(user) {
  return {
    id: String(user._id),
    email: user.email,
    name: user.name,
    role: user.role,
    locale: user.locale,
    employeeId: user.employeeId ? String(user.employeeId) : null,
  };
}

async function createUser({ email, password, name, role, locale, employeeId }) {
  if (role === ROLES.OWNER) {
    const existingOwner = await User.exists({ role: ROLES.OWNER });
    if (existingOwner) {
      throw new AppError('common.forbidden', 403);
    }
    if ([ROLES.MANAGER, ROLES.TEACHER].includes(role)) {
      if (!employeeId) throw new AppError('employee.accountRequiresProfile', 400);
      const employee = await Employee.findById(employeeId);
      const employeeRole = employee?.role || (employee?.isTeacher ? EMPLOYEE_ROLES.INSTRUCTOR : null);
      const expectedRole = role === ROLES.TEACHER ? EMPLOYEE_ROLES.INSTRUCTOR : EMPLOYEE_ROLES.MANAGER;
      if (!employee || employeeRole !== expectedRole) {
        throw new AppError('employee.roleMismatch', 400);
      }
      if (await User.exists({ employeeId })) {
        throw new AppError('employee.accountExists', 409);
      }
    }
  }
  const passwordHash = await User.hashPassword(password);
  const user = await User.create({
    email,
    passwordHash,
    name,
    role,
    locale,
    employeeId: employeeId || null,
  });
  return sanitizeUser(user);
}

module.exports = {
  login,
  refresh,
  logout,
  createUser,
  sanitizeUser,
  signAccessToken,
};
