const mongoose = require('mongoose');

const studentSchema = new mongoose.Schema(
  {
    studentCode: { type: String, required: true, unique: true, uppercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    nameAr: { type: String, default: null, trim: true },
    phone: { type: String, default: null, trim: true },
    nationalId: { type: String, default: null, trim: true },
    email: { type: String, default: null, lowercase: true, trim: true },
    dateOfBirth: { type: Date, default: null },
    notes: { type: String, default: null },
    isActive: { type: Boolean, default: true },
    subscriptionRevision: { type: Number, default: 0, select: false },
  },
  { timestamps: true }
);

// phone and nationalId are optional and NOT unique (V1 lock)

const Student = mongoose.model('Student', studentSchema);

module.exports = { Student };
