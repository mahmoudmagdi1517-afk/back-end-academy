const { Cashbox } = require('../models/Cashbox');
const { TreasuryTransaction } = require('../models/TreasuryTransaction');
const { withTransaction } = require('../utils/transaction');
const { AppError } = require('../utils/AppError');
const { nowUtc } = require('../utils/time');

async function recordMovement({
  cashboxId,
  kind,
  amount,
  direction,
  description,
  source,
  referenceId,
  referenceType,
  actorId,
  occurredAt,
  session,
}) {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new AppError('common.validation', 400);
  }
  const cashbox = await Cashbox.findOne({ _id: cashboxId, isActive: true }).session(session);
  if (!cashbox) throw new AppError('treasury.accountNotFound', 404);

  const change = direction === 'in' ? amount : -amount;
  const filter = { _id: cashboxId };
  if (direction === 'out') filter.balance = { $gte: amount };
  const result = await Cashbox.updateOne(filter, { $inc: { balance: change } }, { session });
  if (result.matchedCount !== 1) throw new AppError('treasury.insufficientBalance', 400);

  const [transaction] = await TreasuryTransaction.create(
    [
      {
        cashboxId,
        kind,
        amount: change,
        description,
        source: source || null,
        referenceId: referenceId || null,
        referenceType: referenceType || null,
        occurredAt: occurredAt || nowUtc(),
        recordedBy: actorId,
      },
    ],
    { session }
  );
  return transaction;
}

async function createCashbox({ name, type, openingBalance, actorId }) {
  return withTransaction(async (session) => {
    const [cashbox] = await Cashbox.create(
      [
        {
          name,
          type,
          openingBalance,
          balance: openingBalance,
          createdBy: actorId,
        },
      ],
      { session }
    );
    if (openingBalance > 0) {
      await TreasuryTransaction.create(
        [
          {
            cashboxId: cashbox._id,
            kind: 'opening_balance',
            amount: openingBalance,
            description: `Opening balance - ${name}`,
            occurredAt: nowUtc(),
            recordedBy: actorId,
          },
        ],
        { session }
      );
    }
    return cashbox;
  });
}

async function addFunds({ cashboxId, amount, source, actorId }) {
  return withTransaction((session) =>
    recordMovement({
      cashboxId,
      kind: 'deposit',
      amount,
      direction: 'in',
      description: 'Manual deposit',
      source: source.trim(),
      actorId,
      session,
    })
  );
}

async function listTransactions(limit = 200) {
  return TreasuryTransaction.find()
    .sort({ occurredAt: -1, createdAt: -1 })
    .limit(limit)
    .populate('cashboxId', 'name type');
}

async function getSummary() {
  const [cashboxes, transactions] = await Promise.all([
    Cashbox.find({ isActive: true }).sort({ type: 1, name: 1 }),
    listTransactions(20),
  ]);
  const totalBalance = cashboxes.reduce((sum, cashbox) => sum + cashbox.balance, 0);
  return { cashboxes, totalBalance, recentTransactions: transactions };
}

module.exports = { createCashbox, addFunds, listTransactions, getSummary, recordMovement };
