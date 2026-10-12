const mongoose = require('mongoose');
const { MAKEUP_PRICING, CURRENCY } = require('../constants');

const makeupSessionSchema = new mongoose.Schema(
  {
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true },
    sourceSessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Session', default: null },
    scheduledDate: { type: String, required: true }, // Qatar YYYY-MM-DD
    pricingType: {
      type: String,
      enum: Object.values(MAKEUP_PRICING),
      default: MAKEUP_PRICING.FREE,
    },
    feeAmount: { type: Number, required: true, default: 0, min: 0 }, // V1 always 0
    currency: { type: String, default: CURRENCY },
    status: {
      type: String,
      enum: ['scheduled', 'completed', 'missed', 'cancelled'],
      default: 'scheduled',
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    notes: { type: String, default: null },
  },
  { timestamps: true }
);

const MakeupSession = mongoose.model('MakeupSession', makeupSessionSchema);

module.exports = { MakeupSession };
