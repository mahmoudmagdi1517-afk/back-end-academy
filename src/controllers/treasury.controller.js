const { Cashbox } = require('../models/Cashbox');
const treasury = require('../services/treasury.service');
const { asyncHandler } = require('../middlewares/asyncHandler');

const createCashbox = asyncHandler(async (req, res) => {
  const cashbox = await treasury.createCashbox({ ...req.body, actorId: req.user._id });
  res.status(201).json({ success: true, data: cashbox });
});

const listCashboxes = asyncHandler(async (_req, res) => {
  const cashboxes = await Cashbox.find({ isActive: true }).sort({ type: 1, name: 1 });
  res.json({ success: true, data: cashboxes });
});

const listTransactions = asyncHandler(async (_req, res) => {
  const transactions = await treasury.listTransactions();
  res.json({ success: true, data: transactions });
});

const getSummary = asyncHandler(async (_req, res) => {
  const summary = await treasury.getSummary();
  res.json({ success: true, data: summary });
});

module.exports = { createCashbox, listCashboxes, listTransactions, getSummary };
