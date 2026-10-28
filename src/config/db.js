const mongoose = require('mongoose');
const { Subscription } = require('../models/Subscription');

async function updateSubscriptionIndexes() {
  try {
    await Subscription.collection.dropIndex('studentId_1_courseId_1');
  } catch (err) {
    if (![26, 27].includes(err.code)) throw err;
  }

  await Promise.all([
    Subscription.collection.createIndex(
      { studentId: 1, status: 1 },
      { name: 'studentId_1_status_1' }
    ),
    Subscription.collection.createIndex(
      { groupId: 1, status: 1 },
      { name: 'groupId_1_status_1' }
    ),
    Subscription.collection.createIndex(
      { studentId: 1, courseId: 1 },
      { name: 'studentId_1_courseId_1' }
    ),
  ]);
}

async function connectDb() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI is required');
  }
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri);
  await updateSubscriptionIndexes();
  // eslint-disable-next-line no-console
  console.log('MongoDB connected');
}

module.exports = { connectDb, updateSubscriptionIndexes };
