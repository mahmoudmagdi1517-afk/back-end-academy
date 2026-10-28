const mongoose = require('mongoose');
const { SUBSCRIPTION_STATUS, INSTALLMENT_STATUS, CURRENCY } = require('../constants');

const installmentSchema = new mongoose.Schema(
  {
    dueDate: { type: String, required: true }, // YYYY-MM-DD Asia/Qatar calendar
    amount: { type: Number, required: true, min: 0 }, // fils
    paidAmount: { type: Number, required: true, default: 0, min: 0 },
    status: {
      type: String,
      enum: Object.values(INSTALLMENT_STATUS),
      default: INSTALLMENT_STATUS.PENDING,
    },
  },
  { _id: true }
);

const planChangeHistorySchema = new mongoose.Schema(
  {
    at: { type: Date, required: true },
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    reason: { type: String, required: true },
    oldUnpaidRows: { type: [mongoose.Schema.Types.Mixed], required: true },
    newUnpaidRows: { type: [mongoose.Schema.Types.Mixed], required: true },
  },
  { _id: true }
);

const groupTransferHistorySchema = new mongoose.Schema(
  {
    at: { type: Date, required: true },
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    fromGroupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true },
    toGroupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true },
  },
  { _id: true }
);

const subscriptionSchema = new mongoose.Schema(
  {
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
    groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true },
    status: {
      type: String,
      enum: Object.values(SUBSCRIPTION_STATUS),
      default: SUBSCRIPTION_STATUS.ACTIVE,
    },
    currency: { type: String, default: CURRENCY, immutable: true },
    price: { type: Number, required: true, min: 0 }, // snapshot fils
    paidAmount: { type: Number, required: true, default: 0, min: 0 },
    remainingAmount: { type: Number, required: true, min: 0 },
    lessonsPurchased: { type: Number, default: null, min: 0 },
    lessonsRemaining: { type: Number, default: null, min: 0 },
    renewedToSubscriptionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Subscription',
      default: null,
    },
    installments: { type: [installmentSchema], required: true },
    planChangeHistory: { type: [planChangeHistorySchema], default: [] },
    groupTransferHistory: { type: [groupTransferHistorySchema], default: [] },
    startedAt: { type: Date, required: true },
    endedAt: { type: Date, default: null },
    transferredFromId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subscription', default: null },
    notes: { type: String, default: null },
  },
  { timestamps: true }
);

subscriptionSchema.index({ studentId: 1, status: 1 });
subscriptionSchema.index({ groupId: 1, status: 1 });
subscriptionSchema.index({ studentId: 1, courseId: 1 });
subscriptionSchema.set('autoIndex', false);

const Subscription = mongoose.model('Subscription', subscriptionSchema);

module.exports = { Subscription };
