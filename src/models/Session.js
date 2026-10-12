const mongoose = require('mongoose');
const { SESSION_STATUS } = require('../constants');

const scheduleHistorySchema = new mongoose.Schema(
  {
    at: { type: Date, required: true },
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    action: { type: String, enum: ['postpone', 'cancel'], required: true },
    fromDate: { type: String, required: true }, // Qatar YYYY-MM-DD superseded
    toDate: { type: String, default: null }, // new currentDate for postpone
    reason: { type: String, default: null },
  },
  { _id: true }
);

const sessionSchema = new mongoose.Schema(
  {
    groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true, index: true },
    scheduleSlotId: { type: mongoose.Schema.Types.ObjectId, default: null },
    courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
    teacherEmployeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', default: null },
    originalDate: { type: String, required: true }, // forever
    currentDate: { type: String, required: true, index: true },
    scheduledStartAt: { type: Date, default: null, index: true },
    scheduledEndAt: { type: Date, default: null },
    missingAttendanceAlertedAt: { type: Date, default: null },
    sessionLogCheckedAt: { type: Date, default: null },
    status: {
      type: String,
      enum: Object.values(SESSION_STATUS),
      default: SESSION_STATUS.SCHEDULED,
      index: true,
    },
    scheduleHistory: { type: [scheduleHistorySchema], default: [] },
    closedAt: { type: Date, default: null },
    closedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    notes: { type: String, default: null },
  },
  { timestamps: true }
);

sessionSchema.index({ groupId: 1, currentDate: 1 });
sessionSchema.index(
  { groupId: 1, scheduleSlotId: 1, originalDate: 1 },
  { unique: true, partialFilterExpression: { scheduleSlotId: { $type: 'objectId' } } }
);
sessionSchema.index({ status: 1, scheduledEndAt: 1, sessionLogCheckedAt: 1 });

const Session = mongoose.model('Session', sessionSchema);

module.exports = { Session };
