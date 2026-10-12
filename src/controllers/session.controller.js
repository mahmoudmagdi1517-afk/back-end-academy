const { Session } = require('../models/Session');
const { Attendance } = require('../models/Attendance');
const { Group } = require('../models/Group');
const { Subscription } = require('../models/Subscription');
const { Student } = require('../models/Student');
const { MakeupSession } = require('../models/MakeupSession');
const sessionService = require('../services/session.service');
const { asyncHandler } = require('../middlewares/asyncHandler');
const { AppError } = require('../utils/AppError');
const { ROLES, SUBSCRIPTION_STATUS } = require('../constants');
const { DateTime } = require('luxon');
const { TIMEZONE } = require('../constants');
const { belongsToGroupAt, ensureLessonBalance } = require('../services/lessonBalance.service');

function assertTeacherOwnsSession(user, session) {
  if (user.role === ROLES.TEACHER && (
    !user.employeeId || String(session.teacherEmployeeId) !== String(user.employeeId)
  )) {
    throw new AppError('rbac.denied', 403);
  }
}

const createSession = asyncHandler(async (req, res) => {
  const session = await sessionService.createSession(req.body);
  res.status(201).json({ success: true, data: session });
});

const postponeSession = asyncHandler(async (req, res) => {
  const session = await sessionService.postponeSession({
    sessionId: req.params.id,
    toDate: req.body.toDate,
    reason: req.body.reason,
    actorId: req.user._id,
  });
  res.json({ success: true, data: session });
});

const cancelSession = asyncHandler(async (req, res) => {
  const session = await sessionService.cancelSession({
    sessionId: req.params.id,
    reason: req.body.reason,
    actorId: req.user._id,
  });
  res.json({ success: true, data: session });
});

const upsertAttendance = asyncHandler(async (req, res) => {
  const row = await sessionService.upsertAttendance({
    sessionId: req.params.id,
    studentId: req.body.studentId,
    status: req.body.status,
    note: req.body.note,
    actor: req.user,
    forceAfterComplete: [ROLES.MANAGER, ROLES.OWNER].includes(req.user.role),
  });
  res.json({ success: true, data: row });
});

const closeSession = asyncHandler(async (req, res) => {
  const session = await sessionService.closeSession({
    sessionId: req.params.id,
    actor: req.user,
  });
  res.json({ success: true, data: session });
});

const getSession = asyncHandler(async (req, res) => {
  const session = await Session.findById(req.params.id);
  if (!session) throw new AppError('session.notFound', 404);
  assertTeacherOwnsSession(req.user, session);
  const [attendance, subscriptions] = await Promise.all([
    Attendance.find({ sessionId: session._id }),
    Subscription.find({
      status: { $in: [SUBSCRIPTION_STATUS.ACTIVE, SUBSCRIPTION_STATUS.COMPLETED] },
      $or: [
        { groupId: session.groupId },
        { 'groupTransferHistory.fromGroupId': session.groupId },
        { 'groupTransferHistory.toGroupId': session.groupId },
      ],
    }).select('studentId groupId groupTransferHistory startedAt'),
  ]);
  const sessionAt = session.scheduledStartAt || new Date(`${session.currentDate}T12:00:00.000Z`);
  const enrolledAtSession = subscriptions.filter((sub) =>
    belongsToGroupAt(sub, session.groupId, sessionAt)
  );
  const students = await Student.find({ _id: { $in: enrolledAtSession.map((row) => row.studentId) } })
    .select('name nameAr studentCode')
    .sort({ name: 1 });
  res.json({ success: true, data: { session, attendance, students } });
});

const listSessions = asyncHandler(async (req, res) => {
  const q = {};
  if (req.user.role === ROLES.TEACHER) {
    if (!req.user.employeeId) {
      return res.json({ success: true, data: [] });
    }
    q.teacherEmployeeId = req.user.employeeId;
  }
  if (req.query.groupId) q.groupId = req.query.groupId;
  if (req.query.currentDate) q.currentDate = req.query.currentDate;
  else if (req.query.fromDate) q.currentDate = { $gte: req.query.fromDate };
  if (req.query.status) q.status = req.query.status;
  const rows = await Session.find(q).sort({ scheduledStartAt: req.query.fromDate ? 1 : -1 }).limit(500);
  res.json({ success: true, data: rows });
});

const getTeacherDashboard = asyncHandler(async (req, res) => {
  if (!req.user.employeeId) {
    return res.json({ success: true, data: { groups: [], sessions: [] } });
  }
  const currentDate = req.query.currentDate || DateTime.now().setZone(TIMEZONE).toISODate();
  const groups = await Group.find({
    teacherEmployeeId: req.user.employeeId,
    isActive: true,
  }).select('name nameAr courseId teacherEmployeeId schedules').sort({ name: 1 });
  const groupIds = groups.map((group) => group._id);
  const [subscriptions, sessions] = await Promise.all([
    Subscription.find({
      groupId: { $in: groupIds },
      status: { $in: [SUBSCRIPTION_STATUS.ACTIVE, SUBSCRIPTION_STATUS.COMPLETED] },
    }).select('groupId studentId'),
    Session.find({
      teacherEmployeeId: req.user.employeeId,
      currentDate,
    }).sort({ scheduledStartAt: 1 }),
  ]);
  await Promise.all(subscriptions.map((sub) => ensureLessonBalance(sub)));
  const activeRosterSubscriptions = subscriptions.filter((sub) => sub.lessonsRemaining > 0);
  const studentIds = [...new Set(activeRosterSubscriptions.map((row) => String(row.studentId)))];
  const sessionIds = sessions.map((session) => session._id);
  const [students, attendance] = await Promise.all([
    Student.find({ _id: { $in: studentIds } }).select('name nameAr studentCode').sort({ name: 1 }),
    Attendance.find({ sessionId: { $in: sessionIds } }).select('sessionId studentId status'),
  ]);
  const studentById = new Map(students.map((student) => [String(student._id), student]));
  const subscriptionsByGroup = new Map();
  for (const enrollment of activeRosterSubscriptions) {
    const key = String(enrollment.groupId);
    const roster = subscriptionsByGroup.get(key) || [];
    const student = studentById.get(String(enrollment.studentId));
    if (student) roster.push(student);
    subscriptionsByGroup.set(key, roster);
  }
  const attendanceBySession = new Map();
  for (const row of attendance) {
    const key = String(row.sessionId);
    const entries = attendanceBySession.get(key) || [];
    entries.push(row);
    attendanceBySession.set(key, entries);
  }

  res.json({
    success: true,
    data: {
      groups: groups.map((group) => ({
        ...group.toObject(),
        students: subscriptionsByGroup.get(String(group._id)) || [],
      })),
      sessions: sessions.map((session) => ({
        ...session.toObject(),
        attendance: attendanceBySession.get(String(session._id)) || [],
      })),
    },
  });
});

const createMakeup = asyncHandler(async (req, res) => {
  const doc = await sessionService.createMakeup({ ...req.body, actorId: req.user._id });
  res.status(201).json({ success: true, data: doc });
});

const markMakeupMissed = asyncHandler(async (req, res) => {
  const doc = await sessionService.markMakeupMissed({ makeupId: req.params.id });
  res.json({ success: true, data: doc });
});

const listMakeups = asyncHandler(async (req, res) => {
  const q = {};
  if (req.query.studentId) q.studentId = req.query.studentId;
  const rows = await MakeupSession.find(q).sort({ createdAt: -1 }).limit(200);
  res.json({ success: true, data: rows });
});

module.exports = {
  createSession,
  postponeSession,
  cancelSession,
  upsertAttendance,
  closeSession,
  getSession,
  listSessions,
  getTeacherDashboard,
  createMakeup,
  markMakeupMissed,
  listMakeups,
};
