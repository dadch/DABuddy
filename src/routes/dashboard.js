const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');
const { requireAuth } = require('../middleware/auth');

router.get('/dashboard', requireAuth, dashboardController.showDashboard);
router.get('/dashboard/thesis/:id', requireAuth, dashboardController.showThesisDetail);
router.get('/dashboard/admin/due-dates', requireAuth, dashboardController.showDueDatesManagement);

module.exports = router;