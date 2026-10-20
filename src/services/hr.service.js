const { Employee } = require('../models/Employee');
const { TeacherProfile } = require('../models/TeacherProfile');
const { SalaryConfiguration } = require('../models/SalaryConfiguration');
const { Payroll } = require('../models/Payroll');
const { PayrollAdjustment } = require('../models/PayrollAdjustment');
const { Leave } = require('../models/Leave');
const { Session } = require('../models/Session');
const { User } = require('../models/User');
const { Group } = require('../models/Group');
const { AppError } = require('../utils/AppError');
const { withTransaction } = require('../utils/transaction');
const {
  SALARY_TYPE,
  PAYROLL_STATUS,
  SESSION_STATUS,
  LEAVE_STATUS,
  ROLES,
  EMPLOYEE_ROLES,
  CURRENCY,
} = require('../constants');
const { nowUtc } = require('../utils/time');
const { DateTime } = require('luxon');
const { TIMEZONE } = require('../constants');
const { nextSeq } = require('../models/Counter');
const { recordMovement } = require('./treasury.service');

async function createEmployee(payload) {
  const seq = await nextSeq('employeeCode');
  const employeeCode = payload.employeeCode || `EMP-${String(seq).padStart(5, '0')}`;
  const role = payload.role || (payload.isTeacher ? EMPLOYEE_ROLES.INSTRUCTOR : EMPLOYEE_ROLES.STAFF);
  const isTeacher = role === EMPLOYEE_ROLES.INSTRUCTOR;
  const employee = await Employee.create({
    employeeCode,
    name: payload.name,
    nameAr: payload.nameAr || null,
    phone: payload.phone || null,
    email: payload.email || null,
    hireDate: payload.hireDate || null,
    isTeacher,
    role,
  });
  if (isTeacher) {
    await TeacherProfile.create({
      employeeId: employee._id,
      specialties: payload.specialties || [],
      notes: payload.notes || null,
    });
  }
  return employee;
}

async function updateEmployee({ employeeId, payload }) {
  return withTransaction(async (session) => {
    const employee = await Employee.findById(employeeId).session(session);
    if (!employee) throw new AppError('employee.notFound', 404);

    const nextRole = payload.role || employee.role || (
      employee.isTeacher ? EMPLOYEE_ROLES.INSTRUCTOR : EMPLOYEE_ROLES.STAFF
    );
    const roleChanged = nextRole !== employee.role;
    if (roleChanged) {
      const [linkedUser, assignedGroup, assignedSession] = await Promise.all([
        User.exists({ employeeId }).session(session),
        Group.exists({ teacherEmployeeId: employeeId }).session(session),
        Session.exists({ teacherEmployeeId: employeeId }).session(session),
      ]);
      if (linkedUser) throw new AppError('employee.accountRoleChange', 409);
      if (assignedGroup || assignedSession) throw new AppError('employee.roleInUse', 409);
    }

    for (const field of ['name', 'nameAr', 'phone', 'email', 'hireDate']) {
      if (payload[field] !== undefined) employee[field] = payload[field] || null;
    }
    employee.role = nextRole;
    employee.isTeacher = nextRole === EMPLOYEE_ROLES.INSTRUCTOR;
    await employee.save({ session });

    if (employee.isTeacher) {
      await TeacherProfile.findOneAndUpdate(
        { employeeId },
        {
          $set: {
            specialties: payload.specialties || [],
            notes: payload.notes || null,
          },
          $setOnInsert: { employeeId },
        },
        { upsert: true, new: true, runValidators: true, session }
      );
    } else {
      await TeacherProfile.deleteOne({ employeeId }, { session });
    }
    return employee;
  });
}

async function deleteEmployee(employeeId) {
  return withTransaction(async (session) => {
    const employee = await Employee.findById(employeeId).session(session);
    if (!employee) throw new AppError('employee.notFound', 404);

    const references = await Promise.all([
      User.exists({ employeeId }).session(session),
      Group.exists({ teacherEmployeeId: employeeId }).session(session),
      Session.exists({ teacherEmployeeId: employeeId }).session(session),
      SalaryConfiguration.exists({ employeeId }).session(session),
      Payroll.exists({ employeeId }).session(session),
      PayrollAdjustment.exists({ employeeId }).session(session),
      Leave.exists({ employeeId }).session(session),
    ]);
    if (references.some(Boolean)) throw new AppError('employee.hasRecords', 409);

    await TeacherProfile.deleteOne({ employeeId }, { session });
    await employee.deleteOne({ session });
    return employee;
  });
}

async function linkTeacherUser({ userId, employeeId }) {
  const [user, employee] = await Promise.all([
    User.findById(userId),
    Employee.findById(employeeId),
  ]);
  if (!user) throw new AppError('common.notFound', 404);
  if (!employee) throw new AppError('employee.notFound', 404);
  if (employee.role && employee.role !== EMPLOYEE_ROLES.INSTRUCTOR) {
    throw new AppError('employee.roleMismatch', 400);
  }
  user.employeeId = employee._id;
  user.role = ROLES.TEACHER;
  employee.isTeacher = true;
  employee.role = EMPLOYEE_ROLES.INSTRUCTOR;
  await Promise.all([user.save(), employee.save()]);
  const profile = await TeacherProfile.findOneAndUpdate(
    { employeeId },
    { $setOnInsert: { employeeId } },
    { upsert: true, new: true }
  );
  return { user, employee, profile };
}

async function setSalaryConfiguration({ employeeId, type, fixedMonthly, sessionRate, effectiveFrom, notes, actorId }) {
  const employee = await Employee.findById(employeeId);
  if (!employee) throw new AppError('employee.notFound', 404);

  await SalaryConfiguration.updateMany({ employeeId, isCurrent: true }, { $set: { isCurrent: false } });
  const last = await SalaryConfiguration.findOne({ employeeId }).sort({ version: -1 });
  const version = last ? last.version + 1 : 1;

  return SalaryConfiguration.create({
    employeeId,
    version,
    effectiveFrom,
    type,
    fixedMonthly: fixedMonthly || 0,
    sessionRate: sessionRate || 0,
    currency: CURRENCY,
    notes: notes || null,
    createdBy: actorId,
    isCurrent: true,
  });
}

function monthDateRange(year, month) {
  const start = DateTime.fromObject({ year, month, day: 1 }, { zone: TIMEZONE }).toISODate();
  const end = DateTime.fromObject({ year, month, day: 1 }, { zone: TIMEZONE })
    .plus({ months: 1 })
    .minus({ days: 1 })
    .toISODate();
  return { start, end };
}

async function getOrCreatePayroll({ employeeId, year, month }) {
  let payroll = await Payroll.findOne({ employeeId, year, month });
  if (!payroll) {
    payroll = await Payroll.create({ employeeId, year, month, status: PAYROLL_STATUS.DRAFT });
  }
  return payroll;
}

async function calculatePayroll({ employeeId, year, month }) {
  const employee = await Employee.findById(employeeId);
  if (!employee) throw new AppError('employee.notFound', 404);

  const payroll = await getOrCreatePayroll({ employeeId, year, month });
  if (payroll.status !== PAYROLL_STATUS.DRAFT && payroll.status !== PAYROLL_STATUS.CALCULATED) {
    throw new AppError('payroll.notDraft', 400);
  }

  const salary = await SalaryConfiguration.findOne({ employeeId, isCurrent: true });
  const { start, end } = monthDateRange(year, month);

  let sessionCount = 0;
  let sessionEarnings = 0;
  const sessionRate = salary?.sessionRate || 0;

  if (
    salary &&
    (salary.type === SALARY_TYPE.PER_SESSION || salary.type === SALARY_TYPE.MIXED) &&
    employee.isTeacher
  ) {
    sessionCount = await Session.countDocuments({
      teacherEmployeeId: employeeId,
      status: SESSION_STATUS.COMPLETED,
      currentDate: { $gte: start, $lte: end },
    });
    sessionEarnings = sessionCount * sessionRate;
  }

  const fixedAmount =
    salary && (salary.type === SALARY_TYPE.FIXED_MONTHLY || salary.type === SALARY_TYPE.MIXED)
      ? salary.fixedMonthly || 0
      : 0;

  // Non-teachers: fixed_monthly (session earnings 0)
  if (!employee.isTeacher) {
    sessionCount = 0;
    sessionEarnings = 0;
  }

  const lines = [];
  if (fixedAmount) {
    lines.push({ code: 'FIXED', label: 'Fixed monthly', amount: fixedAmount });
  }
  if (sessionEarnings) {
    lines.push({
      code: 'SESSIONS',
      label: `Sessions x ${sessionCount}`,
      amount: sessionEarnings,
      meta: { sessionCount, sessionRate },
    });
  }

  const approvedAdj = await PayrollAdjustment.find({
    employeeId,
    status: 'approved',
    payrollId: null,
  });

  for (const adj of approvedAdj) {
    const signed =
      adj.kind === 'bonus' ? adj.amount : adj.kind === 'deduction' || adj.kind === 'advance' ? -adj.amount : 0;
    lines.push({
      code: adj.kind.toUpperCase(),
      label: adj.reason,
      amount: signed,
      meta: { adjustmentId: String(adj._id) },
    });
  }

  const grossAmount = lines.reduce((s, l) => s + l.amount, 0);

  payroll.lines = lines;
  payroll.sessionCount = sessionCount;
  payroll.sessionEarnings = sessionEarnings;
  payroll.fixedAmount = fixedAmount;
  payroll.grossAmount = grossAmount;
  payroll.netAmount = grossAmount;
  payroll.status = PAYROLL_STATUS.CALCULATED;
  payroll.calculatedAt = nowUtc();
  await payroll.save();

  return payroll;
}

async function updateDraftPayrollLines({ payrollId, lines }) {
  const payroll = await Payroll.findById(payrollId);
  if (!payroll) throw new AppError('payroll.notFound', 404);
  if (payroll.status !== PAYROLL_STATUS.DRAFT && payroll.status !== PAYROLL_STATUS.CALCULATED) {
    throw new AppError('payroll.notDraft', 400);
  }
  payroll.lines = lines;
  payroll.grossAmount = lines.reduce((s, l) => s + l.amount, 0);
  payroll.netAmount = payroll.grossAmount;
  payroll.status = PAYROLL_STATUS.DRAFT;
  await payroll.save();
  return payroll;
}

async function transitionPayroll({ payrollId, toStatus, actorId, cashboxId }) {
  return withTransaction(async (session) => {
    const payroll = await Payroll.findById(payrollId).session(session);
    if (!payroll) throw new AppError('payroll.notFound', 404);

    const order = [
      PAYROLL_STATUS.DRAFT,
      PAYROLL_STATUS.CALCULATED,
      PAYROLL_STATUS.REVIEWED,
      PAYROLL_STATUS.APPROVED,
      PAYROLL_STATUS.PAID,
    ];
    const fromIdx = order.indexOf(payroll.status);
    const toIdx = order.indexOf(toStatus);
    if (toIdx !== fromIdx + 1) {
      throw new AppError('payroll.immutable', 400);
    }

    if (toStatus === PAYROLL_STATUS.REVIEWED) {
      payroll.reviewedAt = nowUtc();
      payroll.reviewedBy = actorId;
    }
    if (toStatus === PAYROLL_STATUS.APPROVED) {
      payroll.approvedAt = nowUtc();
      payroll.approvedBy = actorId;
      payroll.snapshot = {
        lines: payroll.lines,
        sessionCount: payroll.sessionCount,
        sessionEarnings: payroll.sessionEarnings,
        fixedAmount: payroll.fixedAmount,
        grossAmount: payroll.grossAmount,
        netAmount: payroll.netAmount,
        currency: payroll.currency,
      };
      // attach approved adjustments
      const adjIds = payroll.lines
        .map((l) => l.meta?.adjustmentId)
        .filter(Boolean);
      if (adjIds.length) {
        await PayrollAdjustment.updateMany(
          { _id: { $in: adjIds } },
          { $set: { status: 'applied', payrollId: payroll._id } },
          { session }
        );
      }
    }
    if (toStatus === PAYROLL_STATUS.PAID) {
      if (payroll.status !== PAYROLL_STATUS.APPROVED) {
        throw new AppError('payroll.immutable', 400);
      }
      if (payroll.netAmount < 0) throw new AppError('payroll.invalidAmount', 400);
      if (payroll.netAmount > 0) {
        await recordMovement({
          cashboxId,
          kind: 'payroll',
          direction: 'out',
          amount: payroll.netAmount,
          description: `Payroll ${payroll.month}/${payroll.year}`,
          referenceId: payroll._id,
          referenceType: 'payroll',
          actorId,
          occurredAt: nowUtc(),
          session,
        });
      }
      payroll.paidAt = nowUtc();
      payroll.paidBy = actorId;
      payroll.paidCashboxId = cashboxId;
    }

    payroll.status = toStatus;
    await payroll.save({ session });
    return payroll;
  });
}

async function createAdjustment({ employeeId, kind, amount, reason, actorId }) {
  return PayrollAdjustment.create({
    employeeId,
    kind,
    amount,
    reason,
    createdBy: actorId,
  });
}

async function approveAdjustment({ adjustmentId, actorId }) {
  const adj = await PayrollAdjustment.findById(adjustmentId);
  if (!adj) throw new AppError('common.notFound', 404);
  adj.status = 'approved';
  adj.approvedBy = actorId;
  adj.approvedAt = nowUtc();
  await adj.save();
  return adj;
}

async function createLeave({ employeeId, startDate, endDate, reason, actorId }) {
  if (endDate < startDate) throw new AppError('common.validation', 400);

  const overlap = await Leave.findOne({
    employeeId,
    status: LEAVE_STATUS.APPROVED,
    startDate: { $lte: endDate },
    endDate: { $gte: startDate },
  });
  if (overlap) throw new AppError('leave.overlap', 409);

  return Leave.create({
    employeeId,
    startDate,
    endDate,
    reason: reason || null,
    status: LEAVE_STATUS.APPROVED,
    createdBy: actorId,
  });
}

module.exports = {
  createEmployee,
  updateEmployee,
  deleteEmployee,
  linkTeacherUser,
  setSalaryConfiguration,
  getOrCreatePayroll,
  calculatePayroll,
  updateDraftPayrollLines,
  transitionPayroll,
  createAdjustment,
  approveAdjustment,
  createLeave,
  monthDateRange,
};
