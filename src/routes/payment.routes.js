const express = require('express');
const { validate } = require('../middlewares/validate');
const { authenticate, requirePermission } = require('../middlewares/auth.middleware');
const schemas = require('../validators/schemas');
const ctrl = require('../controllers/payment.controller');

const router = express.Router();
router.use(authenticate);
router.use(requirePermission('payment.manage'));

router.post('/', validate(schemas.createPayment), ctrl.createPayment);
router.get('/', ctrl.listPayments);
router.get('/:id', ctrl.getPayment);
router.post('/:id/reverse', validate(schemas.reversePayment), ctrl.reversePayment);

module.exports = router;
