const { INSTALLMENT_STATUS } = require('../constants');
const { qatarToday } = require('../utils/time');
const { AppError } = require('../utils/AppError');

function remainingOf(inst) {
  return Math.max(0, inst.amount - inst.paidAmount);
}

function deriveInstallmentStatus(inst, today = qatarToday()) {
  if (inst.paidAmount >= inst.amount) return INSTALLMENT_STATUS.PAID;
  if (inst.paidAmount > 0) {
    if (inst.dueDate < today) return INSTALLMENT_STATUS.OVERDUE;
    return INSTALLMENT_STATUS.PARTIAL;
  }
  if (inst.dueDate < today) return INSTALLMENT_STATUS.OVERDUE;
  return INSTALLMENT_STATUS.PENDING;
}

function refreshInstallmentStatuses(subscription, today = qatarToday()) {
  for (const inst of subscription.installments) {
    inst.status = deriveInstallmentStatus(inst, today);
  }
}

/** FIFO by dueDate across unpaid installments; may split. */
function buildFifoAllocations(subscription, amount) {
  if (amount <= 0) throw new AppError('payment.invalidAllocations', 400);
  if (amount > subscription.remainingAmount) throw new AppError('payment.overpay', 400);

  const sorted = [...subscription.installments]
    .filter((i) => remainingOf(i) > 0)
    .sort((a, b) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0));

  let left = amount;
  const allocations = [];
  for (const inst of sorted) {
    if (left <= 0) break;
    const take = Math.min(remainingOf(inst), left);
    if (take > 0) {
      allocations.push({ installmentId: inst._id, amount: take });
      left -= take;
    }
  }
  if (left !== 0 || !allocations.length) {
    throw new AppError('payment.invalidAllocations', 400);
  }
  return allocations;
}

function validateExplicitAllocations(subscription, amount, allocations) {
  if (!allocations?.length) throw new AppError('payment.invalidAllocations', 400);
  const sum = allocations.reduce((s, a) => s + a.amount, 0);
  if (sum !== amount) throw new AppError('payment.invalidAllocations', 400);
  if (amount > subscription.remainingAmount) throw new AppError('payment.overpay', 400);

  for (const a of allocations) {
    if (a.amount <= 0) throw new AppError('payment.invalidAllocations', 400);
    const inst = subscription.installments.id(a.installmentId);
    if (!inst) throw new AppError('payment.invalidAllocations', 400);
    if (a.amount > remainingOf(inst)) throw new AppError('payment.invalidAllocations', 400);
  }
  return allocations;
}

function applyAllocations(subscription, allocations) {
  for (const a of allocations) {
    const inst = subscription.installments.id(a.installmentId);
    inst.paidAmount += a.amount;
  }
  refreshInstallmentStatuses(subscription);
}

function reverseAllocations(subscription, allocations) {
  for (const a of allocations) {
    const inst = subscription.installments.id(a.installmentId);
    if (!inst) continue;
    inst.paidAmount = Math.max(0, inst.paidAmount - a.amount);
  }
  refreshInstallmentStatuses(subscription);
}

function assertPlanEditValid(subscription, newUnpaidRows) {
  const paidImmutable = subscription.installments.filter((i) => i.paidAmount >= i.amount);
  const partials = subscription.installments.filter((i) => i.paidAmount > 0 && i.paidAmount < i.amount);

  for (const p of partials) {
    const match = newUnpaidRows.find((r) => String(r._id) === String(p._id));
    if (match && match.amount < p.paidAmount) {
      throw new AppError('subscription.invalidPlan', 400);
    }
  }

  const remainingSum = newUnpaidRows.reduce((s, r) => {
    const paid = r.paidAmount || 0;
    return s + Math.max(0, r.amount - paid);
  }, 0);

  // Fully paid rows stay; remaining on all installments must equal subscription.remainingAmount
  // After edit, paid totals unchanged so remainingAmount must match sum of remainders on kept rows
  if (remainingSum !== subscription.remainingAmount) {
    throw new AppError('subscription.invalidPlan', 400, {
      remainingSum,
      subscriptionRemaining: subscription.remainingAmount,
    });
  }

  return { paidImmutable, partials };
}

module.exports = {
  remainingOf,
  deriveInstallmentStatus,
  refreshInstallmentStatuses,
  buildFifoAllocations,
  validateExplicitAllocations,
  applyAllocations,
  reverseAllocations,
  assertPlanEditValid,
};
