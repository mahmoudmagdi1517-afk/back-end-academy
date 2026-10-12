const express = require('express');
const { validate } = require('../middlewares/validate');
const { authenticate, requirePermission } = require('../middlewares/auth.middleware');
const schemas = require('../validators/schemas');
const ctrl = require('../controllers/expense.controller');

const router = express.Router();
router.use(authenticate, requirePermission('expense.manage'));

router.post('/', validate(schemas.createExpense), ctrl.createExpense);
router.get('/', ctrl.listExpenses);
router.get('/summary', ctrl.getFinancialSummary);
router.get('/:id/receipt', ctrl.getExpenseReceipt);
router.get('/:id', ctrl.getExpense);

module.exports = router;
