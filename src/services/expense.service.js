const { Expense } = require('../models/Expense');
const { Payment } = require('../models/Payment');
const { Payroll } = require('../models/Payroll');
const { nextSeq } = require('../models/Counter');
const { PAYMENT_STATUS, PAYROLL_STATUS } = require('../constants');
const { AppError } = require('../utils/AppError');
const { withTransaction } = require('../utils/transaction');
const { recordMovement } = require('./treasury.service');
const { Cashbox } = require('../models/Cashbox');

const MAX_RECEIPT_BYTES = 1_500_000;

async function createExpense({ cashboxId, category, description, amount, spentAt, notes, receipt, actorId }) {
  let receiptImageData = null;
  let receiptImageMimeType = null;

  if (receipt) {
    receiptImageData = Buffer.from(receipt.data, 'base64');
    if (!receiptImageData.length || receiptImageData.length > MAX_RECEIPT_BYTES) {
      throw new AppError('expense.receiptTooLarge', 400);
    }
    receiptImageMimeType = receipt.mimeType;
  }

  return withTransaction(async (session) => {
    const sequence = await nextSeq('expenseVoucherNumber', session);
    const [expense] = await Expense.create(
      [
        {
          voucherNumber: `EXP-${String(sequence).padStart(8, '0')}`,
          cashboxId,
          category,
          description,
          amount,
          spentAt,
          notes: notes || null,
          receiptImageData,
          receiptImageMimeType,
          recordedBy: actorId,
        },
      ],
      { session }
    );
    await recordMovement({
      cashboxId,
      kind: 'expense',
      direction: 'out',
      amount,
      description,
      referenceId: expense._id,
      referenceType: 'expense',
      actorId,
      occurredAt: spentAt,
      session,
    });
    return expense;
  });
}

async function getExpenseReceipt(expenseId) {
  const expense = await Expense.findById(expenseId).select('+receiptImageData');
  if (!expense) throw new AppError('expense.notFound', 404);
  if (!expense.receiptImageData || !expense.receiptImageMimeType) {
    throw new AppError('expense.receiptNotFound', 404);
  }
  return {
    mimeType: expense.receiptImageMimeType,
    data: expense.receiptImageData.toString('base64'),
  };
}

async function getFinancialSummary({ includeProfit }) {
  const [payments, expenses, payrolls, cashboxes] = await Promise.all([
    Payment.aggregate([
      { $match: { status: PAYMENT_STATUS.COMPLETED } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
    Expense.aggregate([{ $group: { _id: null, total: { $sum: '$amount' } } }]),
    Payroll.aggregate([
      { $match: { status: { $in: [PAYROLL_STATUS.APPROVED, PAYROLL_STATUS.PAID] } } },
      { $group: { _id: null, total: { $sum: '$netAmount' } } },
    ]),
    Cashbox.aggregate([
      { $match: { isActive: true } },
      { $group: { _id: null, total: { $sum: '$balance' } } },
    ]),
  ]);

  const paymentsTotal = payments[0]?.total || 0;
  const expensesTotal = expenses[0]?.total || 0;
  const payrollTotal = payrolls[0]?.total || 0;
  const cashboxBalance = cashboxes[0]?.total || 0;
  const summary = { paymentsTotal, expensesTotal, payrollTotal, cashboxBalance };
  if (includeProfit) summary.netProfit = paymentsTotal - expensesTotal - payrollTotal;
  return summary;
}

module.exports = { createExpense, getExpenseReceipt, getFinancialSummary };
