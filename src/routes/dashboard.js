const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');
const { requireAuth, requireRole } = require('../middleware/auth');

router.get('/dashboard', requireAuth, dashboardController.showDashboard);
router.get('/dashboard/thesis/:id', requireAuth, dashboardController.showThesisDetail);
router.get('/dashboard/thesis/:id/chat', requireAuth, dashboardController.showThesisChat);
router.get('/dashboard/document-templates', requireAuth, dashboardController.showDocumentTemplates);
router.get('/dashboard/profile', requireAuth, dashboardController.showProfile);
router.post('/dashboard/profile', requireAuth, dashboardController.updateProfile);
router.get('/dashboard/admin/years', requireAuth, requireRole(['admin']), dashboardController.showYearsManagement);
router.get('/dashboard/admin/upload-categories', requireAuth, requireRole(['admin']), dashboardController.showUploadCategoriesManagement);
router.get('/dashboard/admin/milestones', requireAuth, requireRole(['admin']), dashboardController.showMilestonesManagement);
router.get('/dashboard/admin/evaluation-forms', requireAuth, requireRole(['admin']), dashboardController.showEvaluationForms);
router.get('/dashboard/admin/evaluation-forms/:id', requireAuth, requireRole(['admin']), dashboardController.showEvaluationFormEditor);

module.exports = router;
