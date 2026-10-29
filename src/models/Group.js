const mongoose = require('mongoose');

const scheduleSlotSchema = new mongoose.Schema(
  {
    dayOfWeek: { type: Number, required: true, min: 1, max: 7 },
    startTime: { type: String, required: true, match: /^([01]\d|2[0-3]):[0-5]\d$/ },
    endTime: { type: String, required: true, match: /^([01]\d|2[0-3]):[0-5]\d$/ },
    teacherEmployeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', default: null },
  },
  { _id: true }
);

const groupSchema = new mongoose.Schema(
  {
    courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
    name: { type: String, required: true, trim: true },
    nameAr: { type: String, default: null, trim: true },
    capacity: { type: Number, default: null, min: 0 }, // display-only; never enforced
    teacherEmployeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', default: null },
    startDate: { type: String, default: null },
    sessionCount: { type: Number, default: null, min: 1, max: 500 },
    schedules: { type: [scheduleSlotSchema], default: [] },
    scheduleNote: { type: String, default: null },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

groupSchema.index({ courseId: 1, name: 1 });

const Group = mongoose.model('Group', groupSchema);

module.exports = { Group };
