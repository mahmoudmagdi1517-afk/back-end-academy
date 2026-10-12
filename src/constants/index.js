const ROLES = Object.freeze({
  OWNER: 'owner',
  MANAGER: 'manager',
  ADMIN: 'admin',
  TEACHER: 'teacher',
});

const EMPLOYEE_ROLES = Object.freeze({
  INSTRUCTOR: 'instructor',
  STAFF: 'staff',
  MANAGER: 'manager',
});

const LOCALES = Object.freeze(['en', 'ar']);
const DEFAULT_LOCALE = 'en';
const TIMEZONE = 'Asia/Qatar';
const CURRENCY = 'QAR';

const SUBSCRIPTION_STATUS = Object.freeze({
  ACTIVE: 'active',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  TRANSFERRED: 'transferred',
});

const INSTALLMENT_STATUS = Object.freeze({
  PENDING: 'pending',
  PARTIAL: 'partial',
  PAID: 'paid',
  OVERDUE: 'overdue',
});

const SESSION_STATUS = Object.freeze({
  SCHEDULED: 'scheduled',
  POSTPONED: 'postponed',
  CANCELLED: 'cancelled',
  COMPLETED: 'completed',
});

const ATTENDANCE_STATUS = Object.freeze({
  PRESENT: 'present',
  ABSENT: 'absent',
  LATE: 'late',
  EXCUSED: 'excused',
});

const MAKEUP_PRICING = Object.freeze({
  FREE: 'free',
  PAID: 'paid',
});

const PAYMENT_STATUS = Object.freeze({
  COMPLETED: 'completed',
  REVERSED: 'reversed',
});

const EXPENSE_CATEGORIES = Object.freeze([
  'cleaning',
  'rent',
  'utilities',
  'supplies',
  'maintenance',
  'internet',
  'marketing',
  'transport',
  'other',
]);

const SALARY_TYPE = Object.freeze({
  FIXED_MONTHLY: 'fixed_monthly',
  PER_SESSION: 'per_session',
  MIXED: 'mixed',
  OTHER: 'other',
});

const PAYROLL_STATUS = Object.freeze({
  DRAFT: 'draft',
  CALCULATED: 'calculated',
  REVIEWED: 'reviewed',
  APPROVED: 'approved',
  PAID: 'paid',
});

const LEAVE_STATUS = Object.freeze({
  APPROVED: 'approved',
  CANCELLED: 'cancelled',
});

const NOTIFICATION_TYPE = Object.freeze({
  PAYMENT_DUE_SOON: 'PAYMENT_DUE_SOON',
  PAYMENT_DUE: 'PAYMENT_DUE',
  PAYMENT_OVERDUE: 'PAYMENT_OVERDUE',
  ATTENDANCE_MISSING: 'ATTENDANCE_MISSING',
  SESSION_LOG_MISSING: 'SESSION_LOG_MISSING',
  ATTENDANCE_REVIEW: 'ATTENDANCE_REVIEW',
});

const PERMISSIONS = Object.freeze({
  'session.postpone': [ROLES.MANAGER, ROLES.OWNER],
  'session.cancel': [ROLES.MANAGER, ROLES.OWNER],
  'session.close': [ROLES.TEACHER, ROLES.MANAGER, ROLES.OWNER],
  'attendance.record': [ROLES.TEACHER, ROLES.MANAGER, ROLES.OWNER],
  'attendance.editAfterComplete': [ROLES.MANAGER, ROLES.OWNER],
  'makeup.create': [ROLES.MANAGER, ROLES.OWNER],
  'installment.modify': [ROLES.MANAGER, ROLES.OWNER],
  'payment.manage': [ROLES.ADMIN, ROLES.MANAGER, ROLES.OWNER],
  'expense.manage': [ROLES.MANAGER, ROLES.OWNER],
  'finance.access': [ROLES.ADMIN, ROLES.MANAGER, ROLES.OWNER],
  'hr.access': [ROLES.MANAGER, ROLES.OWNER],
  'payroll.access': [ROLES.MANAGER, ROLES.OWNER],
  'student.manage': [ROLES.ADMIN, ROLES.MANAGER, ROLES.OWNER],
  'course.manage': [ROLES.ADMIN, ROLES.MANAGER, ROLES.OWNER],
  'group.manage': [ROLES.ADMIN, ROLES.MANAGER, ROLES.OWNER],
  'user.manage': [ROLES.OWNER, ROLES.MANAGER],
});

module.exports = {
  ROLES,
  EMPLOYEE_ROLES,
  LOCALES,
  DEFAULT_LOCALE,
  TIMEZONE,
  CURRENCY,
  SUBSCRIPTION_STATUS,
  INSTALLMENT_STATUS,
  SESSION_STATUS,
  ATTENDANCE_STATUS,
  MAKEUP_PRICING,
  PAYMENT_STATUS,
  EXPENSE_CATEGORIES,
  SALARY_TYPE,
  PAYROLL_STATUS,
  LEAVE_STATUS,
  NOTIFICATION_TYPE,
  PERMISSIONS,
};
