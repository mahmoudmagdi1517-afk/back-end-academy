
async function withTransaction(work) {
  const mongoose = require('mongoose');
  const session = await mongoose.startSession();
  try {
    return await session.withTransaction(() => work(session));
  } finally {
    await session.endSession();
  }
}

module.exports = { withTransaction };
