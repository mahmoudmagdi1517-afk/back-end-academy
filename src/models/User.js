const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { ROLES, DEFAULT_LOCALE, LOCALES } = require('../constants');

const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    name: { type: String, required: true, trim: true },
    role: {
      type: String,
      enum: Object.values(ROLES),
      required: true,
    },
    locale: { type: String, enum: LOCALES, default: DEFAULT_LOCALE },
    isActive: { type: Boolean, default: true },
    employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', default: null },
  },
  { timestamps: true }
);

userSchema.methods.comparePassword = function comparePassword(plain) {
  return bcrypt.compare(plain, this.passwordHash);
};

userSchema.statics.hashPassword = async function hashPassword(plain) {
  return bcrypt.hash(plain, 12);
};

const User = mongoose.model('User', userSchema);

module.exports = { User };
