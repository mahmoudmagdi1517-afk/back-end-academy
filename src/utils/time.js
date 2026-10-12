const { DateTime } = require('luxon');
const { TIMEZONE } = require('../constants');

function nowUtc() {
  return new Date();
}

function qatarNow() {
  return DateTime.now().setZone(TIMEZONE);
}

/** Calendar date YYYY-MM-DD in Asia/Qatar */
function qatarBusinessDate(date = new Date()) {
  return DateTime.fromJSDate(date instanceof Date ? date : new Date(date), { zone: 'utc' })
    .setZone(TIMEZONE)
    .toISODate();
}

function qatarToday() {
  return qatarNow().toISODate();
}

function parseQatarDate(isoDate) {
  const dt = DateTime.fromISO(isoDate, { zone: TIMEZONE });
  if (!dt.isValid) {
    throw new Error(`Invalid Qatar date: ${isoDate}`);
  }
  return dt;
}

function qatarDateTimeUtc(isoDate, time) {
  const dateTime = DateTime.fromISO(`${isoDate}T${time}`, { zone: TIMEZONE });
  if (!dateTime.isValid || dateTime.toISODate() !== isoDate) {
    throw new Error(`Invalid Qatar date/time: ${isoDate} ${time}`);
  }
  return dateTime.toUTC().toJSDate();
}

/** Start of Qatar calendar day as UTC Date */
function qatarDayStartUtc(isoDate) {
  return parseQatarDate(isoDate).startOf('day').toUTC().toJSDate();
}

/** End exclusive of Qatar calendar day as UTC Date */
function qatarDayEndExclusiveUtc(isoDate) {
  return parseQatarDate(isoDate).plus({ days: 1 }).startOf('day').toUTC().toJSDate();
}

function addQatarDays(isoDate, days) {
  return parseQatarDate(isoDate).plus({ days }).toISODate();
}

function qatarYearMonth(date = new Date()) {
  const dt = DateTime.fromJSDate(date instanceof Date ? date : new Date(date), { zone: 'utc' }).setZone(
    TIMEZONE
  );
  return { year: dt.year, month: dt.month };
}

module.exports = {
  nowUtc,
  qatarNow,
  qatarBusinessDate,
  qatarToday,
  parseQatarDate,
  qatarDateTimeUtc,
  qatarDayStartUtc,
  qatarDayEndExclusiveUtc,
  addQatarDays,
  qatarYearMonth,
};
