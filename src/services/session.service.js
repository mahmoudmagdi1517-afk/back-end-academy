const { Session } = require('../models/Session');
const { Attendance } = require('../models/Attendance');
const { MakeupSession } = require('../models/MakeupSession');
const { withTransaction } = require('../utils/transaction');
const {
  LESSON_CONSUMING_STATUSES,
  belongsToGroupForSession,
  ensureLessonBalance,
} = require('./lessonBalance.service');
const { Group } = require('../models/Group');
const { Employee } = require('../models/Employee');
const { Subscription } = require('../models/Subscription');
const { AppError } = require('../utils/AppError');
const {
  SESSION_STATUS,
  SUBSCRIPTION_STATUS,
  MAKEUP_PRICING,
  ROLES,
  CURRENCY,
} = require('../constants');
const { nowUtc, qatarDateTimeUtc } = require('../utils/time');
const { withTeacherScheduleLocks } = require('../utils/teacherScheduleLock');
const { DateTime } = require('luxon');
const { TIMEZONE } = require('../constants');
const { qatarToday } = require('../utils/time');

function assertNotSuperseded(session, date) {
  const superseded = (session.scheduleHistory || []).some((h) => h.fromDate === date);
  if (superseded && session.currentDate !== date) {
    throw new AppError('session.cannotOpenSuperseded', 400);
  }
}

function assertOpenForAttendance(session) {
  if (![SESSION_STATUS.SCHEDULED, SESSION_STATUS.POSTPONED].includes(session.status)) {
    throw new AppError('session.notOpenForAttendance', 400);
  }
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

async function assertNoSessionConflict({
  groupId,
  teacherEmployeeId,
  startAt,
  endAt,
  excludeSessionId,
}) {
  const conflicts = [{ groupId }];
  if (teacherEmployeeId) conflicts.push({ teacherEmployeeId });
  const query = {
    status: { $ne: SESSION_STATUS.CANCELLED },
    scheduledStartAt: { $lt: endAt },
    scheduledEndAt: { $gt: startAt },
    $or: conflicts,
  };
  if (excludeSessionId) query._id = { $ne: excludeSessionId };
  const conflict = await Session.findOne(query).select('_id currentDate scheduledStartAt scheduledEndAt');
  if (conflict) {
    throw new AppError('session.teacherScheduleConflict', 409, {
      sessionId: conflict._id,
      currentDate: conflict.currentDate,
    });
  }
}

async function createSession({
  groupId,
  originalDate,
  startTime,
  endTime,
  teacherEmployeeId,
  notes,
  scheduleSlotId,
}) {
  const group = await Group.findById(groupId);
  if (!group) throw new AppError('group.notFound', 404);
  const effectiveTeacherId = teacherEmployeeId || group.teacherEmployeeId || null;
  let scheduledStartAt;
  let scheduledEndAt;
  try {
    scheduledStartAt = qatarDateTimeUtc(originalDate, startTime);
    scheduledEndAt = qatarDateTimeUtc(originalDate, endTime);
  } catch (err) {
    throw new AppError('session.invalidSchedule', 400);
  }
  if (scheduledEndAt <= scheduledStartAt) throw new AppError('session.invalidSchedule', 400);

  return withTeacherScheduleLocks([effectiveTeacherId], async () => {
    await assertActiveTeacher(effectiveTeacherId);
    if (scheduleSlotId) {
      const existing = await Session.findOne({ groupId, scheduleSlotId, originalDate });
      if (existing) return existing;
    }
    await assertNoSessionConflict({
      groupId,
      teacherEmployeeId: effectiveTeacherId,
      startAt: scheduledStartAt,
      endAt: scheduledEndAt,
    });
    return Session.create({
      groupId,
      scheduleSlotId: scheduleSlotId || null,
      courseId: group.courseId,
      teacherEmployeeId: effectiveTeacherId,
      originalDate,
      currentDate: originalDate,
      scheduledStartAt,
      scheduledEndAt,
      status: SESSION_STATUS.SCHEDULED,
      notes: notes || null,
    });
  });
}

async function generateScheduledSessionsForDate(date, dayOfWeek) {
  const groups = await Group.find({
    isActive: true,
    schedules: { $elemMatch: { dayOfWeek } },
  }).select('courseId teacherEmployeeId schedules startDate sessionCount');
  let created = 0;
  const failures = [];

  for (const group of groups) {
    if (group.startDate && group.sessionCount) continue;
    for (const slot of group.schedules.filter((row) => row.dayOfWeek === dayOfWeek)) {
      try {
        const existingSlot = await Session.exists({
          groupId: group._id,
          scheduleSlotId: slot._id,
          originalDate: date,
        });
        if (existingSlot) continue;
        const startAt = qatarDateTimeUtc(date, slot.startTime);
        const endAt = qatarDateTimeUtc(date, slot.endTime);
        const alreadyScheduled = await Session.exists({
          groupId: group._id,
          scheduledStartAt: startAt,
          scheduledEndAt: endAt,
          status: { $ne: SESSION_STATUS.CANCELLED },
        });
        if (alreadyScheduled) continue;
        const session = await createSession({
          groupId: group._id,
          originalDate: date,
          startTime: slot.startTime,
          endTime: slot.endTime,
          teacherEmployeeId: group.teacherEmployeeId,
          scheduleSlotId: slot._id,
        });
        if (session.scheduleSlotId) created += 1;
      } catch (err) {
        if (err.code === 11000) continue;
        failures.push({ groupId: group._id, scheduleSlotId: slot._id, message: err.message });
      }

    }
  }
  return { created, checked: groups.length, failures };
}

async function syncGroupSessions(group, { replaceFuture = false } = {}) {
  if (!group.startDate || !group.sessionCount || !group.schedules?.length) return { created: 0 };
  const today = qatarToday();

  if (replaceFuture) {
    const existing = await Session.find({ groupId: group._id });
    const attendanceSessionIds = new Set(
      (await Attendance.distinct('sessionId', { sessionId: { $in: existing.map((row) => row._id) } }))
        .map(String)
    );
    const removableIds = existing
      .filter((row) =>
        row.scheduleSlotId &&
        row.status === SESSION_STATUS.SCHEDULED &&
        row.currentDate >= today &&
        !attendanceSessionIds.has(String(row._id))
      )
      .map((row) => row._id);
    if (removableIds.length) await Session.deleteMany({ _id: { $in: removableIds } });
  }

  const groupSessionIds = await Session.distinct('_id', { groupId: group._id });
  const attendanceSessionIds = await Attendance.distinct('sessionId', {
    sessionId: { $in: groupSessionIds },
  });
  const preservedScheduledCount = await Session.countDocuments({
    groupId: group._id,
    scheduleSlotId: { $type: 'objectId' },
    $or: [
      { currentDate: { $lt: today } },
      { status: { $ne: SESSION_STATUS.SCHEDULED } },
      { _id: { $in: attendanceSessionIds } },
    ],
  });
  const targetToCreate = Math.max(0, group.sessionCount - preservedScheduledCount);
  const slots = [...group.schedules].sort((first, second) => first.startTime.localeCompare(second.startTime));
  let created = 0;
  let date = DateTime.fromISO(group.startDate, { zone: TIMEZONE }).startOf('day');
  if (!date.isValid || date.toISODate() !== group.startDate) {
    throw new AppError('group.invalidStartDate', 400);
  }

  let daysChecked = 0;
  while (created < targetToCreate && daysChecked <= 3660) {
    const dateString = date.toISODate();
    for (const slot of slots.filter((item) => item.dayOfWeek === date.weekday)) {
      const existingSession = await Session.exists({
        groupId: group._id,
        scheduleSlotId: slot._id,
        originalDate: dateString,
      });
      if (existingSession) continue;
      await createSession({
        groupId: group._id,
        originalDate: dateString,
        startTime: slot.startTime,
        endTime: slot.endTime,
        teacherEmployeeId: group.teacherEmployeeId,
        scheduleSlotId: slot._id,
      });
      created += 1;
      if (created >= targetToCreate) break;
    }
    date = date.plus({ days: 1 });
    daysChecked += 1;
  }
  if (created < targetToCreate) throw new AppError('group.scheduleGenerationFailed', 400);
  return { created };
}

async function postponeSession({ sessionId, toDate, reason, actorId }) {
  const initial = await Session.findById(sessionId);
  if (!initial) throw new AppError('session.notFound', 404);
  return withTeacherScheduleLocks([initial.teacherEmployeeId], async () => {
    const session = await Session.findById(sessionId);
    if (!session) throw new AppError('session.notFound', 404);
    if ([SESSION_STATUS.CANCELLED, SESSION_STATUS.COMPLETED].includes(session.status)) {
      throw new AppError('session.notOpenForAttendance', 400);
    }

    const fromDate = session.currentDate;
    let scheduledStartAt = session.scheduledStartAt;
    let scheduledEndAt = session.scheduledEndAt;
    if (session.scheduledStartAt && session.scheduledEndAt) {
      const duration = session.scheduledEndAt.getTime() - session.scheduledStartAt.getTime();
      const localStartTime = DateTime.fromJSDate(session.scheduledStartAt, { zone: 'utc' })
        .setZone(TIMEZONE)
        .toFormat('HH:mm');
      try {
        scheduledStartAt = qatarDateTimeUtc(toDate, localStartTime);
      } catch (err) {
        throw new AppError('session.invalidSchedule', 400);
      }
      scheduledEndAt = new Date(scheduledStartAt.getTime() + duration);
      await assertNoSessionConflict({
        groupId: session.groupId,
        teacherEmployeeId: session.teacherEmployeeId,
        startAt: scheduledStartAt,
        endAt: scheduledEndAt,
        excludeSessionId: session._id,
      });
    }

    session.scheduleHistory.push({
      at: nowUtc(),
      actorId,
      action: 'postpone',
      fromDate,
      toDate,
      reason: reason || null,
    });
    session.currentDate = toDate;
    session.scheduledStartAt = scheduledStartAt;
    session.scheduledEndAt = scheduledEndAt;
    session.missingAttendanceAlertedAt = null;
    session.sessionLogCheckedAt = null;
    session.status = SESSION_STATUS.POSTPONED;
    await session.save();
    return session;
  });
}

async function cancelSession({ sessionId, reason, actorId }) {
  const session = await Session.findById(sessionId);
  if (!session) throw new AppError('session.notFound', 404);
  if (session.status === SESSION_STATUS.COMPLETED) {
    throw new AppError('session.alreadyCompleted', 400);
  }
  session.scheduleHistory.push({
    at: nowUtc(),
    actorId,
    action: 'cancel',
    fromDate: session.currentDate,
    toDate: null,
    reason: reason || null,
  });
  session.status = SESSION_STATUS.CANCELLED;
  await session.save();
  return session;
}

async function assertTeacherOwnsSession(user, session) {
  if (user.role !== ROLES.TEACHER) return;
  if (!user.employeeId || String(user.employeeId) !== String(session.teacherEmployeeId)) {
    throw new AppError('rbac.denied', 403);
  }
}

async function upsertAttendance({ sessionId, studentId, status, note, actor }) {
  return withTransaction(async (dbSession) => {
    const session = await Session.findById(sessionId).session(dbSession);
    if (!session) throw new AppError('session.notFound', 404);
    await assertTeacherOwnsSession(actor, session);

    const enrollmentCandidates = await Subscription.find({
      studentId,
      status: { $in: [SUBSCRIPTION_STATUS.ACTIVE, SUBSCRIPTION_STATUS.COMPLETED] },
      $or: [
        { groupId: session.groupId },
        { 'groupTransferHistory.fromGroupId': session.groupId },
        { 'groupTransferHistory.toGroupId': session.groupId },
      ],
    }).session(dbSession);
    const enrollment = enrollmentCandidates.find((sub) =>
      belongsToGroupForSession(sub, session.groupId, session)
    );
    if (!enrollment) throw new AppError('attendance.studentNotEnrolled', 404);
    await ensureLessonBalance(enrollment, dbSession);

    const row = await Attendance.findOne({ sessionId, studentId }).session(dbSession);
    const completed = session.status === SESSION_STATUS.COMPLETED;
    if (actor.role === ROLES.TEACHER) {
      if (row) throw new AppError('attendance.managerEditOnly', 403);
      if (completed) throw new AppError('rbac.denied', 403);
      assertOpenForAttendance(session);

      const attendanceDeadline = session.scheduledEndAt
        ? new Date(session.scheduledEndAt.getTime() + 24 * 60 * 60 * 1000)
        : DateTime.fromISO(session.currentDate, { zone: TIMEZONE })
            .endOf('day')
            .plus({ hours: 24 })
            .toUTC()
            .toJSDate();
      if (nowUtc() > attendanceDeadline) {
        throw new AppError('attendance.windowExpired', 400);
      }
    } else if (completed) {
      if (![ROLES.MANAGER, ROLES.OWNER].includes(actor.role)) {
        throw new AppError('rbac.denied', 403);
      }
    } else {
      assertOpenForAttendance(session);
    }

    const wasConsuming = row && LESSON_CONSUMING_STATUSES.has(row.status);
    const willConsume = LESSON_CONSUMING_STATUSES.has(status);
    const lessonDelta = Number(willConsume) - Number(wasConsuming);
    if (lessonDelta > 0 && enrollment.lessonsRemaining <= 0) {
      throw new AppError('subscription.noLessonsRemaining', 400);
    }
    if (lessonDelta !== 0) {
      enrollment.lessonsRemaining = Math.min(
        enrollment.lessonsPurchased,
        enrollment.lessonsRemaining - lessonDelta
      );
      await enrollment.save({ session: dbSession });
    }

    let attendance = row;
    if (!attendance) {
      attendance = new Attendance({
        sessionId,
        studentId,
        status,
        markedBy: actor._id,
        audit: [
          {
            at: nowUtc(),
            actorId: actor._id,
            fromStatus: null,
            toStatus: status,
            note: note || null,
          },
        ],
      });
    } else {
      const from = attendance.status;
      attendance.status = status;
      attendance.markedBy = actor._id;
      attendance.audit.push({
        at: nowUtc(),
        actorId: actor._id,
        fromStatus: from,
        toStatus: status,
        note: note || null,
      });
    }
    await attendance.save({ session: dbSession });
    return attendance;
  });
}

async function closeSession({ sessionId, actor }) {
  const session = await Session.findById(sessionId);
  if (!session) throw new AppError('session.notFound', 404);
  await assertTeacherOwnsSession(actor, session);
  if (![ROLES.MANAGER, ROLES.OWNER].includes(actor.role)) {
    throw new AppError('rbac.denied', 403);
  }
  if (session.status === SESSION_STATUS.COMPLETED) {
    throw new AppError('session.alreadyCompleted', 400);
  }
  if (session.status === SESSION_STATUS.CANCELLED) {
    throw new AppError('session.notOpenForAttendance', 400);
  }
  // unmarked students stay unmarked — no auto-absent
  session.status = SESSION_STATUS.COMPLETED;
  session.closedAt = nowUtc();
  session.closedBy = actor._id;
  await session.save();
  return session;
}

async function createMakeup({ studentId, groupId, sourceSessionId, scheduledDate, notes, actorId }) {
  return MakeupSession.create({
    studentId,
    groupId,
    sourceSessionId: sourceSessionId || null,
    scheduledDate,
    pricingType: MAKEUP_PRICING.FREE,
    feeAmount: 0,
    currency: CURRENCY,
    status: 'scheduled',
    createdBy: actorId,
    notes: notes || null,
  });
}

async function markMakeupMissed({ makeupId }) {
  const doc = await MakeupSession.findById(makeupId);
  if (!doc) throw new AppError('makeup.notFound', 404);
  doc.status = 'missed';
  await doc.save();
  return doc;
}

async function listActiveStudentsInGroup(groupId) {
  return Subscription.find({
    groupId,
    status: { $in: [SUBSCRIPTION_STATUS.ACTIVE, SUBSCRIPTION_STATUS.COMPLETED] },
  }).select('studentId');
}

module.exports = {
  createSession,
  generateScheduledSessionsForDate,
  syncGroupSessions,
  postponeSession,
  cancelSession,
  upsertAttendance,
  closeSession,
  createMakeup,
  markMakeupMissed,
  listActiveStudentsInGroup,
  assertNotSuperseded,
};
