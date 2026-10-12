const { Subscription } = require('../models/Subscription');
const { Session } = require('../models/Session');
const { Attendance } = require('../models/Attendance');
const { Notification } = require('../models/Notification');
const { Group } = require('../models/Group');
const { Employee } = require('../models/Employee');
const { NOTIFICATION_TYPE, SESSION_STATUS, SUBSCRIPTION_STATUS, INSTALLMENT_STATUS } = require('../constants');
const { qatarToday, addQatarDays, nowUtc, qatarNow } = require('../utils/time');
const { refreshInstallmentStatuses } = require('./installment.helpers');
const sessionService = require('./session.service');

async function upsertNotification({ type, entityType, entityId, businessDate, payload, dedupeKey: customDedupeKey }) {
  const dedupeKey = customDedupeKey || `${type}:${entityType}:${entityId}:${businessDate}`;
  try {
    await Notification.create({
      type,
      entityType,
      entityId,
      businessDate,
      dedupeKey,
      payload: payload || {},
    });
    return true;
  } catch (err) {
    if (err.code === 11000) return false;
    throw err;
  }
}

async function checkMissingSessionLogs() {
  const graceMinutes = 15;
  const cutoff = new Date(nowUtc().getTime() - graceMinutes * 60 * 1000);
  const sessions = await Session.find({
    status: { $ne: SESSION_STATUS.CANCELLED },
    scheduledEndAt: { $lte: cutoff },
    sessionLogCheckedAt: null,
  }).select('_id groupId teacherEmployeeId currentDate scheduledStartAt scheduledEndAt status');

  for (const session of sessions) {
    const [group, teacher, activeSubscriptions, attendanceStudentIds] = await Promise.all([
      Group.findById(session.groupId).select('name nameAr'),
      session.teacherEmployeeId
        ? Employee.findById(session.teacherEmployeeId).select('name nameAr')
        : null,
      Subscription.find({
        groupId: session.groupId,
        status: { $in: [SUBSCRIPTION_STATUS.ACTIVE, SUBSCRIPTION_STATUS.COMPLETED] },
      }).select('studentId'),
      Attendance.distinct('studentId', { sessionId: session._id }),
    ]);
    const recordedStudentIds = new Set(attendanceStudentIds.map(String));
    const missingStudentIds = activeSubscriptions
      .map((subscription) => String(subscription.studentId))
      .filter((studentId) => !recordedStudentIds.has(studentId));
    const hasMissingAttendance = missingStudentIds.length > 0;
    if (session.status === SESSION_STATUS.COMPLETED && !hasMissingAttendance) {
      await Session.updateOne(
        { _id: session._id, sessionLogCheckedAt: null },
        { $set: { sessionLogCheckedAt: nowUtc() } }
      );
      continue;
    }

    const start = session.scheduledStartAt.toISOString();
    const dedupeKey = `${NOTIFICATION_TYPE.SESSION_LOG_MISSING}:Session:${session._id}:${session.currentDate}`;
    await upsertNotification({
      type: NOTIFICATION_TYPE.SESSION_LOG_MISSING,
      entityType: 'Session',
      entityId: session._id,
      businessDate: session.currentDate,
      dedupeKey,
      payload: {
        groupId: session.groupId,
        groupName: group?.name || null,
        groupNameAr: group?.nameAr || null,
        teacherEmployeeId: session.teacherEmployeeId,
        teacherName: teacher?.name || null,
        teacherNameAr: teacher?.nameAr || null,
        currentDate: session.currentDate,
        startTime: start,
        endTime: session.scheduledEndAt.toISOString(),
        sessionStatus: session.status,
        expectedAttendance: activeSubscriptions.length,
        recordedAttendance: attendanceStudentIds.length,
        missingStudentCount: missingStudentIds.length,
      },
    });
    await Session.updateOne(
      { _id: session._id, sessionLogCheckedAt: null },
      { $set: { missingAttendanceAlertedAt: nowUtc(), sessionLogCheckedAt: nowUtc() } }
    );
  }
  return { checked: sessions.length };
}

async function generateTodaySessions() {
  const today = qatarToday();
  const weekday = qatarNow().weekday;
  return sessionService.generateScheduledSessionsForDate(today, weekday);
}

async function runDailyJob() {
  const today = qatarToday();
  const dueSoonDate = addQatarDays(today, 2);

  const activeSubs = await Subscription.find({
    status: { $in: [SUBSCRIPTION_STATUS.ACTIVE, SUBSCRIPTION_STATUS.COMPLETED] },
    remainingAmount: { $gt: 0 },
  });

  for (const sub of activeSubs) {
    refreshInstallmentStatuses(sub, today);
    await sub.save();

    for (const inst of sub.installments) {
      if (inst.paidAmount >= inst.amount) continue;
      if (inst.dueDate === dueSoonDate) {
        await upsertNotification({
          type: NOTIFICATION_TYPE.PAYMENT_DUE_SOON,
          entityType: 'Installment',
          entityId: inst._id,
          businessDate: today,
          payload: { subscriptionId: sub._id, dueDate: inst.dueDate },
        });
      }
      if (inst.dueDate === today) {
        await upsertNotification({
          type: NOTIFICATION_TYPE.PAYMENT_DUE,
          entityType: 'Installment',
          entityId: inst._id,
          businessDate: today,
          payload: { subscriptionId: sub._id, dueDate: inst.dueDate },
        });
      }
      if (inst.dueDate < today) {
        await upsertNotification({
          type: NOTIFICATION_TYPE.PAYMENT_OVERDUE,
          entityType: 'Installment',
          entityId: inst._id,
          businessDate: today,
          payload: { subscriptionId: sub._id, dueDate: inst.dueDate },
        });
      }
    }
  }

  const scheduledSessions = await generateTodaySessions();
  await checkMissingSessionLogs();

  // ATTENDANCE_REVIEW: on review-needed, not every tick — still idempotent per business date
  const reviews = await Attendance.find({ reviewNeeded: true }).limit(500);
  for (const row of reviews) {
    await upsertNotification({
      type: NOTIFICATION_TYPE.ATTENDANCE_REVIEW,
      entityType: 'Attendance',
      entityId: row._id,
      businessDate: today,
      payload: { sessionId: row.sessionId, studentId: row.studentId },
    });
  }

  return { today, processed: true, scheduledSessions };
}

module.exports = {
  runDailyJob,
  generateTodaySessions,
  checkMissingSessionLogs,
  upsertNotification,
};
