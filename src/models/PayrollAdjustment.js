const mongoose = require('mongoose');
const { CURRENCY } = require('../constants');

const adjustmentSchema = new mongoose.Schema(
  {
    employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
    kind: { type: String, enum: ['bonus', 'deduction', 'advance'], required: true },
    amount: { type: Number, required: true, min: 1 }, // fils absolute
    currency: { type: String, default: CURRENCY },
    reason: { type: String, required: true },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'applied'],
      default: 'pending',
    },
    payrollId: { type: mongoose.Schema.Types.ObjectId, ref: 'Payroll', default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    approvedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

const PayrollAdjustment = mongoose.model('PayrollAdjustment', adjustmentSchema);

module.exports = { PayrollAdjustment };
