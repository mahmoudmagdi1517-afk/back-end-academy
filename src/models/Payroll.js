const mongoose = require('mongoose');
const { PAYROLL_STATUS, CURRENCY } = require('../constants');

const payrollLineSchema = new mongoose.Schema(
  {
    code: { type: String, required: true },
    label: { type: String, required: true },
    amount: { type: Number, required: true }, // fils; deductions negative
    meta: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { _id: true }
);

const payrollSchema = new mongoose.Schema(
  {
    employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
    year: { type: Number, required: true },
    month: { type: Number, required: true, min: 1, max: 12 },
    status: {
      type: String,
      enum: Object.values(PAYROLL_STATUS),
      default: PAYROLL_STATUS.DRAFT,
    },
    currency: { type: String, default: CURRENCY },
    lines: { type: [payrollLineSchema], default: [] },
    sessionCount: { type: Number, default: 0 },
    sessionEarnings: { type: Number, default: 0 },
    fixedAmount: { type: Number, default: 0 },
    grossAmount: { type: Number, default: 0 },
    netAmount: { type: Number, default: 0 },
    snapshot: { type: mongoose.Schema.Types.Mixed, default: null }, // immutable after approve
    calculatedAt: { type: Date, default: null },
    reviewedAt: { type: Date, default: null },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    approvedAt: { type: Date, default: null },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    paidAt: { type: Date, default: null },
    paidBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    paidCashboxId: { type: mongoose.Schema.Types.ObjectId, ref: 'Cashbox', default: null },
  },
  { timestamps: true }
);

payrollSchema.index({ employeeId: 1, year: 1, month: 1 }, { unique: true });

const Payroll = mongoose.model('Payroll', payrollSchema);

module.exports = { Payroll };
