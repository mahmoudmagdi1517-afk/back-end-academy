const mongoose = require('mongoose');
const { CURRENCY, EXPENSE_CATEGORIES } = require('../constants');

const expenseSchema = new mongoose.Schema(
  {
    voucherNumber: { type: String, required: true, unique: true },
    category: { type: String, enum: EXPENSE_CATEGORIES, required: true },
    description: { type: String, required: true, trim: true },
    amount: { type: Number, required: true, min: 1 }, // fils
    cashboxId: { type: mongoose.Schema.Types.ObjectId, ref: 'Cashbox', required: true },
    currency: { type: String, default: CURRENCY, immutable: true },
    spentAt: { type: Date, required: true },
    recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    notes: { type: String, default: null },
    receiptImageData: { type: Buffer, default: null, select: false },
    receiptImageMimeType: { type: String, default: null },
  },
  { timestamps: true }
);

const Expense = mongoose.model('Expense', expenseSchema);

module.exports = { Expense };
