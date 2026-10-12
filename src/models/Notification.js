const mongoose = require('mongoose');
const { NOTIFICATION_TYPE } = require('../constants');

const notificationSchema = new mongoose.Schema(
  {
    type: { type: String, enum: Object.values(NOTIFICATION_TYPE), required: true },
    entityType: { type: String, required: true },
    entityId: { type: mongoose.Schema.Types.ObjectId, required: true },
    businessDate: { type: String, required: true }, // Qatar YYYY-MM-DD
    dedupeKey: { type: String, required: true, unique: true },
    payload: { type: mongoose.Schema.Types.Mixed, default: {} },
    readAt: { type: Date, default: null },
  },
  { timestamps: true }
);

const Notification = mongoose.model('Notification', notificationSchema);

module.exports = { Notification };
