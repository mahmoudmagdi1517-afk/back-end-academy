const express = require('express');
const authRoutes = require('./auth.routes');
const academicRoutes = require('./academic.routes');
const paymentRoutes = require('./payment.routes');
const sessionRoutes = require('./session.routes');
const hrRoutes = require('./hr.routes');
const expenseRoutes = require('./expense.routes');
const treasuryRoutes = require('./treasury.routes');

function mountRoutes(app) {
  app.get('/health', (_req, res) => {
    res.json({
      success: true,
      currency: process.env.CURRENCY || 'QAR',
      timezone: 'Asia/Qatar',
    });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api', academicRoutes);
  app.use('/api/payments', paymentRoutes);
  app.use('/api/expenses', expenseRoutes);
  app.use('/api/treasury', treasuryRoutes);
  app.use('/api/sessions', sessionRoutes);
  app.use('/api/hr', hrRoutes);
}

module.exports = { mountRoutes };
