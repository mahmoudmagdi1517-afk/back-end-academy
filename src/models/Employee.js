const mongoose = require('mongoose');
const { EMPLOYEE_ROLES } = require('../constants');

const employeeSchema = new mongoose.Schema(
  {
    employeeCode: { type: String, required: true, unique: true, uppercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    nameAr: { type: String, default: null, trim: true },
    phone: { type: String, default: null },
    email: { type: String, default: null, lowercase: true },
    hireDate: { type: String, default: null }, // Qatar YYYY-MM-DD
    isActive: { type: Boolean, default: true },
    isTeacher: { type: Boolean, default: false },
    role: { type: String, enum: Object.values(EMPLOYEE_ROLES), default: null },
    scheduleLockToken: { type: String, default: null, select: false },
    scheduleLockUntil: { type: Date, default: null, select: false },
  },
  { timestamps: true }
);

const Employee = mongoose.model('Employee', employeeSchema);

module.exports = { Employee };
