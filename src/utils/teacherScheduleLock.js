const { randomUUID } = require('crypto');
const { Employee } = require('../models/Employee');
const { AppError } = require('./AppError');

const LOCK_LEASE_MS = 60 * 1000;
const LOCK_WAIT_MS = 10 * 1000;
const LOCK_RETRY_MS = 100;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withTeacherScheduleLocks(teacherIds, work) {
  const ids = [...new Set((teacherIds || []).filter(Boolean).map(String))].sort();
  const locks = [];

  try {
    for (const teacherId of ids) {
      const exists = await Employee.exists({
        _id: teacherId,
      });
      if (!exists) throw new AppError('employee.notFound', 404);

      const token = randomUUID();
      const waitUntil = Date.now() + LOCK_WAIT_MS;
      let acquired = false;
      while (!acquired && Date.now() < waitUntil) {
        const now = new Date();
        const lock = await Employee.findOneAndUpdate(
          {
            _id: teacherId,
            $or: [
              { scheduleLockUntil: null },
              { scheduleLockUntil: { $lte: now } },
            ],
          },
          {
            $set: {
              scheduleLockToken: token,
              scheduleLockUntil: new Date(now.getTime() + LOCK_LEASE_MS),
            },
          },
          { new: true }
        ).select('_id');

        if (lock) {
          locks.push({ teacherId, token });
          acquired = true;
        } else {
          await delay(LOCK_RETRY_MS);
        }
      }

      if (!acquired) throw new AppError('teacher.scheduleBusy', 409);
    }

    return await work();
  } finally {
    for (const lock of locks.reverse()) {
      await Employee.updateOne(
        { _id: lock.teacherId, scheduleLockToken: lock.token },
        { $unset: { scheduleLockToken: 1, scheduleLockUntil: 1 } }
      );
    }
  }
}

module.exports = { withTeacherScheduleLocks };
