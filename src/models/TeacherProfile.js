const mongoose = require('mongoose');

const teacherProfileSchema = new mongoose.Schema(
  {
    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee',
      required: true,
      unique: true,
    },
    specialties: { type: [String], default: [] },
    notes: { type: String, default: null },
  },
  { timestamps: true }
);

const TeacherProfile = mongoose.model('TeacherProfile', teacherProfileSchema);

module.exports = { TeacherProfile };
