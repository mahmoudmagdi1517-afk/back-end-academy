const express = require('express');
const { validate } = require('../middlewares/validate');
const { authenticate, requirePermission, requireRoles } = require('../middlewares/auth.middleware');
const schemas = require('../validators/schemas');
const ctrl = require('../controllers/session.controller');
const { ROLES } = require('../constants');

const router = express.Router();
router.use(authenticate);

router.post('/', requireRoles(ROLES.MANAGER, ROLES.OWNER, ROLES.ADMIN), validate(schemas.createSession), ctrl.createSession);
router.get('/teacher-dashboard', requireRoles(ROLES.TEACHER), ctrl.getTeacherDashboard);
router.get('/', requireRoles(ROLES.MANAGER, ROLES.OWNER, ROLES.ADMIN, ROLES.TEACHER), ctrl.listSessions);

router.post('/makeups', requirePermission('makeup.create'), validate(schemas.createMakeup), ctrl.createMakeup);
router.get('/makeups', requireRoles(ROLES.MANAGER, ROLES.OWNER), ctrl.listMakeups);
router.post('/makeups/:id/missed', requirePermission('makeup.create'), ctrl.markMakeupMissed);

router.get('/:id', requireRoles(ROLES.MANAGER, ROLES.OWNER, ROLES.ADMIN, ROLES.TEACHER), ctrl.getSession);
router.post('/:id/postpone', requirePermission('session.postpone'), validate(schemas.postponeSession), ctrl.postponeSession);
router.post('/:id/cancel', requirePermission('session.cancel'), validate(schemas.cancelSession), ctrl.cancelSession);
router.post(
  '/:id/attendance/batch',
  requirePermission('attendance.record'),
  validate(schemas.attendanceBatch),
  ctrl.upsertAttendanceBatch
);
router.post('/:id/attendance', requirePermission('attendance.record'), validate(schemas.upsertAttendance), ctrl.upsertAttendance);
router.post('/:id/close', requirePermission('session.close'), ctrl.closeSession);

module.exports = router;
