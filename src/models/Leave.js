const mongoose = require('mongoose');
const { LEAVE_STATUS } = require('../constants');

const leaveSchema = new mongoose.Schema(
  {
    employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
    startDate: { type: String, required: true }, // Qatar YYYY-MM-DD
    endDate: { type: String, required: true },
    reason: { type: String, default: null },
    status: {
      type: String,
      enum: Object.values(LEAVE_STATUS),
      default: LEAVE_STATUS.APPROVED,
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

const Leave = mongoose.model('Leave', leaveSchema);

module.exports = { Leave };
