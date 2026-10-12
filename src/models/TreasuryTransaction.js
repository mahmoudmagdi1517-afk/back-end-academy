const mongoose = require('mongoose');
const { CURRENCY } = require('../constants');

const treasuryTransactionSchema = new mongoose.Schema(
  {
    cashboxId: { type: mongoose.Schema.Types.ObjectId, ref: 'Cashbox', required: true, index: true },
    kind: {
      type: String,
      enum: ['opening_balance', 'income', 'expense', 'payroll', 'payment_reversal'],
      required: true,
    },
    amount: { type: Number, required: true }, // fils; inflows positive, outflows negative
    currency: { type: String, default: CURRENCY, immutable: true },
    description: { type: String, required: true, trim: true },
    referenceId: { type: mongoose.Schema.Types.ObjectId, default: null },
    referenceType: { type: String, default: null },
    occurredAt: { type: Date, required: true },
    recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

treasuryTransactionSchema.index({ occurredAt: -1, createdAt: -1 });

const TreasuryTransaction = mongoose.model('TreasuryTransaction', treasuryTransactionSchema);

module.exports = { TreasuryTransaction };
