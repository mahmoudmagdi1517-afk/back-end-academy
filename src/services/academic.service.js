const mongoose = require('mongoose');
const { Student } = require('../models/Student');
const { Course } = require('../models/Course');
const { Group } = require('../models/Group');
const { Session } = require('../models/Session');
const { Attendance } = require('../models/Attendance');
const { MakeupSession } = require('../models/MakeupSession');
const { Employee } = require('../models/Employee');
const { Subscription } = require('../models/Subscription');
const { Payment } = require('../models/Payment');
const { nextStudentCode, nextReceiptNumber } = require('../models/Counter');
const { recordMovement } = require('./treasury.service');
const { AppError } = require('../utils/AppError');
const {
  SUBSCRIPTION_STATUS,
  CURRENCY,
  INSTALLMENT_STATUS,
  PAYMENT_STATUS,
  SESSION_STATUS,
} = require('../constants');
const { nowUtc, qatarToday } = require('../utils/time');
const { withTeacherScheduleLocks } = require('../utils/teacherScheduleLock');
const {
  refreshInstallmentStatuses,
  assertPlanEditValid,
  buildFifoAllocations,
  applyAllocations,
} = require('./installment.helpers');
const { withTransaction } = require("../utils/transaction");
const sessionService = require('./session.service');
const { ensureLessonBalance } = require('./lessonBalance.service');
function minutesSinceMidnight(time) {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

function assertValidSchedules(schedules) {
  const rows = schedules || [];
  for (let index = 0; index < rows.length; index += 1) {
    const slot = rows[index];
    if (minutesSinceMidnight(slot.endTime) <= minutesSinceMidnight(slot.startTime)) {
      throw new AppError('group.invalidSchedule', 400);
    }
    for (let otherIndex = 0; otherIndex < index; otherIndex += 1) {
      if (schedulesOverlap(slot, rows[otherIndex])) {
        throw new AppError('group.duplicateSchedule', 400);
      }
    }
  }
}

function schedulesOverlap(first, second) {
  return (
    first.dayOfWeek === second.dayOfWeek &&
    minutesSinceMidnight(first.startTime) < minutesSinceMidnight(second.endTime) &&
    minutesSinceMidnight(first.endTime) > minutesSinceMidnight(second.startTime)
  );
}

async function assertActiveTeacher(teacherEmployeeId) {
  if (!teacherEmployeeId) return;
  const teacher = await Employee.exists({
    _id: teacherEmployeeId,
    isTeacher: true,
    isActive: true,
  });
  if (!teacher) throw new AppError('employee.notFound', 404);
}

async function assertNoTeacherScheduleConflict({ teacherEmployeeId, schedules, excludeGroupId }) {
  if (!teacherEmployeeId || !schedules?.length) return;
  const query = { teacherEmployeeId, isActive: true };
  if (excludeGroupId) query._id = { $ne: excludeGroupId };
  const groups = await Group.find(query).select('name schedules');
  for (const group of groups) {
    const conflict = schedules.find((slot) =>
      (group.schedules || []).some((other) => schedulesOverlap(slot, other))
    );
    if (conflict) {
      throw new AppError('group.teacherScheduleConflict', 409, {
        groupId: group._id,
        groupName: group.name,
        dayOfWeek: conflict.dayOfWeek,
        startTime: conflict.startTime,
        endTime: conflict.endTime,
      });
    }
  }
}

async function createStudent(payload, session) {
  const code = payload.studentCode || (await nextStudentCode(session));
  try {
    const [student] = await Student.create(
      [
        {
          studentCode: code,
          name: payload.name,
          nameAr: payload.nameAr || null,
          phone: payload.phone || null,
          nationalId: payload.nationalId || null,
          email: payload.email || null,
          dateOfBirth: payload.dateOfBirth || null,
          notes: payload.notes || null,
        },
      ],
      session ? { session } : undefined
    );
    return student;
  } catch (err) {
    if (err.code === 11000) throw new AppError('student.codeExists', 409);
    throw err;
  }
}

async function createCourse(payload) {
  try {
    return await Course.create(payload);
  } catch (err) {
    if (err.code === 11000) throw new AppError('course.codeExists', 409);
    throw err;
  }
}

async function updateCourse(courseId, payload) {
  try {
    const course = await Course.findByIdAndUpdate(
      courseId,
      { $set: payload },
      { new: true, runValidators: true }
    );
    if (!course) throw new AppError('course.notFound', 404);
    return course;
  } catch (err) {
    if (err.code === 11000) throw new AppError('course.codeExists', 409);
    throw err;
  }
}

async function archiveCourse(courseId) {
  const course = await Course.findById(courseId);
  if (!course) throw new AppError('course.notFound', 404);

  const activeGroup = await Group.findOne({ courseId, isActive: true });
  if (activeGroup) throw new AppError('course.activeGroup', 409);

  course.isActive = false;
  await course.save();
  return course;
}

async function createGroup(payload) {
  const course = await Course.findById(payload.courseId);
  if (!course) throw new AppError('course.notFound', 404);
  if (!course.isActive) throw new AppError('course.archived', 409);
  const schedules = payload.schedules || [];
  assertValidSchedules(schedules);
  const group = await withTeacherScheduleLocks([payload.teacherEmployeeId], async () => {
    await assertActiveTeacher(payload.teacherEmployeeId);
    await assertNoTeacherScheduleConflict({
      teacherEmployeeId: payload.teacherEmployeeId,
      schedules,
    });
    return Group.create({
      courseId: payload.courseId,
      name: payload.name,
      nameAr: payload.nameAr || null,
      capacity: payload.capacity ?? null,
      teacherEmployeeId: payload.teacherEmployeeId || null,
      startDate: payload.startDate,
      sessionCount: payload.sessionCount,
      schedules,
      scheduleNote: payload.scheduleNote || null,
    });
  });
  await sessionService.syncGroupSessions(group);
  return group;
}

async function updateGroup(groupId, payload) {
  const original = await Group.findById(groupId);
  if (!original) throw new AppError('group.notFound', 404);

  const updated = await withTeacherScheduleLocks(
    [original.teacherEmployeeId, payload.teacherEmployeeId],
    async () => {
      const current = await Group.findById(groupId);
      if (!current) throw new AppError('group.notFound', 404);
      if (String(current.teacherEmployeeId || '') !== String(original.teacherEmployeeId || '')) {
        throw new AppError('group.scheduleChanged', 409);
      }
      const nextTeacherId = payload.teacherEmployeeId === undefined
        ? current.teacherEmployeeId
        : payload.teacherEmployeeId;
      if (String(nextTeacherId || '') !== String(original.teacherEmployeeId || '')) {
        await assertActiveTeacher(nextTeacherId);
      }
      const nextSchedules = payload.schedules === undefined ? current.schedules : payload.schedules;
      assertValidSchedules(nextSchedules);
      await assertNoTeacherScheduleConflict({
        teacherEmployeeId: nextTeacherId,
        schedules: nextSchedules,
        excludeGroupId: current._id,
      });
      const updated = await Group.findByIdAndUpdate(
        groupId,
        { $set: payload },
        { new: true, runValidators: true }
      );
      if (!updated) throw new AppError('group.notFound', 404);
      return updated;
    }
  );
  if (
    payload.schedules !== undefined ||
    payload.startDate !== undefined ||
    payload.sessionCount !== undefined ||
    payload.teacherEmployeeId !== undefined
  ) {
    await sessionService.syncGroupSessions(updated, { replaceFuture: true });
  }
  return updated;
}

async function deleteGroup(groupId) {
  return withTransaction(async (session) => {
    const group = await Group.findById(groupId).session(session);
    if (!group) throw new AppError('group.notFound', 404);

    const today = qatarToday();
    if (!group.startDate || group.startDate <= today) {
      throw new AppError('group.cannotDeleteStarted', 409);
    }

    const linkedSubscription = await Subscription.exists({
      $or: [
        { groupId },
        { 'groupTransferHistory.fromGroupId': groupId },
        { 'groupTransferHistory.toGroupId': groupId },
      ],
    }).session(session);
    if (linkedSubscription) throw new AppError('group.hasRecords', 409);

    const sessions = await Session.find({ groupId })
      .select('_id originalDate currentDate status')
      .session(session);
    const startedSession = sessions.some((row) =>
      row.status !== SESSION_STATUS.CANCELLED &&
      (row.status === SESSION_STATUS.COMPLETED ||
        row.originalDate <= today ||
        row.currentDate <= today)
    );
    if (startedSession) throw new AppError('group.cannotDeleteStarted', 409);

    const sessionIds = sessions.map((row) => row._id);
    const [attendance, makeup] = await Promise.all([
      Attendance.exists({ sessionId: { $in: sessionIds } }).session(session),
      MakeupSession.exists({ groupId }).session(session),
    ]);
    if (attendance || makeup) throw new AppError('group.hasRecords', 409);

    await Session.deleteMany({ groupId }, { session });
    await group.deleteOne({ session });
    return group;
  });
}

function normalizePlan(price, installments, initialPaymentAmount = 0) {
  const remainingAmount = price - initialPaymentAmount;
  if (!installments?.length) {
    return [
      {
        dueDate: require('../utils/time').qatarToday(),
        amount: price,
        paidAmount: 0,
        status: INSTALLMENT_STATUS.PENDING,
      },
    ];
  }
  const sum = installments.reduce((s, i) => s + i.amount, 0);
  if (sum !== remainingAmount) {
    throw new AppError('subscription.invalidPlan', 400, {
      sum,
      remainingAmount,
    });
  }
  const plan = installments.map((i) => ({
    dueDate: i.dueDate,
    amount: i.amount,
    paidAmount: 0,
    status: INSTALLMENT_STATUS.PENDING,
  }));
  if (initialPaymentAmount > 0) {
    plan[0].amount += initialPaymentAmount;
  }
  return plan;
}

async function subscribe({
  studentId,
  courseId,
  groupId,
  lessonsPurchased,
  renewalOfId,
  price,
  installments,
  notes,
  initialPayment,
  actorId,
}) {
  return withTransaction(async (session) => {
    const student = await Student.findById(studentId).session(session);
    const course = await Course.findById(courseId).session(session);
    const group = await Group.findById(groupId).session(session);
    if (!student) throw new AppError('student.notFound', 404);
    if (!course) throw new AppError('course.notFound', 404);
    if (!group) throw new AppError('group.notFound', 404);
    if (String(group.courseId) !== String(courseId)) {
      throw new AppError('subscription.invalidPlan', 400);
    }

    await Student.updateOne(
      { _id: studentId },
      { $inc: { subscriptionRevision: 1 } },
      { session, timestamps: false }
    );
    const activeSubscriptions = await Subscription.find({
      studentId,
      courseId,
      status: { $in: [SUBSCRIPTION_STATUS.ACTIVE, SUBSCRIPTION_STATUS.COMPLETED] },
    }).session(session);
    await Promise.all(activeSubscriptions.map((subscription) => ensureLessonBalance(subscription, session)));
    if (activeSubscriptions.some((subscription) => subscription.lessonsRemaining > 0)) {
      throw new AppError('subscription.activeExists', 409);
    }

    let renewalSource = null;
    if (renewalOfId) {
      renewalSource = await Subscription.findById(renewalOfId).session(session);
      if (
        !renewalSource ||
        String(renewalSource.studentId) !== String(studentId)
      ) {
        throw new AppError('subscription.notFound', 404);
      }
      if (renewalSource.renewedToSubscriptionId) {
        throw new AppError('subscription.alreadyRenewed', 409);
      }
      await ensureLessonBalance(renewalSource, session);
      if (renewalSource.lessonsRemaining > 0) {
        throw new AppError('subscription.notFinished', 400);
      }
    }

    const finalPrice = price ?? course.defaultPrice;
    const finalLessonsPurchased = lessonsPurchased ?? group.sessionCount;
    if (!Number.isInteger(finalLessonsPurchased) || finalLessonsPurchased < 1 || finalLessonsPurchased > 500) {
      throw new AppError('subscription.invalidPlan', 400);
    }
    const initialPaymentAmount = initialPayment?.amount || 0;
    if (initialPaymentAmount < 0 || initialPaymentAmount > finalPrice) {
      throw new AppError('payment.overpay', 400);
    }
    const plan = normalizePlan(finalPrice, installments, initialPaymentAmount);

    try {
      const [sub] = await Subscription.create(
        [
          {
            studentId,
            courseId,
            groupId,
            status: SUBSCRIPTION_STATUS.ACTIVE,
            currency: CURRENCY,
            price: finalPrice,
            paidAmount: 0,
            remainingAmount: finalPrice,
            lessonsPurchased: finalLessonsPurchased,
            lessonsRemaining: finalLessonsPurchased,
            installments: plan,
            startedAt: nowUtc(),
            notes: notes || null,
          },
        ],
        { session }
      );

      if (renewalSource) {
        renewalSource.renewedToSubscriptionId = sub._id;
        await renewalSource.save({ session });
      }

      if (initialPayment?.amount > 0) {
        const allocations = buildFifoAllocations(sub, initialPaymentAmount);
        sub.paidAmount = initialPaymentAmount;
        sub.remainingAmount = finalPrice - initialPaymentAmount;
        applyAllocations(sub, allocations);
        if (sub.remainingAmount === 0) {
          sub.status = SUBSCRIPTION_STATUS.COMPLETED;
          sub.endedAt = nowUtc();
        }
        await sub.save({ session });

        const receiptNumber = await nextReceiptNumber(session);
        const [payment] = await Payment.create(
          [
            {
              subscriptionId: sub._id,
              studentId,
              cashboxId: initialPayment.cashboxId,
              amount: initialPaymentAmount,
              currency: CURRENCY,
              allocations,
              receiptNumber,
              method: initialPayment.method || 'cash',
              status: PAYMENT_STATUS.COMPLETED,
              paidAt: nowUtc(),
              recordedBy: actorId,
              notes: initialPayment.notes || null,
            },
          ],
          { session }
        );
        await recordMovement({
          cashboxId: initialPayment.cashboxId,
          kind: 'income',
          direction: 'in',
          amount: initialPaymentAmount,
          description: `Initial enrollment payment ${receiptNumber}`,
          referenceId: payment._id,
          referenceType: 'payment',
          actorId,
          occurredAt: payment.paidAt,
          session,
        });
      }

      return sub;
    } catch (err) {
      if (err.code === 11000) throw new AppError('subscription.activeExists', 409);
      throw err;
    }
  });
}

async function deleteSubscription(subscriptionId) {
  return withTransaction(async (session) => {
    const sub = await Subscription.findById(subscriptionId).session(session);
    if (!sub) throw new AppError('subscription.notFound', 404);

    const group = await Group.findById(sub.groupId).session(session);
    if (!group) throw new AppError('group.notFound', 404);
    if (!group.startDate || group.startDate <= qatarToday()) {
      throw new AppError('subscription.cannotDelete', 409);
    }

    const paymentExists = await Payment.exists({ subscriptionId }).session(session);
    const lessonsUsed =
      sub.lessonsPurchased != null &&
      sub.lessonsRemaining != null &&
      sub.lessonsRemaining < sub.lessonsPurchased;
    if (paymentExists || sub.paidAmount > 0 || lessonsUsed) {
      throw new AppError('subscription.cannotDelete', 409);
    }

    await sub.deleteOne({ session });
    return sub;
  });
}

/**
 * Same-course group change = transfer on that subscription (no new financial agreement).
 */
async function transferGroup({ subscriptionId, newGroupId, actorId, actorRole, actorEmployeeId }) {
  return withTransaction(async (session) => {
    const sub = await Subscription.findById(subscriptionId).session(session);
    if (
      !sub ||
      ![SUBSCRIPTION_STATUS.ACTIVE, SUBSCRIPTION_STATUS.COMPLETED].includes(sub.status)
    ) {
      throw new AppError('subscription.notFound', 404);
    }
    const group = await Group.findOne({ _id: newGroupId, isActive: true }).session(session);
    if (!group) throw new AppError('group.notFound', 404);
    if (String(group._id) === String(sub.groupId)) {
      throw new AppError('subscription.invalidPlan', 400);
    }
    if (String(group.courseId) !== String(sub.courseId)) {
      throw new AppError('subscription.invalidPlan', 400);
    }
    await ensureLessonBalance(sub, session);
    if (sub.lessonsRemaining <= 0) {
      throw new AppError('subscription.noLessonsRemaining', 400);
    }
    if (actorRole === 'teacher') {
      const currentGroup = await Group.findById(sub.groupId)
        .select('teacherEmployeeId')
        .session(session);
      if (
        !currentGroup ||
        !group.teacherEmployeeId ||
        String(currentGroup.teacherEmployeeId) !== String(actorEmployeeId) ||
        String(group.teacherEmployeeId) !== String(actorEmployeeId)
      ) {
        throw new AppError('rbac.denied', 403);
      }
    }
    sub.groupTransferHistory.push({
      at: nowUtc(),
      actorId,
      fromGroupId: sub.groupId,
      toGroupId: group._id,
    });
    sub.groupId = newGroupId;
    await sub.save({ session });
    return sub;
  });
}

/**
 * After first completed payment, Manager may replace unpaid remainder with reason.
 */
async function modifyInstallmentPlan({ subscriptionId, unpaidRows, reason, actorId }) {
  if (!reason) throw new AppError('subscription.invalidPlan', 400);

  return withTransaction(async (session) => {
    const sub = await Subscription.findById(subscriptionId).session(session);
    if (!sub) throw new AppError('subscription.notFound', 404);
    if (sub.paidAmount <= 0) {
      // allow first-plan correction before any payment as well
    }

    const oldUnpaid = sub.installments
      .filter((i) => i.paidAmount < i.amount)
      .map((i) => i.toObject());

    assertPlanEditValid(sub, unpaidRows);

    const fullyPaid = sub.installments.filter((i) => i.paidAmount >= i.amount);
    const nextInstallments = [
      ...fullyPaid.map((i) => i.toObject()),
      ...unpaidRows.map((r) => {
        const existing = r._id ? sub.installments.id(r._id) : null;
        return {
          _id: existing ? existing._id : new mongoose.Types.ObjectId(),
          dueDate: r.dueDate,
          amount: r.amount,
          paidAmount: existing ? existing.paidAmount : r.paidAmount || 0,
          status: INSTALLMENT_STATUS.PENDING,
        };
      }),
    ];

    sub.planChangeHistory.push({
      at: nowUtc(),
      actorId,
      reason,
      oldUnpaidRows: oldUnpaid,
      newUnpaidRows: unpaidRows,
    });
    sub.installments = nextInstallments;
    refreshInstallmentStatuses(sub);
    await sub.save({ session });
    return sub;
  });
}

module.exports = {
  createStudent,
  createCourse,
  updateCourse,
  archiveCourse,
  createGroup,
  updateGroup,
  deleteGroup,
  subscribe,
  deleteSubscription,
  transferGroup,
  modifyInstallmentPlan,
  normalizePlan,
};
