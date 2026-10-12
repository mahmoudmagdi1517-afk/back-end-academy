const mongoose = require('mongoose');
const { SALARY_TYPE, CURRENCY } = require('../constants');

const salaryConfigurationSchema = new mongoose.Schema(
  {
    employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
    version: { type: Number, required: true },
    effectiveFrom: { type: String, required: true }, // Qatar YYYY-MM-DD
    type: { type: String, enum: Object.values(SALARY_TYPE), required: true },
    fixedMonthly: { type: Number, default: 0, min: 0 }, // fils
    sessionRate: { type: Number, default: 0, min: 0 }, // fils
    currency: { type: String, default: CURRENCY },
    notes: { type: String, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    isCurrent: { type: Boolean, default: true },
  },
  { timestamps: true }
);

salaryConfigurationSchema.index({ employeeId: 1, version: 1 }, { unique: true });

const SalaryConfiguration = mongoose.model('SalaryConfiguration', salaryConfigurationSchema);

module.exports = { SalaryConfiguration };
