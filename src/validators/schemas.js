const { Joi, objectId } = require('../middlewares/validate');
const { ROLES, EMPLOYEE_ROLES, ATTENDANCE_STATUS, SALARY_TYPE, EXPENSE_CATEGORIES } = require('../constants');
const { DateTime } = require('luxon');

const qatarDate = Joi.string()
  .pattern(/^\d{4}-\d{2}-\d{2}$/)
  .custom((value, helpers) =>
    DateTime.fromISO(value, { zone: 'Asia/Qatar' }).toISODate() === value
      ? value
      : helpers.error('date.format')
  );
const timeOfDay = Joi.string().pattern(/^([01]\d|2[0-3]):[0-5]\d$/);
const groupSchedule = Joi.object({
  _id: objectId.optional(),
  dayOfWeek: Joi.number().integer().min(1).max(7).required(),
  startTime: timeOfDay.required(),
  endTime: timeOfDay.required(),
});

const login = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(8).required(),
});

const refresh = Joi.object({
  refreshToken: Joi.string().required(),
});

const createUser = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(8).required(),
  name: Joi.string().min(2).required(),
  role: Joi.string()
    .valid(ROLES.MANAGER, ROLES.ADMIN, ROLES.TEACHER)
    .required(),
  locale: Joi.string().valid('en', 'ar').default('en'),
  employeeId: objectId.allow(null),
});

const createStudent = Joi.object({
  studentCode: Joi.string().optional(),
  name: Joi.string().required(),
  nameAr: Joi.string().allow(null, ''),
  phone: Joi.string().allow(null, ''),
  nationalId: Joi.string().allow(null, ''),
  email: Joi.string().email().allow(null, ''),
  dateOfBirth: Joi.date().iso().allow(null),
  notes: Joi.string().allow(null, ''),
});

const createCourse = Joi.object({
  code: Joi.string().required(),
  name: Joi.string().required(),
  nameAr: Joi.string().allow(null, ''),
  description: Joi.string().allow(null, ''),
  defaultPrice: Joi.number().integer().min(0).required(),
});

const updateCourse = Joi.object({
  code: Joi.string().min(1),
  name: Joi.string().min(1),
  nameAr: Joi.string().allow(null, ''),
  description: Joi.string().allow(null, ''),
  defaultPrice: Joi.number().integer().min(0),
}).min(1);

const createGroup = Joi.object({
  courseId: objectId.required(),
  name: Joi.string().required(),
  nameAr: Joi.string().allow(null, ''),
  capacity: Joi.number().integer().min(0).allow(null),
  teacherEmployeeId: objectId.allow(null),
  startDate: qatarDate.required(),
  sessionCount: Joi.number().integer().min(1).max(500).required(),
  schedules: Joi.array().items(groupSchedule).min(1).required(),
  scheduleNote: Joi.string().allow(null, ''),
});

const updateGroup = Joi.object({
  name: Joi.string().min(1),
  nameAr: Joi.string().allow(null, ''),
  capacity: Joi.number().integer().min(0).allow(null),
  teacherEmployeeId: objectId.allow(null),
  startDate: qatarDate,
  sessionCount: Joi.number().integer().min(1).max(500),
  schedules: Joi.array().items(groupSchedule).min(1),
  scheduleNote: Joi.string().allow(null, ''),
}).min(1);

const createSession = Joi.object({
  groupId: objectId.required(),
  originalDate: qatarDate.required(),
  startTime: timeOfDay.required(),
  endTime: timeOfDay.required(),
  teacherEmployeeId: objectId.allow(null),
  notes: Joi.string().allow(null, ''),
});

const subscribe = Joi.object({
  studentId: objectId.required(),
  courseId: objectId.required(),
  groupId: objectId.required(),
  price: Joi.number().integer().min(0),
  installments: Joi.array()
    .items(
      Joi.object({
        dueDate: qatarDate.required(),
        amount: Joi.number().integer().min(0).required(),
      })
    )
    .min(1),
  notes: Joi.string().allow(null, ''),
  initialPayment: Joi.object({
    amount: Joi.number().integer().min(0).required(),
    cashboxId: objectId.required(),
    method: Joi.string().default('cash'),
    notes: Joi.string().allow(null, ''),
  }),
});

const transferGroup = Joi.object({
  newGroupId: objectId.required(),
});

const modifyPlan = Joi.object({
  reason: Joi.string().min(3).required(),
  unpaidRows: Joi.array()
    .items(
      Joi.object({
        _id: objectId.optional(),
        dueDate: qatarDate.required(),
        amount: Joi.number().integer().min(0).required(),
        paidAmount: Joi.number().integer().min(0).default(0),
      })
    )
    .required(),
});

const createPayment = Joi.object({
  subscriptionId: objectId.required(),
  cashboxId: objectId.required(),
  amount: Joi.number().integer().min(1).required(),
  allocations: Joi.array()
    .items(
      Joi.object({
        installmentId: objectId.required(),
        amount: Joi.number().integer().min(1).required(),
      })
    )
    .min(1),
  method: Joi.string().default('cash'),
  notes: Joi.string().allow(null, ''),
  paidAt: Joi.date().iso(),
});

const payPayroll = Joi.object({
  cashboxId: objectId.required(),
});

const createExpense = Joi.object({
  cashboxId: objectId.required(),
  category: Joi.string().valid(...EXPENSE_CATEGORIES).required(),
  description: Joi.string().min(2).max(200).required(),
  amount: Joi.number().integer().min(1).required(),
  spentAt: Joi.date().iso().required(),
  notes: Joi.string().allow(null, '').max(1000),
  receipt: Joi.object({
    mimeType: Joi.string().valid('image/jpeg', 'image/png', 'image/webp').required(),
    data: Joi.string().base64().max(2_000_000).required(),
  }).optional(),
});

const reversePayment = Joi.object({
  reason: Joi.string().allow(null, ''),
});

const postponeSession = Joi.object({
  toDate: qatarDate.required(),
  reason: Joi.string().allow(null, ''),
});

const cancelSession = Joi.object({
  reason: Joi.string().allow(null, ''),
});

const upsertAttendance = Joi.object({
  studentId: objectId.required(),
  status: Joi.string()
    .valid(...Object.values(ATTENDANCE_STATUS))
    .required(),
  note: Joi.string().allow(null, ''),
});

const attendanceBatch = Joi.object({
  attendance: Joi.array()
    .items(
      Joi.object({
        studentId: objectId.required(),
        status: Joi.string()
          .valid(...Object.values(ATTENDANCE_STATUS))
          .allow(null)
          .default(null),
        note: Joi.string().allow(null, ''),
      })
    )
    .unique('studentId')
    .required(),
});

const createMakeup = Joi.object({
  studentId: objectId.required(),
  groupId: objectId.required(),
  sourceSessionId: objectId.allow(null),
  scheduledDate: qatarDate.required(),
  notes: Joi.string().allow(null, ''),
});

const createEmployee = Joi.object({
  employeeCode: Joi.string().optional(),
  name: Joi.string().required(),
  nameAr: Joi.string().allow(null, ''),
  phone: Joi.string().allow(null, ''),
  email: Joi.string().email().allow(null, ''),
  hireDate: qatarDate.allow(null),
  role: Joi.string().valid(...Object.values(EMPLOYEE_ROLES)),
  isTeacher: Joi.boolean(),
  specialties: Joi.array().items(Joi.string()),
  notes: Joi.string().allow(null, ''),
});

const updateEmployee = Joi.object({
  name: Joi.string().min(1),
  nameAr: Joi.string().allow(null, ''),
  phone: Joi.string().allow(null, ''),
  email: Joi.string().email().allow(null, ''),
  hireDate: qatarDate.allow(null),
  role: Joi.string().valid(...Object.values(EMPLOYEE_ROLES)),
  specialties: Joi.array().items(Joi.string()),
  notes: Joi.string().allow(null, ''),
}).min(1);

const salaryConfig = Joi.object({
  type: Joi.string()
    .valid(...Object.values(SALARY_TYPE))
    .required(),
  fixedMonthly: Joi.number().integer().min(0).default(0),
  sessionRate: Joi.number().integer().min(0).default(0),
  effectiveFrom: qatarDate.required(),
  notes: Joi.string().allow(null, ''),
});

const payrollCalc = Joi.object({
  year: Joi.number().integer().min(2020).required(),
  month: Joi.number().integer().min(1).max(12).required(),
});

const createLeave = Joi.object({
  startDate: qatarDate.required(),
  endDate: qatarDate.required(),
  reason: Joi.string().allow(null, ''),
});

const createAdjustment = Joi.object({
  kind: Joi.string().valid('bonus', 'deduction', 'advance').required(),
  amount: Joi.number().integer().min(1).required(),
  reason: Joi.string().required(),
});

const createCashbox = Joi.object({
  name: Joi.string().min(2).max(100).required(),
  type: Joi.string().valid('cash', 'bank').required(),
  openingBalance: Joi.number().integer().min(0).default(0),
});

const addFunds = Joi.object({
  amount: Joi.number().integer().min(1).required(),
  source: Joi.string().trim().min(2).max(200).required(),
});

module.exports = {
  login,
  refresh,
  createUser,
  createStudent,
  createCourse,
  updateCourse,
  createGroup,
  updateGroup,
  subscribe,
  transferGroup,
  modifyPlan,
  createPayment,
  createExpense,
  createCashbox,
  addFunds,
  reversePayment,
  createSession,
  postponeSession,
  cancelSession,
  upsertAttendance,
  attendanceBatch,
  createMakeup,
  createEmployee,
  updateEmployee,
  salaryConfig,
  payrollCalc,
  payPayroll,
  createLeave,
  createAdjustment,
};
