const { Payment } = require('../models/Payment');
const paymentService = require('../services/payment.service');
const { asyncHandler } = require('../middlewares/asyncHandler');
const { AppError } = require('../utils/AppError');

const createPayment = asyncHandler(async (req, res) => {
  const result = await paymentService.createPayment({
    ...req.body,
    actorId: req.user._id,
  });
  res.status(201).json({ success: true, data: result });
});

const reversePayment = asyncHandler(async (req, res) => {
  const result = await paymentService.reversePayment({
    paymentId: req.params.id,
    reason: req.body.reason,
    actorId: req.user._id,
  });
  res.json({ success: true, data: result });
});

const getPayment = asyncHandler(async (req, res) => {
  const payment = await Payment.findById(req.params.id);
  if (!payment) throw new AppError('payment.notFound', 404);
  res.json({ success: true, data: payment });
});

const listPayments = asyncHandler(async (req, res) => {
  const q = {};
  if (req.query.subscriptionId) q.subscriptionId = req.query.subscriptionId;
  if (req.query.studentId) q.studentId = req.query.studentId;
  const rows = await Payment.find(q).sort({ paidAt: -1 }).limit(200);
  res.json({ success: true, data: rows });
});

module.exports = { createPayment, reversePayment, getPayment, listPayments };
