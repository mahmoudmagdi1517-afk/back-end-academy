const mongoose = require('mongoose');
const { PAYMENT_STATUS, CURRENCY } = require('../constants');

const allocationSchema = new mongoose.Schema(
  {
    installmentId: { type: mongoose.Schema.Types.ObjectId, required: true },
    amount: { type: Number, required: true, min: 1 },
  },
  { _id: false }
);

const paymentSchema = new mongoose.Schema(
  {
    subscriptionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subscription', required: true, index: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    cashboxId: { type: mongoose.Schema.Types.ObjectId, ref: 'Cashbox', required: true },
    amount: { type: Number, required: true, min: 1 }, // once; never double-sum with allocations
    currency: { type: String, default: CURRENCY, immutable: true },
    allocations: {
      type: [allocationSchema],
      required: true,
      validate: {
        validator(v) {
          if (!v || !v.length) return false;
          const sum = v.reduce((s, a) => s + a.amount, 0);
          return sum === this.amount;
        },
        message: 'sum(allocations) must equal amount',
      },
    },
    receiptNumber: { type: String, required: true, unique: true },
    method: { type: String, default: 'cash', trim: true },
    status: {
      type: String,
      enum: Object.values(PAYMENT_STATUS),
      default: PAYMENT_STATUS.COMPLETED,
    },
    paidAt: { type: Date, required: true },
    recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    reversedAt: { type: Date, default: null },
    reversedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reverseReason: { type: String, default: null },
    notes: { type: String, default: null },
  },
  { timestamps: true }
);

const Payment = mongoose.model('Payment', paymentSchema);

module.exports = { Payment };
