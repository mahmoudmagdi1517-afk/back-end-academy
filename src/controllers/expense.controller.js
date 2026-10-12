const { Expense } = require('../models/Expense');
const expenseService = require('../services/expense.service');
const { asyncHandler } = require('../middlewares/asyncHandler');
const { AppError } = require('../utils/AppError');

const createExpense = asyncHandler(async (req, res) => {
  const expense = await expenseService.createExpense({
    ...req.body,
    actorId: req.user._id,
  });
  const data = expense.toObject();
  delete data.receiptImageData;
  res.status(201).json({ success: true, data });
});

const listExpenses = asyncHandler(async (_req, res) => {
  const expenses = await Expense.find().sort({ spentAt: -1, createdAt: -1 }).limit(500);
  res.json({ success: true, data: expenses });
});

const getExpenseReceipt = asyncHandler(async (req, res) => {
  const receipt = await expenseService.getExpenseReceipt(req.params.id);
  res.json({ success: true, data: receipt });
});

const getFinancialSummary = asyncHandler(async (req, res) => {
  const summary = await expenseService.getFinancialSummary({
    includeProfit: req.user.role === 'owner',
  });
  res.json({ success: true, data: summary });
});

const getExpense = asyncHandler(async (req, res) => {
  const expense = await Expense.findById(req.params.id);
  if (!expense) throw new AppError('expense.notFound', 404);
  res.json({ success: true, data: expense });
});

module.exports = { createExpense, listExpenses, getExpense, getExpenseReceipt, getFinancialSummary };
