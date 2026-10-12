const express = require('express');
const { validate } = require('../middlewares/validate');
const { authenticate, requirePermission, requireRoles } = require('../middlewares/auth.middleware');
const schemas = require('../validators/schemas');
const ctrl = require('../controllers/auth.controller');
const { ROLES } = require('../constants');

const router = express.Router();

router.post('/login', validate(schemas.login), ctrl.login);
router.post('/refresh', validate(schemas.refresh), ctrl.refresh);
router.post('/logout', validate(schemas.refresh), ctrl.logout);
router.get('/me', authenticate, ctrl.me);
router.post(
  '/users',
  authenticate,
  requireRoles(ROLES.OWNER, ROLES.MANAGER),
  validate(schemas.createUser),
  ctrl.createUser
);

module.exports = router;
