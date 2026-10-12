const mongoose = require('mongoose');
const { CURRENCY } = require('../constants');

const cashboxSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    type: { type: String, enum: ['cash', 'bank'], required: true },
    currency: { type: String, default: CURRENCY, immutable: true },
    openingBalance: { type: Number, required: true, min: 0, default: 0 },
    balance: { type: Number, required: true, min: 0, default: 0 },
    isActive: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

cashboxSchema.index({ name: 1, type: 1 }, { unique: true });

const Cashbox = mongoose.model('Cashbox', cashboxSchema);

module.exports = { Cashbox };
