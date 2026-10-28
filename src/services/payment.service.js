const { Subscription } = require('../models/Subscription');
const { Payment } = require('../models/Payment');
const { nextReceiptNumber } = require('../models/Counter');
const { AppError } = require('../utils/AppError');
const { withTransaction } = require('../utils/transaction');
const { PAYMENT_STATUS, CURRENCY, SUBSCRIPTION_STATUS } = require('../constants');
const { nowUtc } = require('../utils/time');
const { recordMovement } = require('./treasury.service');
const {
  buildFifoAllocations,
  validateExplicitAllocations,
  applyAllocations,
  reverseAllocations,
  refreshInstallmentStatuses,
} = require('./installment.helpers');

async function createPayment({
  subscriptionId,
  amount,
  allocations,
  method,
  cashboxId,
  notes,
  paidAt,
  actorId,
}) {
  if (!amount || amount <= 0) throw new AppError('payment.invalidAllocations', 400);

  return withTransaction(async (session) => {
    const sub = await Subscription.findById(subscriptionId).session(session);
    if (!sub) throw new AppError('subscription.notFound', 404);
    if (amount > sub.remainingAmount) throw new AppError('payment.overpay', 400);

    const resolved = allocations?.length
      ? validateExplicitAllocations(sub, amount, allocations)
      : buildFifoAllocations(sub, amount);

    const bumped = await Subscription.updateOne(
      {
        _id: subscriptionId,
        remainingAmount: { $gte: amount },
      },
      {
        $inc: { paidAmount: amount, remainingAmount: -amount },
      },
      { session }
    );
    if (bumped.modifiedCount !== 1) {
      throw new AppError('payment.overpay', 400);
    }

    const fresh = await Subscription.findById(subscriptionId).session(session);
    applyAllocations(fresh, resolved);
    fresh.paidAmount = fresh.paidAmount; // already updated via updateOne
    refreshInstallmentStatuses(fresh);
    if (fresh.remainingAmount === 0) {
      fresh.status = SUBSCRIPTION_STATUS.COMPLETED;
      fresh.endedAt = nowUtc();
    }
    await fresh.save({ session });

    const receiptNumber = await nextReceiptNumber(session);
    const [payment] = await Payment.create(
      [
        {
          subscriptionId,
          studentId: fresh.studentId,
          cashboxId,
          amount,
          currency: CURRENCY,
          allocations: resolved,
          receiptNumber,
          method: method || 'cash',
          status: PAYMENT_STATUS.COMPLETED,
          paidAt: paidAt || nowUtc(),
          recordedBy: actorId,
          notes: notes || null,
        },
      ],
      { session }
    );
    await recordMovement({
      cashboxId,
      kind: 'income',
      direction: 'in',
      amount,
      description: `Student payment ${receiptNumber}`,
      referenceId: payment._id,
      referenceType: 'payment',
      actorId,
      occurredAt: payment.paidAt,
      session,
    });

    return { payment, subscription: fresh };
  });
}

async function reversePayment({ paymentId, reason, actorId }) {
  return withTransaction(async (session) => {
    const payment = await Payment.findById(paymentId).session(session);
    if (!payment) throw new AppError('payment.notFound', 404);
    if (payment.status === PAYMENT_STATUS.REVERSED) {
      throw new AppError('payment.alreadyReversed', 400);
    }
    await recordMovement({
      cashboxId: payment.cashboxId,
      kind: 'payment_reversal',
      direction: 'out',
      amount: payment.amount,
      description: `Reversal of payment ${payment.receiptNumber}`,
      referenceId: payment._id,
      referenceType: 'payment',
      actorId,
      occurredAt: nowUtc(),
      session,
    });

    const sub = await Subscription.findById(payment.subscriptionId).session(session);
    if (!sub) throw new AppError('subscription.notFound', 404);

    reverseAllocations(sub, payment.allocations);
    sub.paidAmount -= payment.amount;
    sub.remainingAmount += payment.amount;
    if (sub.status === SUBSCRIPTION_STATUS.COMPLETED) {
      sub.status = SUBSCRIPTION_STATUS.ACTIVE;
      sub.endedAt = null;
    }
    refreshInstallmentStatuses(sub);
    await sub.save({ session });

    payment.status = PAYMENT_STATUS.REVERSED;
    payment.reversedAt = nowUtc();
    payment.reversedBy = actorId;
    payment.reverseReason = reason || null;
    await payment.save({ session });

    return { payment, subscription: sub };
  });
}

module.exports = { createPayment, reversePayment };
