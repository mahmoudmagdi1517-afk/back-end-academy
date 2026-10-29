const { Session } = require('../models/Session');
const { Attendance } = require('../models/Attendance');
const { Group } = require('../models/Group');
const { Course } = require('../models/Course');
const { Subscription } = require('../models/Subscription');
const { Student } = require('../models/Student');
const { MakeupSession } = require('../models/MakeupSession');
const sessionService = require('../services/session.service');
const { asyncHandler } = require('../middlewares/asyncHandler');
const { AppError } = require('../utils/AppError');
const { ROLES, SUBSCRIPTION_STATUS } = require('../constants');
const { DateTime } = require('luxon');
const { TIMEZONE } = require('../constants');
const { belongsToGroupForSession } = require('../services/lessonBalance.service');

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
  });
  res.json({ success: true, data: row });
});

const upsertAttendanceBatch = asyncHandler(async (req, res) => {
  const rows = await sessionService.upsertAttendanceBatch({
    sessionId: req.params.id,
    attendance: req.body.attendance,
    actor: req.user,
  });
  res.json({ success: true, data: rows });
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
  const enrolledAtSession = subscriptions.filter((sub) =>
    belongsToGroupForSession(sub, session.groupId, session)
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
    $or: [
      { teacherEmployeeId: req.user.employeeId },
      { 'schedules.teacherEmployeeId': req.user.employeeId },
    ],
    isActive: true,
  }).select('name nameAr courseId teacherEmployeeId schedules').sort({ name: 1 });
  const groupIds = groups.map((group) => group._id);
  const [subscriptions, sessions] = await Promise.all([
    Subscription.find({
      groupId: { $in: groupIds },
      status: { $in: [SUBSCRIPTION_STATUS.ACTIVE, SUBSCRIPTION_STATUS.COMPLETED] },
    }).select('groupId studentId createdAt').sort({ createdAt: -1 }),
    Session.find({
      teacherEmployeeId: req.user.employeeId,
      currentDate,
    }).sort({ scheduledStartAt: 1 }),
  ]);
  const studentIds = [...new Set(subscriptions.map((row) => String(row.studentId)))];
  const sessionIds = sessions.map((session) => session._id);
  const [students, attendance] = await Promise.all([
    Student.find({ _id: { $in: studentIds } }).select('name nameAr studentCode').sort({ name: 1 }),
    Attendance.find({ sessionId: { $in: sessionIds } }).select('sessionId studentId status'),
  ]);
  const studentById = new Map(students.map((student) => [String(student._id), student]));
  const subscriptionsByGroup = new Map();
  const seenStudentsByGroup = new Set();
  for (const enrollment of subscriptions) {
    const key = String(enrollment.groupId);
    const studentKey = `${key}:${String(enrollment.studentId)}`;
    if (seenStudentsByGroup.has(studentKey)) continue;
    seenStudentsByGroup.add(studentKey);
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

const getTeacherReport = asyncHandler(async (req, res) => {
  if (!req.user.employeeId) {
    return res.json({ success: true, data: { groups: [], sessions: [] } });
  }

  const groups = await Group.find({
    $or: [
      { teacherEmployeeId: req.user.employeeId },
      { 'schedules.teacherEmployeeId': req.user.employeeId },
    ],
    isActive: true,
    ...(req.query.groupId ? { _id: req.query.groupId } : {}),
  }).select('name nameAr courseId schedules').sort({ name: 1 });
  const groupIds = groups.map((group) => group._id);
  if (groupIds.length === 0) {
    return res.json({ success: true, data: { groups: [], sessions: [] } });
  }

  const sessionQuery = { teacherEmployeeId: req.user.employeeId, groupId: { $in: groupIds } };
  if (req.query.fromDate || req.query.toDate) {
    sessionQuery.currentDate = {};
    if (req.query.fromDate) sessionQuery.currentDate.$gte = req.query.fromDate;
    if (req.query.toDate) sessionQuery.currentDate.$lte = req.query.toDate;
  }

  const [sessions, subscriptions, courses] = await Promise.all([
    Session.find(sessionQuery).sort({ scheduledStartAt: 1 }).limit(1000),
    Subscription.find({
      status: { $in: [SUBSCRIPTION_STATUS.ACTIVE, SUBSCRIPTION_STATUS.COMPLETED] },
      $or: [
        { groupId: { $in: groupIds } },
        { 'groupTransferHistory.fromGroupId': { $in: groupIds } },
        { 'groupTransferHistory.toGroupId': { $in: groupIds } },
      ],
      ...(req.query.studentId ? { studentId: req.query.studentId } : {}),
    }).select('groupId studentId groupTransferHistory startedAt'),
    Course.find({ _id: { $in: groups.map((group) => group.courseId) } }).select('name nameAr'),
  ]);
  const studentIds = [...new Set(subscriptions.map((sub) => String(sub.studentId)))];
  const [students, attendance] = await Promise.all([
    Student.find({ _id: { $in: studentIds } }).select('name nameAr studentCode'),
    Attendance.find({ sessionId: { $in: sessions.map((session) => session._id) } }),
  ]);
  const studentById = new Map(students.map((student) => [String(student._id), student]));
  const coursesById = new Map(courses.map((course) => [String(course._id), course]));
  const groupById = new Map(groups.map((group) => [String(group._id), group]));
  const attendanceBySession = new Map();
  for (const record of attendance) {
    const key = String(record.sessionId);
    const records = attendanceBySession.get(key) || [];
    records.push(record);
    attendanceBySession.set(key, records);
  }

  res.json({
    success: true,
    data: {
      groups: groups.map((group) => ({
        ...group.toObject(),
        course: coursesById.get(String(group.courseId)) || null,
      })),
      sessions: sessions.map((session) => {
        const group = groupById.get(String(session.groupId));
        const enrolledStudents = subscriptions
          .filter((sub) => belongsToGroupForSession(sub, session.groupId, session))
          .map((sub) => studentById.get(String(sub.studentId)))
          .filter((student) => student && (
            !req.query.studentId || String(student._id) === String(req.query.studentId)
          ));
        return {
          ...session.toObject(),
          groupName: group?.name || '',
          groupNameAr: group?.nameAr || null,
          course: group ? coursesById.get(String(group.courseId)) || null : null,
          students: enrolledStudents,
          attendance: (attendanceBySession.get(String(session._id)) || []).filter((record) =>
            !req.query.studentId || String(record.studentId) === String(req.query.studentId)
          ),
        };
      }),
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
  upsertAttendanceBatch,
  closeSession,
  getSession,
  listSessions,
  getTeacherDashboard,
  getTeacherReport,
  createMakeup,
  markMakeupMissed,
  listMakeups,
};
