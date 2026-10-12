const mongoose = require('mongoose');

const courseSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    nameAr: { type: String, default: null, trim: true },
    description: { type: String, default: null },
    defaultPrice: { type: Number, required: true, min: 0 }, // fils
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

const Course = mongoose.model('Course', courseSchema);

module.exports = { Course };
