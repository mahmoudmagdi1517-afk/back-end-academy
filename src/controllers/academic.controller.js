const { Student } = require('../models/Student');
const { Course } = require('../models/Course');
const { Group } = require('../models/Group');
const { Subscription } = require('../models/Subscription');
const academic = require('../services/academic.service');
const { asyncHandler } = require('../middlewares/asyncHandler');
const { AppError } = require('../utils/AppError');
const { ROLES, SUBSCRIPTION_STATUS } = require('../constants');
const { ensureLessonBalance } = require('../services/lessonBalance.service');

const createStudent = asyncHandler(async (req, res) => {
  const student = await academic.createStudent(req.body);
  res.status(201).json({ success: true, data: student });
});

const listStudents = asyncHandler(async (req, res) => {
  const q = {};
  if (req.query.active === 'true') q.isActive = true;
  if (req.query.q) {
    q.$or = [
      { name: new RegExp(req.query.q, 'i') },
      { studentCode: new RegExp(req.query.q, 'i') },
      { phone: new RegExp(req.query.q, 'i') },
    ];
  }
  const students = await Student.find(q).sort({ createdAt: -1 }).limit(200);
  res.json({ success: true, data: students });
});

const getStudent = asyncHandler(async (req, res) => {
  const student = await Student.findById(req.params.id);
  if (!student) throw new AppError('student.notFound', 404);
  res.json({ success: true, data: student });
});

const createCourse = asyncHandler(async (req, res) => {
  const course = await academic.createCourse(req.body);
  res.status(201).json({ success: true, data: course });
});

const updateCourse = asyncHandler(async (req, res) => {
  const course = await academic.updateCourse(req.params.id, req.body);
  res.json({ success: true, data: course });
});

const archiveCourse = asyncHandler(async (req, res) => {
  const course = await academic.archiveCourse(req.params.id);
  res.json({ success: true, data: course });
});

const listCourses = asyncHandler(async (_req, res) => {
  const courses = await Course.find().sort({ code: 1 });
  res.json({ success: true, data: courses });
});

const createGroup = asyncHandler(async (req, res) => {
  const group = await academic.createGroup(req.body);
  res.status(201).json({ success: true, data: group });
});

const updateGroup = asyncHandler(async (req, res) => {
  const group = await academic.updateGroup(req.params.id, req.body);
  res.json({ success: true, data: group });
});

const deleteGroup = asyncHandler(async (req, res) => {
  const group = await academic.deleteGroup(req.params.id);
  res.json({ success: true, data: group });
});

const listGroups = asyncHandler(async (req, res) => {
  const q = {};
  if (req.query.courseId) q.courseId = req.query.courseId;
  const groups = await Group.find(q).sort({ name: 1 });
  res.json({ success: true, data: groups });
});

const getGroupRoster = asyncHandler(async (req, res) => {
  const group = await Group.findById(req.params.id);
  if (!group) throw new AppError('group.notFound', 404);

  const subscriptions = await Subscription.find({
    groupId: group._id,
    status: { $in: [SUBSCRIPTION_STATUS.ACTIVE, SUBSCRIPTION_STATUS.COMPLETED] },
  }).sort({ createdAt: -1 });
  await Promise.all(subscriptions.map((sub) => ensureLessonBalance(sub)));

  const students = await Student.find({
    _id: { $in: subscriptions.map((sub) => sub.studentId) },
  }).select('name nameAr studentCode phone email');
  const studentById = new Map(students.map((student) => [String(student._id), student]));
  const seenStudentIds = new Set();
  const roster = [];

  for (const subscription of subscriptions) {
    const studentId = String(subscription.studentId);
    const student = studentById.get(studentId);
    if (!student || seenStudentIds.has(studentId)) continue;
    seenStudentIds.add(studentId);
    roster.push({
      subscriptionId: subscription._id,
      status: subscription.status,
      lessonsPurchased: subscription.lessonsPurchased,
      lessonsRemaining: subscription.lessonsRemaining,
      student,
    });
  }

  res.json({ success: true, data: { group, students: roster } });
});

const subscribe = asyncHandler(async (req, res) => {
  const sub = await academic.subscribe({ ...req.body, actorId: req.user._id });
  res.status(201).json({ success: true, data: sub });
});

const transferGroup = asyncHandler(async (req, res) => {
  const sub = await academic.transferGroup({
    subscriptionId: req.params.id,
    newGroupId: req.body.newGroupId,
    actorId: req.user._id,
    actorRole: req.user.role,
    actorEmployeeId: req.user.employeeId,
  });
  res.json({ success: true, data: sub });
});

const listTeacherRoster = asyncHandler(async (req, res) => {
  if (!req.user.employeeId) {
    return res.json({ success: true, data: { groups: [] } });
  }
  const groups = await Group.find({
    teacherEmployeeId: req.user.employeeId,
    isActive: true,
  }).select('name nameAr courseId teacherEmployeeId sessionCount schedules').sort({ name: 1 });
  const groupIds = groups.map((group) => group._id);
  const [subscriptions, courses] = await Promise.all([
    Subscription.find({
      groupId: { $in: groupIds },
      status: { $in: [SUBSCRIPTION_STATUS.ACTIVE, SUBSCRIPTION_STATUS.COMPLETED] },
    }).sort({ createdAt: -1 }),
    Course.find({ _id: { $in: groups.map((group) => group.courseId) } }).select('name nameAr'),
  ]);
  await Promise.all(subscriptions.map((sub) => ensureLessonBalance(sub)));
  const courseById = new Map(courses.map((course) => [String(course._id), course]));
  const currentSubscriptions = subscriptions.filter((sub) => sub.status === SUBSCRIPTION_STATUS.ACTIVE);
  const students = await Student.find({
    _id: { $in: currentSubscriptions.map((sub) => sub.studentId) },
  }).select('name nameAr studentCode');
  const studentById = new Map(students.map((student) => [String(student._id), student]));
  const subscriptionsByGroup = new Map();
  for (const sub of currentSubscriptions) {
    const student = studentById.get(String(sub.studentId));
    if (!student) continue;
    const groupKey = String(sub.groupId);
    const rows = subscriptionsByGroup.get(groupKey) || [];
    rows.push({
      subscriptionId: sub._id,
      student,
      courseId: sub.courseId,
      lessonsPurchased: sub.lessonsPurchased,
      lessonsRemaining: sub.lessonsRemaining,
    });
    subscriptionsByGroup.set(groupKey, rows);
  }
  res.json({
    success: true,
    data: {
      groups: groups.map((group) => ({
        ...group.toObject(),
        course: courseById.get(String(group.courseId)) || null,
        students: subscriptionsByGroup.get(String(group._id)) || [],
      })),
    },
  });
});

const modifyPlan = asyncHandler(async (req, res) => {
  const sub = await academic.modifyInstallmentPlan({
    subscriptionId: req.params.id,
    unpaidRows: req.body.unpaidRows,
    reason: req.body.reason,
    actorId: req.user._id,
  });
  res.json({ success: true, data: sub });
});

const getSubscription = asyncHandler(async (req, res) => {
  const sub = await Subscription.findById(req.params.id);
  if (!sub) throw new AppError('subscription.notFound', 404);
  res.json({ success: true, data: sub });
});

const deleteSubscription = asyncHandler(async (req, res) => {
  const sub = await academic.deleteSubscription(req.params.id);
  res.json({ success: true, data: sub });
});

const listSubscriptions = asyncHandler(async (req, res) => {
  const q = {};
  if (req.query.studentId) q.studentId = req.query.studentId;
  if (req.query.groupId) q.groupId = req.query.groupId;
  if (req.query.status) q.status = req.query.status;
  const rows = await Subscription.find(q).sort({ createdAt: -1 }).limit(200);
  await Promise.all(rows.map((sub) => ensureLessonBalance(sub)));
  res.json({ success: true, data: rows });
});

module.exports = {
  createStudent,
  listStudents,
  getStudent,
  createCourse,
  updateCourse,
  archiveCourse,
  listCourses,
  createGroup,
  updateGroup,
  deleteGroup,
  listGroups,
  getGroupRoster,
  subscribe,
  transferGroup,
  listTeacherRoster,
  modifyPlan,
  getSubscription,
  deleteSubscription,
  listSubscriptions,
};
