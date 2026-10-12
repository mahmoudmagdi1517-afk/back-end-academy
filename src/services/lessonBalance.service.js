const { Attendance } = require('../models/Attendance');
const { Session } = require('../models/Session');
const { Group } = require('../models/Group');

const LESSON_CONSUMING_STATUSES = new Set(['present', 'late']);

async function ensureLessonBalance(subscription, dbSession) {
  if (subscription.lessonsRemaining != null) return subscription;

  const groupsQuery = Group.find({ courseId: subscription.courseId }).select('_id');
  if (dbSession) groupsQuery.session(dbSession);
  const courseGroups = await groupsQuery;
  const query = Session.find({
    groupId: { $in: courseGroups.map((group) => group._id) },
    scheduledStartAt: { $gte: subscription.startedAt },
  }).select('_id');
  if (dbSession) query.session(dbSession);
  const sessions = await query;
  const sessionIds = sessions.map((row) => row._id);
  const attendanceQuery = Attendance.countDocuments({
    sessionId: { $in: sessionIds },
    studentId: subscription.studentId,
    status: { $in: [...LESSON_CONSUMING_STATUSES] },
  });
  if (dbSession) attendanceQuery.session(dbSession);
  const consumed = await attendanceQuery;
  const groupQuery = Group.findById(subscription.groupId).select('sessionCount');
  if (dbSession) groupQuery.session(dbSession);
  const group = await groupQuery;
  const purchased = Math.max(0, group?.sessionCount || 0);

  subscription.lessonsPurchased = purchased;
  subscription.lessonsRemaining = Math.max(0, purchased - consumed);
  await subscription.save(dbSession ? { session: dbSession } : undefined);
  return subscription;
}

function belongsToGroupAt(subscription, groupId, at) {
  const timestamp = at instanceof Date ? at : new Date(at);
  if (Number.isNaN(timestamp.getTime())) return false;
  if (subscription.startedAt && timestamp < subscription.startedAt) return false;

  let historicalGroupId = String(subscription.groupId);
  const history = [...(subscription.groupTransferHistory || [])].reverse();
  for (const transfer of history) {
    if (timestamp < transfer.at) {
      historicalGroupId = String(transfer.fromGroupId);
    } else {
      break;
    }
  }
  return historicalGroupId === String(groupId);
}

module.exports = {
  LESSON_CONSUMING_STATUSES,
  ensureLessonBalance,
  belongsToGroupAt,
};
