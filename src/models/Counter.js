const mongoose = require('mongoose');

const counterSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 },
});

const Counter = mongoose.model('Counter', counterSchema);

async function nextSeq(name, session) {
  const opts = { new: true, upsert: true, setDefaultsOnInsert: true };
  if (session) opts.session = session;
  const doc = await Counter.findByIdAndUpdate(_idFix(name), { $inc: { seq: 1 } }, opts);
  return doc.seq;
}

function _idFix(name) {
  return name;
}

async function nextStudentCode(session) {
  const seq = await nextSeq('studentCode', session);
  return `STU-${String(seq).padStart(6, '0')}`;
}

async function nextReceiptNumber(session) {
  const seq = await nextSeq('receiptNumber', session);
  return `RCP-${String(seq).padStart(8, '0')}`;
}

module.exports = { Counter, nextSeq, nextStudentCode, nextReceiptNumber };
