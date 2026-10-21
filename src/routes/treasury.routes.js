const express = require('express');
const { validate } = require('../middlewares/validate');
const { authenticate, requirePermission } = require('../middlewares/auth.middleware');
const schemas = require('../validators/schemas');
const ctrl = require('../controllers/treasury.controller');

const router = express.Router();
router.use(authenticate, requirePermission('expense.manage'));

router.get('/summary', ctrl.getSummary);
router.get('/cashboxes', ctrl.listCashboxes);
router.post('/cashboxes', validate(schemas.createCashbox), ctrl.createCashbox);
router.post('/cashboxes/:id/deposits', validate(schemas.addFunds), ctrl.addFunds);
router.get('/transactions', ctrl.listTransactions);

module.exports = router;
