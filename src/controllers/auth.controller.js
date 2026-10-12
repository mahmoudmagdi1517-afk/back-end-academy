const authService = require('../services/auth.service');
const { asyncHandler } = require('../middlewares/asyncHandler');

const login = asyncHandler(async (req, res) => {
  const result = await authService.login({
    email: req.body.email,
    password: req.body.password,
    userAgent: req.headers['user-agent'],
  });
  res.json({ success: true, data: result });
});

const refresh = asyncHandler(async (req, res) => {
  const result = await authService.refresh({
    refreshToken: req.body.refreshToken,
    userAgent: req.headers['user-agent'],
  });
  res.json({ success: true, data: result });
});

const logout = asyncHandler(async (req, res) => {
  await authService.logout({ refreshToken: req.body.refreshToken });
  res.json({ success: true });
});

const me = asyncHandler(async (req, res) => {
  res.json({ success: true, data: authService.sanitizeUser(req.user) });
});

const createUser = asyncHandler(async (req, res) => {
  const user = await authService.createUser(req.body);
  res.status(201).json({ success: true, data: user });
});

module.exports = { login, refresh, logout, me, createUser };
