const express = require('express');
const { validate } = require('../middlewares/validate');
const { authenticate, requirePermission, requireRoles } = require('../middlewares/auth.middleware');
const schemas = require('../validators/schemas');
const ctrl = require('../controllers/hr.controller');
const { ROLES } = require('../constants');

const router = express.Router();
router.use(authenticate);
router.get('/notifications', requireRoles(ROLES.ADMIN, ROLES.MANAGER, ROLES.OWNER), ctrl.listNotifications);
router.use(requirePermission('hr.access'));

router.post('/employees', validate(schemas.createEmployee), ctrl.createEmployee);
router.get('/employees', ctrl.listEmployees);
router.post('/employees/:id/salary', validate(schemas.salaryConfig), ctrl.setSalary);
router.post('/employees/:id/payroll/calculate', requirePermission('payroll.access'), validate(schemas.payrollCalc), ctrl.calculatePayroll);
router.post('/employees/:id/adjustments', requirePermission('payroll.access'), validate(schemas.createAdjustment), ctrl.createAdjustment);
router.post('/adjustments/:adjustmentId/approve', requirePermission('payroll.access'), ctrl.approveAdjustment);
router.post('/employees/:id/leaves', validate(schemas.createLeave), ctrl.createLeave);
router.get('/employees/:id/leaves', ctrl.listLeaves);

router.get('/payrolls/:payrollId', requirePermission('payroll.access'), ctrl.getPayroll);
router.post('/payrolls/:payrollId/review', requirePermission('payroll.access'), ctrl.reviewPayroll);
router.post('/payrolls/:payrollId/approve', requirePermission('payroll.access'), ctrl.approvePayroll);
router.post('/payrolls/:payrollId/pay', requirePermission('payroll.access'), validate(schemas.payPayroll), ctrl.payPayroll);

router.post('/jobs/run-daily', requireRoles(ROLES.OWNER, ROLES.MANAGER), ctrl.runJobsNow);

module.exports = router;
