const { Employee } = require('../models/Employee');
const { User } = require('../models/User');
const { Payroll } = require('../models/Payroll');
const { Leave } = require('../models/Leave');
const { Notification } = require('../models/Notification');
const hr = require('../services/hr.service');
const { runDailyJob } = require('../services/jobs.service');
const { asyncHandler } = require('../middlewares/asyncHandler');
const { AppError } = require('../utils/AppError');
const { PAYROLL_STATUS } = require('../constants');

const createEmployee = asyncHandler(async (req, res) => {
  const employee = await hr.createEmployee(req.body);
  res.status(201).json({ success: true, data: employee });
});

const listEmployees = asyncHandler(async (_req, res) => {
  const [employees, linkedUsers] = await Promise.all([
    Employee.find().sort({ name: 1 }),
    User.find({ employeeId: { $ne: null } }).select('employeeId'),
  ]);
  const linkedIds = new Set(linkedUsers.map((user) => String(user.employeeId)));
  const rows = employees.map((employee) => ({
    ...employee.toObject(),
    role: employee.role || (employee.isTeacher ? 'instructor' : 'staff'),
    hasUserAccount: linkedIds.has(String(employee._id)),
  }));
  res.json({ success: true, data: rows });
});

const setSalary = asyncHandler(async (req, res) => {
  const cfg = await hr.setSalaryConfiguration({
    employeeId: req.params.id,
    ...req.body,
    actorId: req.user._id,
  });
  res.status(201).json({ success: true, data: cfg });
});

const calculatePayroll = asyncHandler(async (req, res) => {
  const payroll = await hr.calculatePayroll({
    employeeId: req.params.id,
    year: req.body.year,
    month: req.body.month,
  });
  res.json({ success: true, data: payroll });
});

const reviewPayroll = asyncHandler(async (req, res) => {
  const payroll = await hr.transitionPayroll({
    payrollId: req.params.payrollId,
    toStatus: PAYROLL_STATUS.REVIEWED,
    actorId: req.user._id,
  });
  res.json({ success: true, data: payroll });
});

const approvePayroll = asyncHandler(async (req, res) => {
  const payroll = await hr.transitionPayroll({
    payrollId: req.params.payrollId,
    toStatus: PAYROLL_STATUS.APPROVED,
    actorId: req.user._id,
  });
  res.json({ success: true, data: payroll });
});

const payPayroll = asyncHandler(async (req, res) => {
  const payroll = await hr.transitionPayroll({
    payrollId: req.params.payrollId,
    toStatus: PAYROLL_STATUS.PAID,
    actorId: req.user._id,
    cashboxId: req.body.cashboxId,
  });
  res.json({ success: true, data: payroll });
});

const getPayroll = asyncHandler(async (req, res) => {
  const payroll = await Payroll.findById(req.params.payrollId);
  if (!payroll) throw new AppError('payroll.notFound', 404);
  res.json({ success: true, data: payroll });
});

const createAdjustment = asyncHandler(async (req, res) => {
  const adj = await hr.createAdjustment({
    employeeId: req.params.id,
    ...req.body,
    actorId: req.user._id,
  });
  res.status(201).json({ success: true, data: adj });
});

const approveAdjustment = asyncHandler(async (req, res) => {
  const adj = await hr.approveAdjustment({
    adjustmentId: req.params.adjustmentId,
    actorId: req.user._id,
  });
  res.json({ success: true, data: adj });
});

const createLeave = asyncHandler(async (req, res) => {
  const leave = await hr.createLeave({
    employeeId: req.params.id,
    ...req.body,
    actorId: req.user._id,
  });
  res.status(201).json({ success: true, data: leave });
});

const listLeaves = asyncHandler(async (req, res) => {
  const rows = await Leave.find({ employeeId: req.params.id }).sort({ startDate: -1 });
  res.json({ success: true, data: rows });
});

const listNotifications = asyncHandler(async (req, res) => {
  const rows = await Notification.find().sort({ createdAt: -1 }).limit(100);
  res.json({ success: true, data: rows });
});

const runJobsNow = asyncHandler(async (_req, res) => {
  const result = await runDailyJob();
  res.json({ success: true, data: result });
});

module.exports = {
  createEmployee,
  listEmployees,
  setSalary,
  calculatePayroll,
  reviewPayroll,
  approvePayroll,
  payPayroll,
  getPayroll,
  createAdjustment,
  approveAdjustment,
  createLeave,
  listLeaves,
  listNotifications,
  runJobsNow,
};
