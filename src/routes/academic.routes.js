const express = require('express');
const { validate } = require('../middlewares/validate');
const { authenticate, requirePermission, requireRoles } = require('../middlewares/auth.middleware');
const schemas = require('../validators/schemas');
const ctrl = require('../controllers/academic.controller');
const { ROLES } = require('../constants');

const router = express.Router();
router.use(authenticate);

router.get('/teacher/roster', requireRoles(ROLES.TEACHER), ctrl.listTeacherRoster);
router.post(
  '/teacher/subscriptions/:id/transfer-group',
  requireRoles(ROLES.TEACHER),
  validate(schemas.transferGroup),
  ctrl.transferGroup
);

router.post('/students', requirePermission('student.manage'), validate(schemas.createStudent), ctrl.createStudent);
router.get('/students', requirePermission('student.manage'), ctrl.listStudents);
router.get('/students/:id', requirePermission('student.manage'), ctrl.getStudent);

router.post('/courses', requirePermission('course.manage'), validate(schemas.createCourse), ctrl.createCourse);
router.patch('/courses/:id', requirePermission('course.manage'), validate(schemas.updateCourse), ctrl.updateCourse);
router.delete('/courses/:id', requirePermission('course.manage'), ctrl.archiveCourse);
router.get('/courses', requirePermission('course.manage'), ctrl.listCourses);

router.post('/groups', requirePermission('group.manage'), validate(schemas.createGroup), ctrl.createGroup);
router.patch('/groups/:id', requirePermission('group.manage'), validate(schemas.updateGroup), ctrl.updateGroup);
router.delete('/groups/:id', requirePermission('group.manage'), ctrl.deleteGroup);
router.get('/groups', requirePermission('group.manage'), ctrl.listGroups);

router.post('/subscriptions', requirePermission('finance.access'), validate(schemas.subscribe), ctrl.subscribe);
router.get('/subscriptions', requirePermission('finance.access'), ctrl.listSubscriptions);
router.get('/subscriptions/:id', requirePermission('finance.access'), ctrl.getSubscription);
router.delete('/subscriptions/:id', requirePermission('finance.access'), ctrl.deleteSubscription);
router.post(
  '/subscriptions/:id/transfer-group',
  requirePermission('finance.access'),
  validate(schemas.transferGroup),
  ctrl.transferGroup
);
router.post(
  '/subscriptions/:id/plan',
  requirePermission('installment.modify'),
  validate(schemas.modifyPlan),
  ctrl.modifyPlan
);

module.exports = router;
