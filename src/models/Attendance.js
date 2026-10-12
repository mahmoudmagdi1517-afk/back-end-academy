const mongoose = require('mongoose');
const { ATTENDANCE_STATUS } = require('../constants');

const attendanceAuditSchema = new mongoose.Schema(
  {
    at: { type: Date, required: true },
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    fromStatus: { type: String, default: null },
    toStatus: { type: String, required: true },
    note: { type: String, default: null },
  },
  { _id: true }
);

const attendanceSchema = new mongoose.Schema(
  {
    sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Session', required: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    status: {
      type: String,
      enum: Object.values(ATTENDANCE_STATUS),
      required: true,
    },
    reviewNeeded: { type: Boolean, default: false },
    reviewNote: { type: String, default: null },
    markedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    audit: { type: [attendanceAuditSchema], default: [] },
  },
  { timestamps: true }
);

attendanceSchema.index({ sessionId: 1, studentId: 1 }, { unique: true });

const Attendance = mongoose.model('Attendance', attendanceSchema);

module.exports = { Attendance };
